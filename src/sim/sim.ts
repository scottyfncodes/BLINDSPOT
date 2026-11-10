/**
 * One night at Calder Central.
 *
 * Tick order (fixed 60 Hz):
 *  1. player movement and collision
 *  2. people: plans, walking, separation
 *  3. cameras: power, sweep, vigilance
 *  4. perception: every person and camera against the player
 *  5. suspicion -> confrontations, flags, alert
 *  6. security brains
 *  7. theft discovery, Pell's belt check
 *  8. intel from what the player has watched
 *  9. channelled actions (cutting, copying), end of night
 * Events go out on the bus and are flushed by the host after the tick.
 */
import { EventBus } from '../core/events';
import { angleDelta, clamp, damp, dist, wrapAngle, type Vec2 } from '../core/math';
import { Rng } from '../core/rng';
import { COPY_SECONDS, NIGHT_MAIL, PLAYER_START, PRICES, TIPS, stationCast, stationPeople, stationWorld } from '../content/station';
import { ACTIVITY } from './agentTypes';
import { GUARD_RUN, GUARD_WALK, isSecurity, makeAgent, moveAgents, runPlan, walkTo, type Agent } from './agents';
import { at, NIGHT_LENGTH } from './clock';
import { fact, type Fact } from './intel';
import { Nav } from './nav';
import { attentionOf, coneOf, NO_CONDUCT, suspicionRate, updateGlance, visibility, type Conduct } from './perception';
import type { Access, CameraDef, JunctionDef, Look } from './types';
import { World } from './world';

export const PLAYER_R = 0.32;
export const SPEED = { sneak: 1.5, walk: 2.7, run: 5.2 };

export interface Intent {
  /** Stick, each axis -1..1; magnitude picks sneak / walk / run. */
  mx: number;
  my: number;
  hood: boolean;
}

export type Gait = 'still' | 'sneak' | 'walk' | 'run';
export type CardState = 'none' | 'original';
export type CloneState = 'none' | 'copying' | 'ready' | 'held' | 'revoked';

export interface Player {
  pos: Vec2;
  prev: Vec2;
  vel: Vec2;
  facing: number;
  prevFacing: number;
  gait: Gait;
  look: Look;
  hoodAt: number;
  cash: number;
  ticket: boolean;
  card: CardState;
  clone: CloneState;
  cloneReadyAt: number;
  revoked: boolean;
  /** Items lifted tonight. */
  takes: Array<{ from: string; label: string; value: number }>;
  gateCrossAt: number;
  tamperUntil: number;
  /** Which side of the gateline she was on last tick. */
  paidSide: boolean;
}

export interface CameraRt {
  def: CameraDef;
  online: boolean;
  facing: number;
  prevFacing: number;
  suspicion: number;
  vigilance: number;
  cooldownUntil: number;
  /** How well it sees the player this tick, 0..1. */
  sees: number;
  /** Seconds of learning so far. */
  watched: number;
}

export interface JunctionRt {
  def: JunctionDef;
  cut: boolean;
  cuts: number;
  repairAt: number;
  repairer: string | null;
  guarded: boolean;
}

export interface Description { look: Look; at: number; source: string }

export interface Channel { kind: 'cut' | 'inspect' | 'copy-wait'; target: string; until: number; started: number }

export type EndReason = 'departed' | 'caught' | 'left';

export interface NightStats {
  confrontations: number;
  flags: number;
  discoveries: number;
  pursuits: number;
  cuts: number;
  lifts: number;
  fumbles: number;
}

export interface SimEvents extends Record<string, unknown> {
  toast: { text: string; tone: 'info' | 'good' | 'bad' };
  shout: { id: string; text: string };
  flag: { camera: string };
  alert: { level: number };
  fact: { id: string; status: string };
  sfx: { name: string };
  end: { reason: EndReason };
}

export interface LiftSetup {
  target: string;
  mode: 'lift' | 'plant';
  start: number;
  label: 'good' | 'risky' | 'bad';
  watchers: number;
  cameras: number;
  glanceMul: number;
  aware: number;
  stir: number;
  crowdCover: boolean;
  pocket: Agent['spec']['pocket'];
  item: 'cash' | 'phone' | 'card';
}

export interface Action { id: string; label: string; detail?: string; at: Vec2; tone?: 'good' | 'risky' | 'bad' }

/** What one night carries forward into the next, and into the night report. */
export interface Carry { cash: number; heat: number; boxCutsA: number; boxCutsB: number }

export class Sim {
  readonly world: World;
  readonly nav: Nav;
  readonly rng: Rng;
  readonly bus = new EventBus<SimEvents>();
  t = 0;
  tick = 0;
  agents: Agent[] = [];
  player: Player;
  cameras: CameraRt[];
  junctions: JunctionRt[];
  facts = new Map<string, Fact>();
  alert = 0;
  private alertQuietAt = 0;
  description: Description | null = null;
  stats: NightStats = { confrontations: 0, flags: 0, discoveries: 0, pursuits: 0, cuts: 0, lifts: 0, fumbles: 0 };
  ended: EndReason | null = null;
  channel: Channel | null = null;
  conduct: Conduct = { ...NO_CONDUCT };
  /** The strongest gaze on the player this tick, 0..1, for the HUD. */
  exposure = 0;
  /** People who could describe Wren tonight. */
  witnesses = new Set<string>();
  readonly seed: number;
  readonly carry: Carry;

