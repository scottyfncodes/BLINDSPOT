/**
 * Draws Calder Central from above at night. Reads the sim; never writes it.
 *
 * Order: floors, floor markings, solids and people sorted by depth, sight
 * cones, darkness with lamps cut out of it, then the overlays only Wren can
 * see (what she knows) and the HUD-in-the-world (shouts, markers).
 */
import { clamp, damp, lerp, type Vec2 } from '../core/math';
import type { Agent } from '../sim/agents';
import { isSecurity } from '../sim/agents';
import { clockLabel } from '../sim/clock';
import { known } from '../sim/intel';
import { coneOf } from '../sim/perception';
import type { Action, Sim } from '../sim/sim';
import type { Light, Solid } from '../sim/types';
import { PAL } from './palette';
import { drawFigure, drawWren, drawPersonShadow } from './figures';
import { Materials } from './materials';
import { drawDressing, drawFloor, drawShadow, drawSolid, drawWallDressing, visualHeight } from './scenery';
import { stationDressing, type Dressing } from '../content/dressing';

interface Shout { id: string; text: string; until: number; hostile: boolean }

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private dark: HTMLCanvasElement;
  private dctx: CanvasRenderingContext2D;
  W = 0; H = 0; dpr = 1;
  /** Pixels per metre at zoom 1. */
  base = 20;
  zoom = 1;
  cam: Vec2 = { x: 0, y: 0 };
  private shouts: Shout[] = [];
  private flagFlash = 0;
  reducedMotion = false;
  private time = 0;

  private mats: Materials;
  private dressing: Dressing[] = stationDressing().items;
  private grain: CanvasPattern | null = null;
  private vignette: CanvasGradient | null = null;

  constructor(private canvas: HTMLCanvasElement, assetBase = './') {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.dark = document.createElement('canvas');
    this.dctx = this.dark.getContext('2d')!;
    this.mats = new Materials(this.ctx, assetBase);
    // Film grain: one small noise tile, drawn over everything at low strength.
    const g = document.createElement('canvas');
    g.width = g.height = 128;
    const gc = g.getContext('2d')!;
    const img = gc.createImageData(128, 128);
    let seed = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const v = seed >>> 24;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    this.grain = this.ctx.createPattern(g, 'repeat');
  }

  resize(w: number, h: number): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    // About 12 metres across the short side: close enough to read a person.
    this.base = clamp(Math.min(w, h) / 12, 26, 52);
    this.vignette = null;
    this.dark.width = Math.ceil(w / 3);
    this.dark.height = Math.ceil(h / 3);
  }

  get scale(): number { return this.base * this.zoom; }

  shout(id: string, text: string, hostile: boolean, now: number): void {
    this.shouts = this.shouts.filter((s) => s.id !== id);
    this.shouts.push({ id, text, until: now + 2.8, hostile });
  }

  flag(): void { this.flagFlash = 1; }

  toScreen(p: Vec2): Vec2 {
    const s = this.scale;
    return { x: (p.x - this.cam.x) * s + this.W / 2, y: (p.y - this.cam.y) * s + this.H / 2 };
  }

  render(sim: Sim, alpha: number, frameDt: number, actions: Action[]): void {
    this.time += frameDt;
    const ctx = this.ctx, s = this.scale, p = sim.player;
    const px = lerp(p.prev.x, p.pos.x, alpha), py = lerp(p.prev.y, p.pos.y, alpha);
    // Follow with a little lead in the direction of travel.
    const lead = { x: px + p.vel.x * 0.35, y: py + p.vel.y * 0.35 };
    if (this.cam.x === 0 && this.cam.y === 0) this.cam = { ...lead };
    this.cam.x = damp(this.cam.x, lead.x, this.reducedMotion ? 0.02 : 0.12, frameDt);
    this.cam.y = damp(this.cam.y, lead.y, this.reducedMotion ? 0.02 : 0.12, frameDt);
    const vw = this.W / s, vh = this.H / s;
    const view = { x: this.cam.x - vw / 2 - 2, y: this.cam.y - vh / 2 - 2, w: vw + 4, h: vh + 14 };
    const vis = (b: { x: number; y: number; w: number; h: number }) =>
      b.x + b.w > view.x && b.x < view.x + view.w && b.y + b.h > view.y && b.y < view.y + view.h;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.night;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const k = s * this.dpr;
    ctx.setTransform(k, 0, 0, k, (this.W / 2 - this.cam.x * s) * this.dpr, (this.H / 2 - this.cam.y * s) * this.dpr);
    const t = sim.t;
    const w = sim.world;

    const pxw = 1 / s;
    // Floors, then what lies on them.
    for (const z of w.def.zones) if (vis(z)) drawFloor(ctx, z, this.mats, pxw);
    drawDressing(ctx, this.dressing, view, pxw, this.time, this.reducedMotion);

    // Contact shadows, so things sit on the ground.
    for (const so of w.def.solids) if (active(so, t) && vis(so)) drawShadow(ctx, so);
    for (const a of sim.agents) if (a.live && vis({ x: a.pos.x - 1, y: a.pos.y - 1, w: 2, h: 2 })) drawPersonShadow(ctx, lerp(a.prev.x, a.pos.x, alpha), lerp(a.prev.y, a.pos.y, alpha), this.nearLight(sim, a.pos));
    drawPersonShadow(ctx, px, py, this.nearLight(sim, p.pos));

    // Depth-sorted solids and people. Anything standing between the camera
    // and Wren goes see-through, so she is never lost behind a wall.
    type D = { y: number; draw: () => void };
    const list: D[] = [];
    for (const so of w.def.solids) {
      if (!active(so, t) || !vis(so)) continue;
      const hides = px > so.x - 0.3 && px < so.x + so.w + 0.3 && py < so.y + so.h && py > so.y - visualHeight(so) - 0.6;
      const roll = so.kind === 'train' && so.from !== undefined && !this.reducedMotion ? Math.max(0, so.from + 4 - t) ** 2 * 3 : 0;
      list.push({ y: so.y + so.h, draw: () => {
        if (hides) ctx.globalAlpha = 0.42;
        drawSolid(ctx, so, this.mats, pxw, roll, this.time);
        ctx.globalAlpha = 1;
      } });
    }
    for (const j of sim.junctions) {
      list.push({ y: j.def.y + 0.3, draw: () => this.junction(sim, j.def.id) });
    }
    for (const a of sim.agents) {
      if (!a.live || !vis({ x: a.pos.x - 1, y: a.pos.y - 1, w: 2, h: 2 })) continue;
      list.push({ y: a.pos.y, draw: () => this.agent(a, alpha, sim) });
    }
    list.push({ y: py, draw: () => drawWren(ctx, px, py, lerpAngle(p.prevFacing, p.facing, alpha), p, this.time, s) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();
    drawWallDressing(ctx, this.dressing, view, sim.t * 6);

    // Darkness, with the lamps cut out of it.
    this.lighting(sim, view);

    // Sight is drawn over the dark: a gaze you cannot see is not fair play.
    ctx.setTransform(k, 0, 0, k, (this.W / 2 - this.cam.x * s) * this.dpr, (this.H / 2 - this.cam.y * s) * this.dpr);
    this.cones(sim, alpha);
    for (const c of sim.cameras) this.cameraBody(sim, c.def.id);
    // What Wren knows, in cyanotype.
    this.knowledge(sim);
    this.markers(sim, alpha, actions);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.labels(sim, alpha);
    if (this.flagFlash > 0) {
      ctx.fillStyle = `rgba(232,67,44,${(this.reducedMotion ? 0.12 : 0.22) * this.flagFlash})`;
      ctx.fillRect(0, 0, this.W, this.H);
      this.flagFlash = Math.max(0, this.flagFlash - frameDt * 1.5);
    }
    this.post();
    void clockLabel;
  }

  /** A failing tube: mostly on, now and then it stutters. */
  private flicker(L: Light): number {
    if (!L.flicker || this.reducedMotion) return 1;
    const t = this.time;
    const n = Math.sin(t * 13.1) * Math.sin(t * 7.3 + 1) * Math.sin(t * 2.1);
    return n > 0.55 ? 0.25 : n > 0.4 ? 0.7 : 1;
  }

  /** The nearest strong light to a point: shadows fall away from it. */
  private nearLight(sim: Sim, p: Vec2): Light | null {
    let best: Light | null = null, bd = Infinity;
    for (const L of sim.world.def.lights) {
      if (L.strength < 0.3) continue;
      const d = (L.x - p.x) ** 2 + (L.y - p.y) ** 2;
      if (d < bd && d < L.r * L.r) { bd = d; best = L; }
    }
    return best;
  }

  /** Lens: vignette and grain. */
  private post(): void {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.vignette) {
      const r = Math.hypot(this.W, this.H) / 2;
      this.vignette = ctx.createRadialGradient(this.W / 2, this.H / 2, r * 0.45, this.W / 2, this.H / 2, r);
      this.vignette.addColorStop(0, 'rgba(0,0,0,0)');
      this.vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
    }
    ctx.fillStyle = this.vignette;
    ctx.fillRect(0, 0, this.W, this.H);
    if (this.grain) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = 'overlay';
      const o = this.reducedMotion ? 0 : Math.floor(this.time * 24) * 37 % 128;
      ctx.translate(-o, -((o * 3) % 128));
      ctx.fillStyle = this.grain;
      ctx.fillRect(0, 0, this.W + 128, this.H + 128);
      ctx.restore();
    }
  }

  private junction(sim: Sim, id: string): void {
    const ctx = this.ctx;
    const j = sim.junctions.find((x) => x.def.id === id)!;
    const { x, y } = j.def;
    ctx.fillStyle = '#4d5650';
    ctx.fillRect(x - 0.35, y - 0.55, 0.7, 0.6);
    ctx.fillStyle = j.cut ? '#2a2a28' : '#6e7a72';
    ctx.fillRect(x - 0.35, y - 0.55, 0.7, 0.18);
    if (j.cut && Math.floor(this.time * 8) % 3 === 0 && !this.reducedMotion) {
      ctx.fillStyle = PAL.attention;
      ctx.fillRect(x - 0.1, y - 0.2, 0.2, 0.2);
    }
    if (j.guarded) {
      ctx.strokeStyle = PAL.signal; ctx.lineWidth = 0.08;
      ctx.strokeRect(x - 0.5, y - 0.7, 1, 0.9);
    }
  }

  // ---------------------------------------------------------------- people

  private agent(a: Agent, alpha: number, sim: Sim): void {
    const x = lerp(a.prev.x, a.pos.x, alpha), y = lerp(a.prev.y, a.pos.y, alpha);
    const moving = Math.hypot(a.vel.x, a.vel.y) > 0.1;
    drawFigure(this.ctx, x, y, lerpAngle(a.prevFacing, a.facing, alpha), a, moving ? this.time : 0, this.scale);
    // Pell, once known, is labelled in what-you-know blue.
    if (a.id === 'pell' && known(sim.facts.get('pell'))) {
      this.ctx.strokeStyle = PAL.known;
      this.ctx.lineWidth = 0.06;
      this.ctx.setLineDash([0.2, 0.15]);
      this.ctx.beginPath(); this.ctx.arc(x, y, 0.62, 0, Math.PI * 2); this.ctx.stroke();
      this.ctx.setLineDash([]);
    }
  }

  // ---------------------------------------------------------------- cones

  private conePoly(o: Vec2, facing: number, half: number, range: number, t: number, sim: Sim): Vec2[] {
    const pts: Vec2[] = [o];
    const n = Math.max(8, Math.ceil(half * 18));
    for (let i = 0; i <= n; i++) {
      const a = facing - half + (2 * half * i) / n;
      const r = sim.world.rayDistance(o, a, range, t);
      pts.push({ x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r });
    }
    return pts;
  }

  private fillPoly(pts: Vec2[], fill: string, stroke?: string): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2 / this.scale; ctx.stroke(); }
  }

  private cones(sim: Sim, alpha: number): void {
    const t = sim.t;
    // Cameras: only the ones Wren has studied show their sight.
    for (const c of sim.cameras) {
      if (!c.online) continue;
      const f = sim.facts.get(`cam-${c.def.id}`)!;
      if (f.status !== 'confirmed') continue;
      const facing = lerpAngle(c.prevFacing, c.facing, alpha);
      const hot = c.sees > 0 ? 0.1 + c.suspicion / 400 : 0;
      this.fillPoly(this.conePoly(c.def, facing, c.def.half, c.def.range * (1 + 0.15 * c.vigilance), t, sim), `rgba(232,67,44,${0.12 + hot})`, 'rgba(232,67,44,0.5)');
    }
    // Guards: always visible, Wren knows a uniform when she sees one.
    for (const a of sim.agents) {
      if (!a.live) continue;
      const sec = isSecurity(a);
      if (!sec && a.suspicion < 18) continue;
      const { half, range } = coneOf(a);
      const x = lerp(a.prev.x, a.pos.x, alpha), y = lerp(a.prev.y, a.pos.y, alpha);
      const facing = lerpAngle(a.prevFacing, a.facing, alpha);
      const heat = clamp(a.suspicion / 100, 0, 1);
      const base = sec ? 0.07 : 0.03;
      const a1 = base + heat * 0.16;
      const col = a.mode === 'pursue' ? `rgba(232,67,44,${a1 + 0.08})` : `rgba(242,193,78,${a1})`;
      this.fillPoly(this.conePoly({ x, y }, facing, half, sec ? range : Math.min(range, 7), t, sim), col);
    }
  }

  private cameraBody(sim: Sim, id: string): void {
    const ctx = this.ctx;
    const c = sim.cameras.find((x) => x.def.id === id)!;
    const { x, y } = c.def;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(c.facing);
    ctx.fillStyle = c.online ? '#2b2b2b' : '#3b3a38';
    ctx.fillRect(-0.28, -0.16, 0.56, 0.32);
    ctx.fillStyle = c.online ? PAL.signal : '#55524c';
    ctx.fillRect(0.2, -0.09, 0.14, 0.18);
    const learned = sim.facts.get(`cam-${id}`)!.status === 'confirmed';
    if (c.online && !learned) {
      // Unstudied: you can see which way it points, not what it sees.
      ctx.strokeStyle = 'rgba(232,67,44,0.75)';
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(0.35, 0); ctx.lineTo(1.6, 0); ctx.stroke();
    }
    ctx.restore();
    if (c.online && c.sees > 0.05 && Math.floor(this.time * 4) % 2 === 0) {
      ctx.fillStyle = PAL.signal;
      ctx.beginPath(); ctx.arc(x, y - 0.35, 0.09, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ---------------------------------------------------------------- light

  private lighting(sim: Sim, view: { x: number; y: number; w: number; h: number }): void {
    const d = this.dctx, dw = this.dark.width, dh = this.dark.height;
    const s = this.scale / 3;
    d.setTransform(1, 0, 0, 1, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, dw, dh);
    d.fillStyle = 'rgba(6,9,18,0.88)';
    d.fillRect(0, 0, dw, dh);
    d.setTransform(s, 0, 0, s, dw / 2 - this.cam.x * s, dh / 2 - this.cam.y * s);
    d.globalCompositeOperation = 'destination-out';
    for (const L of sim.world.def.lights) {
      if (L.x + L.r < view.x || L.x - L.r > view.x + view.w || L.y + L.r < view.y || L.y - L.r > view.y + view.h) continue;
      const fl = this.flicker(L);
      const g = d.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r);
      g.addColorStop(0, `rgba(0,0,0,${Math.min(1, L.strength * 1.3 * fl)})`);
      g.addColorStop(0.5, `rgba(0,0,0,${Math.min(1, L.strength * 0.8)})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      d.fillStyle = g;
      d.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.dark, 0, 0, this.canvas.width, this.canvas.height);
    // A warm cast where the sodium lamps are.
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, (this.W / 2 - this.cam.x * this.scale) * this.dpr, (this.H / 2 - this.cam.y * this.scale) * this.dpr);
    ctx.globalCompositeOperation = 'lighter';
    for (const L of sim.world.def.lights) {
      if (L.x + L.r < view.x || L.x - L.r > view.x + view.w || L.y + L.r < view.y || L.y - L.r > view.y + view.h) continue;
      const col = L.color ?? (L.tone === 'sodium' ? 'rgba(242,163,58,1)' : L.tone === 'sign' ? 'rgba(232,194,122,1)' : 'rgba(205,225,215,1)');
      const a = (L.tone === 'sodium' ? 0.16 : L.tone === 'fluoro' ? 0.05 : L.tone === 'window' ? 0.2 : 0.24) * this.flicker(L);
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * 0.85);
      g.addColorStop(0, col.replace(/,1\)$/, `,${a})`));
      g.addColorStop(1, col.replace(/,1\)$/, ',0)'));
      ctx.fillStyle = g;
      ctx.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- knowledge

  private knowledge(sim: Sim): void {
    const ctx = this.ctx, px = 1 / this.scale;
    ctx.strokeStyle = PAL.known;
    ctx.fillStyle = PAL.known;
    // Learned cameras: the full extent of the sweep, as an arc.
    for (const c of sim.cameras) {
      const f = sim.facts.get(`cam-${c.def.id}`)!;
      const d = c.def;
      if (f.status === 'confirmed') {
        ctx.lineWidth = 1.5 * px;
        ctx.setLineDash([4 * px, 3 * px]);
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.range * 0.5, d.facing - d.sweep - d.half, d.facing + d.sweep + d.half);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if (f.status === 'observing') {
        // A progress ring while she studies it.
        ctx.lineWidth = 3 * px;
        ctx.beginPath();
        ctx.arc(d.x, d.y, 0.7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.progress);
        ctx.stroke();
      }
      // A camera Dee says is dead, drawn the way Wren believes it.
      if (c.def.id === 'P2' && sim.facts.get('tip-p2-dead')!.status === 'rumoured' && f.status !== 'confirmed') {
        ctx.lineWidth = 2 * px;
        ctx.beginPath();
        ctx.moveTo(d.x - 0.4, d.y - 0.4); ctx.lineTo(d.x + 0.4, d.y + 0.4);
        ctx.moveTo(d.x + 0.4, d.y - 0.4); ctx.lineTo(d.x - 0.4, d.y + 0.4);
        ctx.stroke();
      }
    }
    // Learned guard rounds.
    for (const [id, fid] of [['kowalski', 'route-kowalski'], ['ade', 'route-ade']] as const) {
      const f = sim.facts.get(fid)!;
      const g = sim.agent(id)!;
      if (f.status === 'observing' && g.live) {
        ctx.lineWidth = 3 * px;
        ctx.beginPath();
        ctx.arc(g.pos.x, g.pos.y, 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f.progress);
        ctx.stroke();
      }
      if (f.status !== 'confirmed') continue;
      const step = g.spec.plan.find((s) => s.do === 'patrol');
      if (!step || step.do !== 'patrol') continue;
      ctx.lineWidth = 1.5 * px;
      ctx.setLineDash([2 * px, 5 * px]);
      ctx.beginPath();
      step.route.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Known circuits: which cameras each box feeds.
    for (const j of sim.junctions) {
      if (sim.facts.get(`circuit-${j.def.id}`)!.status !== 'confirmed') continue;
      ctx.lineWidth = 1 * px;
      ctx.setLineDash([1 * px, 4 * px]);
      ctx.beginPath();
      for (const c of sim.cameras) if (c.def.circuit === j.def.circuit) { ctx.moveTo(j.def.x, j.def.y); ctx.lineTo(c.def.x, c.def.y); }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Pell being watched: a progress ring.
    const pell = sim.agent('pell')!;
    const fp = sim.facts.get('pell')!;
    if (pell.live && fp.status === 'observing') {
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.arc(pell.pos.x, pell.pos.y, 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fp.progress);
      ctx.stroke();
    }
  }

  private markers(sim: Sim, alpha: number, actions: Action[]): void {
    const ctx = this.ctx, px = 1 / this.scale;
    const a = actions[0];
    if (!a) return;
    const tone = a.tone === 'bad' ? PAL.signal : a.tone === 'risky' ? PAL.attention : a.tone === 'good' ? PAL.good : PAL.paper;
    let { x, y } = a.at;
    const ag = a.id.includes(':') ? sim.agent(a.id.split(':')[1]) : undefined;
    if (ag) { x = lerp(ag.prev.x, ag.pos.x, alpha); y = lerp(ag.prev.y, ag.pos.y, alpha); }
    // Corner brackets around the target.
    const r = 0.75, c = 0.3;
    ctx.strokeStyle = tone;
    ctx.lineWidth = 2.2 * px;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      ctx.moveTo(x + sx * r, y + sy * (r - c)); ctx.lineTo(x + sx * r, y + sy * r); ctx.lineTo(x + sx * (r - c), y + sy * r);
    }
    ctx.stroke();
  }

  // ---------------------------------------------------------------- text over the world

  private labels(sim: Sim, alpha: number): void {
    const ctx = this.ctx;
    const t = sim.t;
    // Suspicion over heads, and the tell before a glance.
    for (const a of sim.agents) {
      if (!a.live) continue;
      const sp = this.toScreen({ x: lerp(a.prev.x, a.pos.x, alpha), y: lerp(a.prev.y, a.pos.y, alpha) });
      if (sp.x < -40 || sp.y < -40 || sp.x > this.W + 40 || sp.y > this.H + 40) continue;
      const hy = sp.y - this.scale * 0.95;
      if (a.suspicion > 4) {
        const f = clamp(a.suspicion / 100, 0, 1);
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(14,13,12,0.7)';
        ctx.beginPath(); ctx.arc(sp.x, hy, 7, Math.PI * 0.85, Math.PI * 2.15); ctx.stroke();
        ctx.strokeStyle = f > 0.75 ? PAL.signal : PAL.attention;
        ctx.beginPath(); ctx.arc(sp.x, hy, 7, Math.PI * 0.85, Math.PI * 0.85 + Math.PI * 1.3 * f); ctx.stroke();
      }
      if ((a.stir > 0 || a.glance > 0) && (isSecurity(a) || Math.hypot(a.pos.x - sim.player.pos.x, a.pos.y - sim.player.pos.y) < 9)) {
        eye(ctx, sp.x, hy - (a.suspicion > 4 ? 13 : 0), a.glance > 0 ? 1 : 0.45, a.glance > 0 ? PAL.attention : PAL.paper);
      }
    }
    // Shouts.
    this.shouts = this.shouts.filter((s) => s.until > t);
    ctx.font = '600 13px "Big Shoulders Text", "Arial Narrow", sans-serif';
    ctx.textBaseline = 'middle';
    for (const sh of this.shouts) {
      const a = sim.agent(sh.id);
      const pos = a ? a.pos : sim.player.pos;
      const sp = this.toScreen(pos);
      const tw = Math.min(220, ctx.measureText(sh.text).width) + 14;
      const x = clamp(sp.x - tw / 2, 6, this.W - tw - 6), y = clamp(sp.y - this.scale * 1.6 - 22, 70, this.H - 120);
      ctx.fillStyle = PAL.paper;
      ctx.fillRect(x, y, tw, 22);
      ctx.fillStyle = sh.hostile ? PAL.signal : PAL.ink;
      ctx.fillRect(x, y, 3, 22);
      ctx.fillStyle = PAL.ink;
      ctx.fillText(sh.text, x + 8, y + 11, 210);
    }
  }
}

function eye(ctx: CanvasRenderingContext2D, x: number, y: number, open: number, col: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(14,13,12,0.75)';
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 5.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-7, 0); ctx.quadraticCurveTo(0, -6 * open, 7, 0); ctx.quadraticCurveTo(0, 6 * open, -7, 0); ctx.stroke();
  if (open > 0.5) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

function active(s: Solid, t: number): boolean {
  return (s.from === undefined || t >= s.from) && (s.until === undefined || t < s.until);
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, p = Math.abs(f);
  r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
  return `rgb(${r},${g},${b})`;
}

export function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
