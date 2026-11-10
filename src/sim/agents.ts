/**
 * People in motion: plans, paths and walking. Perception and security brains
 * live in their own modules and write into the same Agent record.
 */
import { angleToward, clamp, dist, type Vec2 } from '../core/math';
import type { Rng } from '../core/rng';
import { ACTIVITY, type Activity, type AgentSpec, type Item, type Step } from './agentTypes';
import type { Nav } from './nav';
import type { Access, Look } from './types';
import type { World } from './world';

export type GuardMode = 'routine' | 'respond' | 'investigate' | 'search' | 'pursue' | 'repair' | 'guard-box';

export interface Agent {
  spec: AgentSpec;
  id: string;
  pos: Vec2;
  prev: Vec2;
  facing: number;
  prevFacing: number;
  vel: Vec2;
  /** Present in the world. */
  live: boolean;
  gone: boolean;
  access: Set<Access>;
  stepIdx: number;
  stepStarted: number;
  path: Vec2[] | null;
  pathGoal: Vec2 | null;
  repathAt: number;
  activity: Activity;
  /** Where they should be facing while doing their activity. */
  restFacing: number | null;
  patrolIdx: number;

  // Perception (see perception.ts)
  suspicion: number;
  /** 0 = not stirring; counts down the telegraph before a glance. */
  stir: number;
  glance: number;
  nextGlance: number;
  glanceDir: number;
  /** Sim time they last saw the player. */
  lastSaw: number;
  sawLook: Look | null;
  sawPos: Vec2 | null;
  /** Seconds the player has stayed close to them. */
  tailed: number;
  confronted: boolean;
  /** Distracted until this time (staged by the player or the world). */
  distractedUntil: number;
  /** Seconds spent walking without getting anywhere (crowds, doorways). */
  stall: number;
  /** Closest they have got to the current goal. */
  bestDist: number;
  /** Standing aside to let someone through, until this time. */
  yieldUntil: number;

  // Theft
  item: Item | null;
  robbedAt: number;
  robbedQuality: 'critical' | 'clean' | 'sloppy' | null;
  discoverAt: number;
  discovered: boolean;

  // Security
  mode: GuardMode;
  modeUntil: number;
  target: Vec2 | null;
  searchPts: Vec2[];
}

export function makeAgent(spec: AgentSpec, world: World): Agent {
  const p = typeof spec.spawn === 'string' ? world.poi(spec.spawn) : spec.spawn;
  const facing = typeof spec.spawn === 'string' ? world.poi(spec.spawn).facing : 0;
  return {
    spec, id: spec.id,
    pos: { x: p.x, y: p.y }, prev: { x: p.x, y: p.y }, facing, prevFacing: facing, vel: { x: 0, y: 0 },
    live: false, gone: false, access: new Set(spec.access),
    stepIdx: 0, stepStarted: 0, path: null, pathGoal: null, repathAt: 0,
    activity: 'wait', restFacing: null, patrolIdx: 0,
    suspicion: 0, stir: 0, glance: 0, nextGlance: 3, glanceDir: 0,
    lastSaw: -999, sawLook: null, sawPos: null, tailed: 0, confronted: false, distractedUntil: 0,
    item: spec.item ? { ...spec.item } : null, robbedAt: -1, robbedQuality: null, discoverAt: -1, discovered: false,
    mode: 'routine', modeUntil: 0, target: null, searchPts: [], stall: 0, bestDist: Infinity, yieldUntil: 0,
  };
}

const hashId = (id: string): number => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; };

export const isSecurity = (a: Agent): boolean => a.spec.role === 'guard' || a.spec.role === 'escort';

export const WALK = 1.35;
export const BRISK = 1.8;
export const GUARD_WALK = 1.25;
export const GUARD_RUN = 4.3;

/** Resolve a step target. */
function placeOf(world: World, to: Vec2 | string): Vec2 {
  return typeof to === 'string' ? world.poi(to) : to;
}

/** Walk along the current path toward `goal`, repathing when needed. */
export function walkTo(a: Agent, goal: Vec2, speed: number, t: number, dt: number, _world: World, nav: Nav): boolean {
  if (!a.pathGoal || dist(a.pathGoal, goal) > 0.5 || (!a.path && t >= a.repathAt)) {
    a.pathGoal = { x: goal.x, y: goal.y };
    a.path = nav.path(a.pos, goal, t, a.access);
    a.repathAt = t + 1.5;
    a.bestDist = Infinity; a.stall = 0;
    if (!a.path) return dist(a.pos, goal) < 0.6;
  }
  if (!a.path || a.path.length === 0) return dist(a.pos, goal) < 0.6;
  if (t < a.yieldUntil) { a.vel.x = a.vel.y = 0; return false; }
  // Blocked by a crowd: close enough counts, otherwise find another way.
  const dg = dist(a.pos, goal);
  if (dg < a.bestDist - 0.3) { a.bestDist = dg; a.stall = 0; }
  else {
    a.stall += dt;
    if (a.stall > 1.5) {
      a.stall = 0;
      if (dist(a.pos, goal) < 1.6) { a.path = null; a.vel.x = a.vel.y = 0; return true; }
      // Head to head in a doorway: one of them stands aside for a moment.
      a.yieldUntil = t + 0.6 + (hashId(a.id) % 7) * 0.15;
      a.path = null; a.pathGoal = null; a.repathAt = 0;
      return false;
    }
  }
  const next = a.path[0];
  const dx = next.x - a.pos.x, dy = next.y - a.pos.y;
  const d = Math.hypot(dx, dy);
  const last = a.path.length === 1;
  if (d < (last ? 0.25 : 0.45)) {
    a.path.shift();
    if (a.path.length === 0) { a.vel.x = 0; a.vel.y = 0; return true; }
    return false;
  }
  const s = Math.min(speed, d / dt);
  a.vel.x = (dx / d) * s;
  a.vel.y = (dy / d) * s;
  a.facing = angleToward(a.facing, Math.atan2(dy, dx), 8 * dt);
  return false;
}