  constructor(seed = 0x1c3a1, carry: Carry = { cash: 6, heat: 0, boxCutsA: 0, boxCutsB: 0 }) {
    this.seed = seed;
    this.carry = carry;
    this.rng = new Rng(seed);
    this.world = new World(stationWorld());
    this.nav = new Nav(this.world);
    const specs = [...stationCast(), ...stationPeople(seed ^ 0x9e37)];
    this.agents = specs.map((s) => makeAgent(s, this.world));
    for (const a of this.agents) {
      a.nextGlance = this.rng.range(1, 9);
      if (a.spec.spawnAt <= 0) a.live = true;
    }
    this.player = {
      pos: { ...PLAYER_START }, prev: { ...PLAYER_START }, vel: { x: 0, y: 0 }, facing: 0, prevFacing: 0,
      gait: 'still', look: { hood: false }, hoodAt: -99, cash: carry.cash, ticket: false,
      card: 'none', clone: 'none', cloneReadyAt: 0, revoked: false, takes: [], gateCrossAt: -99, tamperUntil: -99, paidSide: false,
    };
    this.cameras = this.world.def.cameras.map((def) => ({
      def, online: true, facing: def.facing, prevFacing: def.facing, suspicion: 0,
      // Heat from earlier nights keeps the network watchful.
      vigilance: clamp(carry.heat / 120, 0, 0.6), cooldownUntil: 0, sees: 0, watched: 0,
    }));
    this.junctions = this.world.def.junctions.map((def) => ({ def, cut: false, cuts: 0, repairAt: 0, repairer: null, guarded: false }));
    this.buildFacts();
  }

  private buildFacts(): void {
    const F = (f: Fact) => this.facts.set(f.id, f);
    F(fact('pell', 'person', 'The courier', 'Somebody carries the coach card onto the Night Mail. Find them and watch them.'));
    for (const c of this.world.def.cameras) F(fact(`cam-${c.id}`, 'camera', `Camera ${c.id}`, `${c.label}. Watch it through one full sweep to learn its gaps.`));
    F(fact('route-kowalski', 'route', "Kowalski's round", 'The concourse guard. Watch him walk his round.'));
    F(fact('route-ade', 'route', "Ade's round", 'The platform guard. Watch him walk his round.'));
    for (const j of this.world.def.junctions) F(fact(`circuit-${j.id}`, 'circuit', j.label, 'A junction box. Something in the station runs off it.'));
    for (const tip of TIPS) F(fact(tip.id, 'tip', 'From Dee', tip.text));
    F(fact('clone', 'card', 'A copy of the coach card', 'Dee has a skimmer. Bring her the card and $20.'));
    F(fact('reader', 'card', 'The coach door reader', 'Nobody knows yet whether a copied card opens the Halvard coach.'));
    F(fact('returned', 'card', 'Pell never knew', 'If the card is back on his belt when he stands up, nobody revokes it.'));
  }

  // -------------------------------------------------------------------------

  agent(id: string): Agent | undefined { return this.agents.find((a) => a.id === id); }

  playerAccess(): Set<Access> {
    const s = new Set<Access>();
    const live = !this.player.revoked && (this.player.card === 'original' || this.player.clone === 'held');
    if (live) { s.add('staff'); s.add('coach'); }
    return s;
  }

  private setFact(id: string, status: Fact['status'], text?: string): void {
    const f = this.facts.get(id);
    if (!f || f.status === status) return;
    f.status = status;
    f.progress = status === 'observing' ? f.progress : 1;
    if (text) f.text = text;
    if (status !== 'observing') f.at = this.t;
    this.bus.emit('fact', { id, status });
  }

  private raiseAlert(level: number): void {
    this.alertQuietAt = this.t;
    if (level > this.alert) {
      this.alert = level;
      this.bus.emit('alert', { level });
    }
  }

  private record(look: Look, source: string): void {
    this.description = { look: { ...look }, at: this.t, source };
  }

  // -------------------------------------------------------------------------

  step(dt: number, intent: Intent): void {
    if (this.ended) return;
    this.tick++;
    this.t += dt;
    const t = this.t;
    for (const a of this.agents) {
      a.prev.x = a.pos.x; a.prev.y = a.pos.y; a.prevFacing = a.facing;
      if (!a.live && !a.gone && t >= a.spec.spawnAt) {
        a.live = true;
        a.stepStarted = t;
      }
    }
    this.stepPlayer(dt, intent);
    this.stepPeople(dt);
    this.stepCameras(dt);
    this.stepPerception(dt);
    this.stepSecurity(dt);
    this.stepTheft();
    this.stepIntel(dt);
    this.stepChannels();
    this.stepAlert();
    if (!this.ended && t >= NIGHT_LENGTH) this.end('departed');
  }

  private stepPlayer(dt: number, intent: Intent): void {
    const p = this.player, t = this.t;
    p.prev.x = p.pos.x; p.prev.y = p.pos.y; p.prevFacing = p.facing;
    if (intent.hood && t - p.hoodAt > 1.5) {
      p.look.hood = !p.look.hood;
      p.hoodAt = t;
      this.bus.emit('sfx', { name: 'hood' });
    }
    let mx = intent.mx, my = intent.my;
    const mag = Math.min(1, Math.hypot(mx, my));
    if (this.channel && this.channel.kind !== 'copy-wait') { mx = 0; my = 0; }
    const m = this.channel && this.channel.kind !== 'copy-wait' ? 0 : mag;
    const gait: Gait = m < 0.08 ? 'still' : m < 0.45 ? 'sneak' : m < 0.92 ? 'walk' : 'run';
    const speed = gait === 'still' ? 0 : SPEED[gait];
    const dir = mag > 1e-6 ? { x: mx / mag, y: my / mag } : { x: 0, y: 0 };
    p.vel.x = damp(p.vel.x, dir.x * speed, 0.05, dt);
    p.vel.y = damp(p.vel.y, dir.y * speed, 0.05, dt);
    p.gait = gait;
    p.pos.x += p.vel.x * dt;
    p.pos.y += p.vel.y * dt;
    this.world.collide(p.pos, PLAYER_R, t, this.playerAccess());
    if (Math.hypot(p.vel.x, p.vel.y) > 0.2) p.facing = wrapAngle(p.facing + clamp(angleDelta(p.facing, Math.atan2(p.vel.y, p.vel.x)), -10 * dt, 10 * dt));
    // Crossing the gateline without a ticket is fare dodging, and it shows.
    const paid = p.pos.y > 48;
    const inConcourseSpan = p.pos.x > 5 && p.pos.x < 100;
    if (inConcourseSpan && paid !== p.paidSide && Math.abs(p.pos.y - 48) < 1.5) {
      if (!p.ticket) p.gateCrossAt = t;
    }
    p.paidSide = paid;
    // Running makes noise: people nearby look over.
    if (gait === 'run') {
      for (const a of this.agents) {
        if (!a.live || a.glance > 0 || a.stir > 0) continue;
        if (dist(a.pos, p.pos) < 6 && this.rng.chance(1.5 * dt)) {
          a.stir = 0.3;
          a.glanceDir = Math.atan2(p.pos.y - a.pos.y, p.pos.x - a.pos.x);
        }
      }
    }
  }

  private stepPeople(dt: number): void {
    const t = this.t;
    for (const a of this.agents) {
      if (!a.live) continue;
      if (isSecurity(a) && a.mode !== 'routine') continue; // security brain moves them
      const before = a.stepIdx;
      const ev = runPlan(a, t, dt, this.world, this.nav, this.rng);
      if (ev === 'stepped' && a.id === 'pell') this.pellStepped(before);
      if (ev === 'left' && a.id === 'pell' && a.item?.kind === 'card') this.bus.emit('toast', { text: 'Pell boards the Halvard coach.', tone: 'info' });
    }
    moveAgents(this.agents, t, dt, this.world);
  }

  /** Pell gets up from his bench at 23:31 and pats his belt. */
  private pellStepped(before: number): void {
    const pell = this.agent('pell')!;
    const step = pell.spec.plan[before];
    if (step.do !== 'act' || step.act !== 'read') return;
    pell.stir = 0.3;
    if (!pell.item) {
      pell.discovered = true;
      this.stats.discoveries++;
      this.player.revoked = true;
      if (this.player.clone !== 'none') this.player.clone = 'revoked';
      this.bus.emit('shout', { id: 'pell', text: 'My card. Where is my card?' });
      this.bus.emit('toast', { text: 'Pell found his card missing. Halvard will cancel it.', tone: 'bad' });
      this.setFact('returned', 'dead', 'Pell patted his belt at 23:31 and the card was gone. Halvard cancelled it, and every copy with it.');
      if (this.facts.get('clone')!.status === 'confirmed') this.setFact('clone', 'dead', 'Cancelled when Pell reported the card missing.');
      this.raiseAlert(1);
      if (t2(pell.lastSaw, this.t) < 45) { this.record(pell.sawLook ?? this.player.look, 'Pell'); this.witnesses.add('pell'); }
    } else if (pell.robbedAt >= 0) {
      this.setFact('returned', 'confirmed', 'The card was back on his belt when he stood up. Nothing gets cancelled.');
    }
  }

  private stepCameras(dt: number): void {
    const t = this.t;
    for (const j of this.junctions) {
      if (j.cut && t >= j.repairAt && !j.repairer) this.dispatchRepair(j);
    }
    for (const c of this.cameras) {
      c.prevFacing = c.facing;
      const j = this.junctions.find((x) => x.def.circuit === c.def.circuit)!;
      c.online = !j.cut;
      c.vigilance = Math.max(0, c.vigilance - dt * 0.004);
      const d = c.def;
      const phase = ((t / d.period) + d.phase) % 1;
      c.facing = d.facing + Math.sin(phase * Math.PI * 2) * d.sweep * (1 + 0.6 * c.vigilance);
    }
  }

  private crowdAround(p: Vec2): number {
    let n = 0;
    for (const a of this.agents) if (a.live && !isSecurity(a) && dist(a.pos, p) < 2.2) n++;
    return n;
  }