/**
 * Run the agent's plan: one step at a time, in order. Returns an event name
 * when something the sim should know about happens.
 */
export function runPlan(a: Agent, t: number, dt: number, world: World, nav: Nav, rng: Rng): 'left' | 'stepped' | null {
  const step: Step | undefined = a.spec.plan[a.stepIdx];
  if (!step) { a.vel.x = a.vel.y = 0; return null; }
  const advance = () => { a.stepIdx++; a.stepStarted = t; a.path = null; a.pathGoal = null; return 'stepped' as const; };
  switch (step.do) {
    case 'go': {
      a.activity = 'walk';
      const goal = placeOf(world, step.to);
      const speed = (step.brisk ? BRISK : WALK) * (a.spec.role === 'civilian' ? 0.9 + (a.spec.aware % 0.2) : 1);
      if (walkTo(a, goal, speed, t, dt, world, nav)) {
        if (typeof step.to === 'string') a.restFacing = world.poi(step.to).facing;
        return advance();
      }
      return null;
    }
    case 'act': {
      a.activity = step.act;
      a.vel.x = a.vel.y = 0;
      if (step.facing !== undefined) a.restFacing = step.facing;
      if (a.restFacing !== null && a.glance <= 0) a.facing = angleToward(a.facing, a.restFacing, 3 * dt);
      const end = step.until ?? (step.for !== undefined ? a.stepStarted + step.for : Infinity);
      if (t >= end) return advance();
      return null;
    }
    case 'patrol': {
      a.activity = 'patrol';
      if (step.until !== undefined && t >= step.until) return advance();
      const wp = step.route[a.patrolIdx % step.route.length];
      if (walkTo(a, wp, GUARD_WALK, t, dt, world, nav)) {
        a.patrolIdx++;
        a.path = null; a.pathGoal = null;
        // A guard pauses at each corner and looks around.
        a.distractedUntil = Math.max(a.distractedUntil, 0);
        if (rng.chance(0.5)) { a.stir = 0.6; }
      }
      return null;
    }
    case 'leave':
      a.live = false;
      a.gone = true;
      a.vel.x = a.vel.y = 0;
      return 'left';
  }
}

/** Attention of an agent right now, before alert and glance. */
export function baseAttention(a: Agent, t: number): number {
  let attn = ACTIVITY[a.activity].attn * (0.55 + a.spec.aware * 0.9);
  if (t < a.distractedUntil) attn *= 0.15;
  return clamp(attn, 0, 1);
}

/** Integrate velocity and keep people out of walls and out of each other. */
export function moveAgents(agents: Agent[], t: number, dt: number, world: World): void {
  const live = agents.filter((a) => a.live);
  for (const a of live) {
    a.pos.x += a.vel.x * dt;
    a.pos.y += a.vel.y * dt;
  }
  // Gentle separation so crowds queue instead of stacking.
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0.36 || d2 < 1e-6) continue;
      const d = Math.sqrt(d2), push = (0.6 - d) * 0.5;
      const aMoving = a.vel.x !== 0 || a.vel.y !== 0, bMoving = b.vel.x !== 0 || b.vel.y !== 0;
      if (aMoving !== bMoving) {
        // Whoever is walking steps around whoever is standing: sideways, not back.
        const w = aMoving ? a : b, s = aMoving ? b : a;
        const sp = Math.hypot(w.vel.x, w.vel.y) || 1;
        let px = -w.vel.y / sp, py = w.vel.x / sp;
        if ((s.pos.x - w.pos.x) * px + (s.pos.y - w.pos.y) * py > 0) { px = -px; py = -py; }
        w.pos.x += px * push * 1.4; w.pos.y += py * push * 1.4;
        continue;
      }
      a.pos.x -= (dx / d) * push * 0.5; a.pos.y -= (dy / d) * push * 0.5;
      b.pos.x += (dx / d) * push * 0.5; b.pos.y += (dy / d) * push * 0.5;
    }
  }
  for (const a of live) world.collide(a.pos, 0.28, t, a.access);
}