  private stepPerception(dt: number): void {
    const t = this.t, p = this.player;
    const zone = this.world.zoneAt(p.pos);
    const d0 = this.description;
    const stale = d0 && this.alert < 2 && t - d0.at > 150;
    if (stale) this.description = null;
    const c: Conduct = {
      running: p.gait === 'run',
      sneaking: p.gait === 'sneak',
      restricted: !!zone?.restricted,
      fareDodge: t - p.gateCrossAt < 4,
      tampering: t < p.tamperUntil || (!!this.channel && this.channel.kind !== 'copy-wait'),
      hoodFlip: t - p.hoodAt < 2,
      matches: !!this.description && this.description.look.hood === p.look.hood,
    };
    this.conduct = c;
    const crowd = this.crowdAround(p.pos);
    let exposure = 0;

    for (const a of this.agents) {
      if (!a.live) continue;
      const d = dist(a.pos, p.pos);
      const toward = a.suspicion > 30 && d < 12 ? Math.atan2(p.pos.y - a.pos.y, p.pos.x - a.pos.x) : null;
      updateGlance(a, dt, this.rng, toward);
      if (d > 14) { a.suspicion = Math.max(0, a.suspicion - (isSecurity(a) ? 3 : 6) * dt); a.tailed = 0; continue; }
      const { half, range } = coneOf(a);
      const vis = visibility(this.world, t, a.pos, a.facing, half, range, p.pos, crowd, c.sneaking, a.activity !== 'sleep');
      const attn = attentionOf(a, t, this.alert);
      // Staying close to someone for a while is tailing them, and they notice.
      if (d < 2.6 && p.gait !== 'still' && !isSecurity(a)) a.tailed += dt; else a.tailed = Math.max(0, a.tailed - dt * 0.5);
      const victim = a.discovered && a.sawLook !== null && a.sawLook.hood === p.look.hood;
      if (vis > 0.05 && attn > 0.3) {
        a.lastSaw = t;
        a.sawLook = { ...p.look };
        a.sawPos = { x: p.pos.x, y: p.pos.y };
        exposure = Math.max(exposure, vis * attn);
      }
      const rate = suspicionRate(a, attn, vis, d, c, this.alert, victim);
      if (rate > 0) a.suspicion = Math.min(110, a.suspicion + rate * dt);
      else a.suspicion = Math.max(0, a.suspicion - (isSecurity(a) ? 3 : 6) * dt);
      if (!isSecurity(a) && a.suspicion >= 100 && !a.confronted) this.confront(a);
    }

    for (const cam of this.cameras) {
      cam.sees = 0;
      if (!cam.online) { cam.suspicion = Math.max(0, cam.suspicion - 10 * dt); continue; }
      const def = cam.def;
      const vis = visibility(this.world, t, def, cam.facing, def.half, def.range * (1 + 0.15 * cam.vigilance), p.pos, crowd, c.sneaking, false);
      cam.sees = vis;
      if (vis > 0) exposure = Math.max(exposure, vis * 0.9);
      const rate = suspicionRate(CAMERA_EYE, 1 + 0.22 * cam.vigilance, vis, dist(def, p.pos), c, this.alert, false);
      if (rate > 0) cam.suspicion = Math.min(110, cam.suspicion + rate * dt);
      else cam.suspicion = Math.max(0, cam.suspicion - 4 * dt);
      if (cam.suspicion >= 100 && t >= cam.cooldownUntil) this.flag(cam);
    }
    this.exposure = exposure;
  }

  private confront(a: Agent): void {
    a.confronted = true;
    a.suspicion = 70;
    this.stats.confrontations++;
    this.witnesses.add(a.id);
    const lines = ['Hey. What are you doing?', 'Excuse me. Security?', 'Can somebody help? This one.', 'Stay away from me.'];
    this.bus.emit('shout', { id: a.id, text: this.rng.pick(lines) });
    this.record(a.sawLook ?? this.player.look, a.spec.name);
    this.raiseAlert(1);
    this.dispatch(this.player.pos, 1, 'respond');
  }

  private flag(cam: CameraRt): void {
    cam.cooldownUntil = this.t + 20;
    cam.suspicion = 40;
    cam.vigilance = Math.min(1, cam.vigilance + 0.4);
    this.stats.flags++;
    this.record(this.player.look, `camera ${cam.def.id}`);
    this.bus.emit('flag', { camera: cam.def.id });
    this.bus.emit('toast', { text: `LATTICE flagged you on camera ${cam.def.id}. Security is on the way.`, tone: 'bad' });
    // A camera that sees you proves a bought tip wrong.
    if (cam.def.id === 'P2' && this.facts.get('tip-p2-dead')!.status === 'rumoured') {
      this.setFact('tip-p2-dead', 'false', 'Dee lied. Camera P2 is live. It flagged you.');
    }
    this.raiseAlert(2);
    this.dispatch(this.player.pos, 2, 'respond');
  }

  /** Send the nearest free guards to a point. */
  private dispatch(to: Vec2, count: number, mode: 'respond' | 'repair'): Agent[] {
    const free = this.agents
      .filter((a) => a.live && a.spec.role === 'guard' && a.mode !== 'pursue' && a.mode !== 'repair' && a.mode !== 'guard-box')
      .sort((a, b) => dist(a.pos, to) - dist(b.pos, to))
      .slice(0, count);
    for (const g of free) {
      g.mode = mode;
      g.target = { x: to.x, y: to.y };
      g.path = null; g.pathGoal = null;
      g.modeUntil = this.t + 40;
    }
    return free;
  }

  private dispatchRepair(j: JunctionRt): void {
    const pt = { x: j.def.x, y: j.def.y + (j.def.id === 'A' ? 1.2 : 0) };
    const sent = this.dispatch(pt, 1, 'repair');
    if (sent.length) {
      j.repairer = sent[0].id;
      this.bus.emit('toast', { text: `${sent[0].spec.name} is going to look at the junction box.`, tone: 'info' });
    } else j.repairAt = this.t + 5;
  }

  private stepSecurity(dt: number): void {
    const t = this.t, p = this.player;
    for (const g of this.agents) {
      if (!g.live || !isSecurity(g)) continue;
      const seesNow = g.lastSaw === t;
      // Brandt does not leave the coach door for long.
      if (g.spec.role === 'escort') {
        if (g.suspicion >= 100 && seesNow && dist(g.pos, p.pos) < 7) {
          if (g.mode !== 'pursue') { this.stats.pursuits++; this.bus.emit('shout', { id: g.id, text: 'You. Stop there.' }); }
          g.mode = 'pursue';
        }
        if (g.mode === 'pursue') {
          const home = this.world.poi('coach-post');
          if (!seesNow || dist(g.pos, home) > 10) { g.mode = 'routine'; g.path = null; g.pathGoal = null; }
          else this.chase(g, dt);
        }
        continue;
      }
      // A guard who sees you with cause comes for you.
      if (seesNow && g.suspicion >= 100 && g.mode !== 'pursue' && g.mode !== 'guard-box') {
        g.mode = 'pursue';
        this.stats.pursuits++;
        this.raiseAlert(2);
        this.record(p.look, g.spec.name);
        this.witnesses.add(g.id);
        this.bus.emit('shout', { id: g.id, text: this.rng.pick(['Oi! Stop right there.', 'You. Hold it.', 'Security. Stay where you are.']) });
      } else if (seesNow && g.suspicion >= 55 && g.mode === 'routine') {
        g.mode = 'investigate';
        g.target = { x: p.pos.x, y: p.pos.y };
        g.modeUntil = t + 6;
        g.path = null; g.pathGoal = null;
      }
      switch (g.mode) {
        case 'routine': break;
        case 'respond': {
          g.activity = 'walk';
          if (walkTo(g, g.target!, GUARD_RUN * 0.65, t, dt, this.world, this.nav) || t > g.modeUntil) this.beginSearch(g);
          break;
        }
        case 'investigate': {
          g.activity = 'patrol';
          if (seesNow && g.suspicion >= 55) g.target = { x: p.pos.x, y: p.pos.y };
          if (walkTo(g, g.target!, GUARD_WALK * 1.2, t, dt, this.world, this.nav) || t > g.modeUntil) {
            if (g.suspicion < 55) this.backToRoutine(g); else this.beginSearch(g);
          }
          break;
        }
        case 'pursue': {
          if (seesNow) { this.chase(g, dt); g.target = { x: p.pos.x, y: p.pos.y }; }
          else if (walkTo(g, g.target!, GUARD_RUN, t, dt, this.world, this.nav)) this.beginSearch(g);
          break;
        }
        case 'search': {
          g.activity = 'patrol';
          if (t > g.modeUntil || g.searchPts.length === 0) { this.backToRoutine(g); break; }
          if (walkTo(g, g.searchPts[0], GUARD_WALK * 1.4, t, dt, this.world, this.nav)) {
            g.searchPts.shift(); g.path = null; g.pathGoal = null;
            g.stir = 0.2;
          }
          break;
        }
        case 'repair': {
          g.activity = 'walk';
          const j = this.junctions.find((x) => x.repairer === g.id);
          if (!j) { this.backToRoutine(g); break; }
          if (walkTo(g, g.target!, GUARD_WALK * 1.5, t, dt, this.world, this.nav)) {
            g.activity = 'repair';
            if (g.modeUntil > t + 9) g.modeUntil = t + 8;
            if (t >= g.modeUntil) {
              j.cut = false;
              j.repairer = null;
              this.bus.emit('toast', { text: `${g.spec.name} got the cameras back on. They come back watchful.`, tone: 'info' });
              for (const c of this.cameras) if (c.def.circuit === j.def.circuit) c.vigilance = Math.min(1, c.vigilance + 0.6);
              // Cut the same box twice and somebody stays with it.
              if (j.cuts >= 2) { j.guarded = true; g.mode = 'guard-box'; g.activity = 'post'; g.vel.x = g.vel.y = 0; }
              else this.backToRoutine(g);
            }
          } else g.modeUntil = t + 60;
          break;
        }
        case 'guard-box': g.vel.x = g.vel.y = 0; g.activity = 'post'; break;
      }
      if (g.mode === 'pursue' && dist(g.pos, p.pos) < 0.95) this.end('caught');
    }
  }

  private chase(g: Agent, dt: number): void {
    const p = this.player;
    g.activity = 'walk';
    const dx = p.pos.x - g.pos.x, dy = p.pos.y - g.pos.y;
    const d = Math.hypot(dx, dy);
    if (this.world.lineOfSight(g.pos, p.pos, this.t) && d > 0.01) {
      g.vel.x = (dx / d) * GUARD_RUN; g.vel.y = (dy / d) * GUARD_RUN;
      g.facing = Math.atan2(dy, dx);
      g.path = null; g.pathGoal = null;
    } else walkTo(g, p.pos, GUARD_RUN, this.t, dt, this.world, this.nav);
  }

  private beginSearch(g: Agent): void {
    g.mode = 'search';
    g.modeUntil = this.t + 16;
    const c = g.target ?? g.pos;
    g.searchPts = [];
    for (let i = 0; i < 4; i++) {
      const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(2, 6);
      g.searchPts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
    }
    g.path = null; g.pathGoal = null;
  }

  private backToRoutine(g: Agent): void {
    g.mode = 'routine';
    g.target = null;
    g.path = null; g.pathGoal = null;
    g.suspicion = Math.min(g.suspicion, 40);
  }

  private stepTheft(): void {
    const t = this.t;
    for (const a of this.agents) {
      if (!a.live || a.discovered || a.robbedAt < 0 || a.discoverAt < 0 || a.id === 'pell') continue;
      // Someone on their phone finds the phone missing quickly.
      if (t >= a.discoverAt) {
        a.discovered = true;
        this.stats.discoveries++;
        const what = a.spec.item?.kind === 'phone' ? 'My phone' : 'My wallet';
        this.bus.emit('shout', { id: a.id, text: `${what}. Somebody took my ${a.spec.item?.kind === 'phone' ? 'phone' : 'wallet'}.` });
        this.raiseAlert(1);
        if (t - a.lastSaw < 45 || a.robbedQuality === 'sloppy') {
          this.record(a.sawLook ?? this.player.look, a.spec.name);
          this.witnesses.add(a.id);
        }
        this.dispatch(a.pos, 1, 'respond');
        for (const b of this.agents) if (b.live && dist(b.pos, a.pos) < 10) b.distractedUntil = 0;
      }
    }
  }

  private stepIntel(dt: number): void {
    const t = this.t, p = this.player;
    const sees = (q: Vec2, r: number) => dist(q, p.pos) < r && this.world.lineOfSight(p.pos, q, t);
    // The courier: watch him for a few seconds.
    const pell = this.agent('pell')!;
    const fp = this.facts.get('pell')!;
    if (pell.live && fp.status !== 'confirmed' && sees(pell.pos, 10)) {
      fp.progress = Math.min(1, fp.progress + dt / 4);
      if (fp.status === 'unknown') this.setFact('pell', 'observing');
      if (fp.progress >= 1) this.setFact('pell', 'confirmed', 'Aldous Pell, Halvard courier. Coach card on a belt clip. He gets up at 23:31 and pats his belt before he walks to the coach.');
    }
    // Cameras: watch one through a full sweep.
    for (const cam of this.cameras) {
      const f = this.facts.get(`cam-${cam.def.id}`)!;
      if (f.status === 'confirmed') continue;
      if (cam.online && sees(cam.def, cam.def.range + 4)) {
        cam.watched += dt;
        f.progress = Math.min(1, cam.watched / cam.def.period);
        if (f.status === 'unknown') this.setFact(f.id, 'observing');
        if (f.progress >= 1) {
          this.setFact(f.id, 'confirmed', `${cam.def.label}. Sweeps every ${cam.def.period} s. Its gaps are marked on your map.`);
          if (cam.def.id === 'P2' && this.facts.get('tip-p2-dead')!.status === 'rumoured') this.setFact('tip-p2-dead', 'false', 'Dee lied. Camera P2 is live: you watched it sweep.');
        }
      }
    }
    // Guards: watch their rounds.
    for (const [id, fid] of [['kowalski', 'route-kowalski'], ['ade', 'route-ade']] as const) {
      const g = this.agent(id)!, f = this.facts.get(fid)!;
      if (f.status !== 'confirmed' && g.live && g.mode === 'routine' && g.activity === 'patrol' && sees(g.pos, 16)) {
        f.progress = Math.min(1, f.progress + dt / 22);
        if (f.status === 'unknown') this.setFact(fid, 'observing');
        if (f.progress >= 1) this.setFact(fid, 'confirmed', id === 'kowalski' ? 'Kowalski walks a loop of the concourse, about 90 seconds a round. His round is on your map.' : 'Ade walks the length of platform 1 and back. His round is on your map.');
      }
    }
    // A bought tip proven by your own eyes.
    const ade = this.agent('ade')!;
    if (this.facts.get('tip-ade-break')!.status === 'rumoured' && ade.activity === 'break' && sees(ade.pos, 14)) {
      this.setFact('tip-ade-break', 'confirmed', 'Ade is on his break in the staff room, as Dee said. Back on the platform at 23:34.');
    }
  }

  private stepChannels(): void {
    const ch = this.channel, t = this.t, p = this.player;
    if (p.clone === 'copying' && t >= p.cloneReadyAt) {
      p.clone = 'ready';
      this.bus.emit('toast', { text: "Dee's done. Collect the cards from the kiosk.", tone: 'good' });
    }
    if (!ch) return;
    if (ch.kind === 'copy-wait') { this.channel = null; return; }
    // Walking away or getting grabbed breaks a channel.
    const j = this.junctions.find((x) => x.def.id === ch.target);
    if (!j || dist(p.pos, j.def) > 1.8) { this.channel = null; return; }
    if (t < ch.until) return;
    this.channel = null;
    if (ch.kind === 'inspect') {
      const cams = this.cameras.filter((c) => c.def.circuit === j.def.circuit).map((c) => c.def.id).join(', ');
      this.setFact(`circuit-${j.def.id}`, 'confirmed', `${j.def.label}. Feeds cameras ${cams}. Cut it and they go dark until someone comes to fix it.`);
    } else {
      j.cut = true;
      j.cuts++;
      j.repairAt = t + 22;
      this.stats.cuts++;
      p.tamperUntil = t + 2;
      this.bus.emit('sfx', { name: 'cut' });
      this.bus.emit('toast', { text: `Box ${j.def.id} is dead. Cameras ${this.cameras.filter((c) => c.def.circuit === j.def.circuit).map((c) => c.def.id).join(', ')} are dark.`, tone: 'good' });
      this.raiseAlert(1);
    }
  }

  private stepAlert(): void {
    if (this.alert > 0 && this.t - this.alertQuietAt > 45) {
      this.alert--;
      this.alertQuietAt = this.t;
      this.bus.emit('alert', { level: this.alert });
    }
  }

  end(reason: EndReason): void {
    if (this.ended) return;
    this.ended = reason;
    if (reason === 'caught') {
      this.record(this.player.look, 'arrest');
      this.bus.emit('shout', { id: 'guard', text: 'Got you.' });
    }
    this.bus.emit('end', { reason });
  }

  // ------------------------------------------------------------------------
  // The player's verbs

  /** What the player could do right now, nearest first. */
  actions(): Action[] {
    if (this.ended) return [];
    const p = this.player, out: Action[] = [];
    const near = (q: Vec2, r: number) => dist(q, p.pos) <= r;
    for (const a of this.agents) {
      if (!a.live || isSecurity(a) || a.confronted || a.discovered) continue;
      if (!near(a.pos, 1.35)) continue;
      if (a.id === 'pell' && p.card === 'original' && !a.item) {
        const s = this.liftSetup(a.id, 'plant')!;
        out.push({ id: `plant:${a.id}`, label: 'Put it back', detail: 'Pell', at: a.pos, tone: s.label === 'good' ? 'good' : s.label });
      } else if (a.item && a.robbedAt < 0) {
        const s = this.liftSetup(a.id, 'lift')!;
        out.push({ id: `lift:${a.id}`, label: 'Lift', detail: a.id === 'pell' ? 'Pell' : undefined, at: a.pos, tone: s.label === 'good' ? 'good' : s.label });
      }
    }
    for (const j of this.junctions) {
      if (!near(j.def, 1.6) || j.guarded) continue;
      const f = this.facts.get(`circuit-${j.def.id}`)!;
      if (f.status !== 'confirmed') out.push({ id: `inspect:${j.def.id}`, label: 'Open the box', at: j.def });
      else if (!j.cut) out.push({ id: `cut:${j.def.id}`, label: 'Cut the power', at: j.def });
    }
    const kiosk = this.world.poi('kiosk');
    if (near(kiosk, 1.8)) out.push({ id: 'kiosk', label: 'Talk to Dee', at: kiosk });
    const machine = this.world.poi('machine');
    if (near(machine, 1.6) && !p.ticket) out.push({ id: 'ticket', label: `Ticket $${PRICES.ticket}`, at: machine });
    const hasCard = this.playerAccess().has('coach') || p.revoked && (p.card === 'original' || p.clone === 'held' || p.clone === 'revoked');
    const reader = this.world.poi('coach-reader');
    if (hasCard && near(reader, 1.4) && this.t < NIGHT_MAIL.until) out.push({ id: 'reader', label: 'Tap the card', at: reader });
    for (const ex of this.world.poisOf('exit')) if (near(ex, 2.2)) out.push({ id: 'leave', label: 'Go home', at: ex });
    out.sort((a, b) => dist(a.at, p.pos) - dist(b.at, p.pos));
    return out;
  }

  /** Who is watching, and what that does to a lift's starting awareness. */
  liftSetup(targetId: string, mode: 'lift' | 'plant'): LiftSetup | null {
    const a = this.agent(targetId);
    if (!a || !a.live) return null;
    const p = this.player, t = this.t;
    const attn = attentionOf(a, t, this.alert);
    const { half, range } = coneOf(a);
    const crowd = this.crowdAround(p.pos);
    const seen = visibility(this.world, t, a.pos, a.facing, half, range, p.pos, crowd, false, false) > 0.2 && attn > 0.3;
    let watchers = 0;
    for (const b of this.agents) {
      if (b === a || !b.live || dist(b.pos, p.pos) > 11) continue;
      const cb = coneOf(b);
      const v = visibility(this.world, t, b.pos, b.facing, cb.half, cb.range, p.pos, crowd, false, false);
      if (v > 0.2 && attentionOf(b, t, this.alert) > 0.35) watchers++;
    }
    const cams = this.cameras.filter((c) => c.sees > 0.15).length;
    let start = attn * 38 + watchers * 14 + cams * 12 + a.suspicion * 0.45 + (seen ? 18 : 0);
    if (a.activity === 'walk') start += 15;
    if (mode === 'plant') start += 6;
    start = clamp(start, 0, 85);
    const label = seen && attn > 0.3 || start > 55 ? 'bad' : start > 26 ? 'risky' : 'good';
    return {
      target: a.id, mode, start, label, watchers, cameras: cams,
      glanceMul: 0.6 + a.spec.aware * 0.8, aware: a.spec.aware, stir: ACTIVITY[a.activity].stir,
      crowdCover: crowd >= 2, pocket: a.spec.pocket, item: a.spec.item?.kind ?? 'cash',
    };
  }

  /** The Dip came back. Apply what happened to the world. */
  resolveLift(setup: LiftSetup, r: { success: boolean; aborted?: boolean; quality?: 'critical' | 'clean' | 'sloppy' }): void {
    const a = this.agent(setup.target);
    if (!a) return;
    const p = this.player, t = this.t;
    if (r.aborted) { a.suspicion = Math.min(100, a.suspicion + 12); return; }
    if (!r.success) {
      this.stats.fumbles++;
      a.sawLook = { ...p.look };
      a.lastSaw = t;
      a.suspicion = 110;
      a.confronted = false;
      this.confront(a);
      this.bus.emit('toast', { text: `${a.spec.name} felt your hand.`, tone: 'bad' });
      if (a.id === 'pell') {
        p.revoked = true;
        if (p.clone !== 'none') p.clone = 'revoked';
        this.bus.emit('toast', { text: 'Pell will report it. Halvard cancels the card tonight.', tone: 'bad' });
        this.setFact('returned', 'dead', 'Pell caught you at his belt. Halvard cancelled the card.');
      }
      return;
    }
    if (setup.mode === 'plant') {
      a.item = { kind: 'card', value: 0, label: 'a Halvard coach card' };
      p.card = 'none';
      this.bus.emit('toast', { text: 'The card is back on his belt.', tone: 'good' });
      this.bus.emit('sfx', { name: 'lift' });
      return;
    }
    const item = a.item!;
    a.item = null;
    a.robbedAt = t;
    a.robbedQuality = r.quality ?? 'clean';
    this.stats.lifts++;
    // When they find out: soon if sloppy, later if clean, much later if clean and asleep.
    const base = r.quality === 'critical' ? this.rng.range(70, 140) : r.quality === 'clean' ? this.rng.range(35, 90) : this.rng.range(2, 12);
    const phoneUser = item.kind === 'phone' && a.activity === 'phone';
    a.discoverAt = t + (phoneUser ? Math.min(base, 6) : base) / (a.activity === 'sleep' ? 0.4 : 1);
    if (item.kind === 'card') {
      p.card = 'original';
      this.bus.emit('toast', { text: "Pell's coach card. He checks his belt when he stands up, at 23:31.", tone: 'good' });
    } else {
      p.takes.push({ from: a.spec.name, label: item.label, value: item.value });
      if (item.kind === 'cash') p.cash += item.value;
      else p.cash += Math.round(item.value * 0.4); // Dee buys phones, badly.
      this.bus.emit('toast', { text: item.kind === 'phone' ? `A phone. Dee gives you $${Math.round(item.value * 0.4)} for it.` : `${item.label}.`, tone: 'good' });
    }
    this.bus.emit('sfx', { name: 'lift' });
  }

  /** Run a non-theft action from actions(). Returns a panel to open, if any. */
  perform(id: string): 'kiosk' | null {
    const p = this.player, t = this.t;
    const [verb, arg] = id.split(':');
    switch (verb) {
      case 'inspect':
        this.channel = { kind: 'inspect', target: arg, started: t, until: t + 1.2 };
        return null;
      case 'cut':
        this.channel = { kind: 'cut', target: arg, started: t, until: t + 2.5 };
        this.bus.emit('sfx', { name: 'tamper' });
        return null;
      case 'kiosk':
        if (p.clone === 'ready') {
          p.clone = 'held';
          p.card = 'original';
          this.setFact('clone', 'confirmed', 'Dee copied the coach card. You hold the copy. It works as long as Pell never reports the original missing.');
          this.bus.emit('toast', { text: 'You have the original back, and a copy.', tone: 'good' });
          return null;
        }
        return 'kiosk';
      case 'ticket':
        if (p.cash >= PRICES.ticket) {
          p.cash -= PRICES.ticket; p.ticket = true;
          this.bus.emit('toast', { text: 'A ticket. The gates are yours now.', tone: 'good' });
          this.bus.emit('sfx', { name: 'buy' });
        } else this.bus.emit('toast', { text: `You need $${PRICES.ticket}.`, tone: 'bad' });
        return null;
      case 'reader': {
        p.tamperUntil = t + 2;
        if (p.revoked || !this.playerAccess().has('coach')) {
          this.bus.emit('toast', { text: 'The reader blinks red. The card has been cancelled.', tone: 'bad' });
          this.bus.emit('sfx', { name: 'deny' });
        } else {
          this.setFact('reader', 'confirmed', p.clone === 'held'
            ? 'The copied card opens the Halvard coach door. That is the job.'
            : 'The coach card opens the Halvard coach door. A copy of it would too.');
          this.bus.emit('toast', { text: 'Green. The coach door unlocks. You let it close again.', tone: 'good' });
          this.bus.emit('sfx', { name: 'accept' });
        }
        return null;
      }
      case 'leave':
        this.end('left');
        return null;
    }
    return null;
  }

  /** Dee's counter. */
  buyTip(id: string): boolean {
    const tip = TIPS.find((x) => x.id === id);
    const f = this.facts.get(id);
    if (!tip || !f || f.status !== 'unknown' || this.player.cash < tip.price) return false;
    this.player.cash -= tip.price;
    this.setFact(id, 'rumoured');
    return true;
  }

  startCopy(): boolean {
    const p = this.player;
    if (p.card !== 'original' || p.clone !== 'none' || p.cash < PRICES.copy) return false;
    p.cash -= PRICES.copy;
    p.card = 'none';
    p.clone = 'copying';
    p.cloneReadyAt = this.t + COPY_SECONDS;
    this.bus.emit('toast', { text: 'Dee takes the card. Two minutes.', tone: 'info' });
    return true;
  }

  /** Halvard's heat from tonight, charged when the night ends. */
  nightHeat(): number {
    const s = this.stats;
    let h = s.confrontations * 6 + s.flags * 10 + s.discoveries * 5 + s.pursuits * 8 + s.cuts * 8;
    if (this.ended === 'caught') h += 30;
    return Math.round(h);
  }

  /** Pell's countdown, for the HUD. */
  get untilPellStands(): number { return at('23:31') - this.t; }
}

/** A camera judged as security with full attention. */
const CAMERA_EYE = { spec: { role: 'guard' } } as unknown as Agent;

const t2 = (then: number, now: number) => now - then;
