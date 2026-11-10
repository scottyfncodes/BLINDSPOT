/**
 * How people and cameras see the player.
 *
 * Carried from LIFT (attention x cone x suspicion, the glance telegraph,
 * staff who are only suspicious with cause) and rebuilt for a city: real
 * line of sight instead of "same carriage", light as cover, crowds as cover.
 */
import { angleDelta, clamp, dist, type Vec2 } from '../core/math';
import type { Rng } from '../core/rng';
import { ACTIVITY } from './agentTypes';
import { baseAttention, isSecurity, type Agent } from './agents';
import type { World } from './world';

/** What the player is doing that a witness could hold against them. */
export interface Conduct {
  running: boolean;
  sneaking: boolean;
  restricted: boolean;
  fareDodge: boolean;
  tampering: boolean;
  hoodFlip: boolean;
  /** Security holds a description that fits the player right now. */
  matches: boolean;
}

export const NO_CONDUCT: Conduct = { running: false, sneaking: false, restricted: false, fareDodge: false, tampering: false, hoodFlip: false, matches: false };

/** Site alert: CALM, WARY, SEARCHING, LOCKDOWN. Everyone looks harder. */
export const ALERT_ATTN = [1, 1.15, 1.3, 1.55];

export function coneOf(a: Agent): { half: number; range: number } {
  const sec = isSecurity(a);
  let half = sec ? 1.15 : 0.95;
  let range = sec ? 13 : 9;
  if (a.activity === 'sleep') { half = 0.2; range = 3; }
  if (a.glance > 0) half += 0.6;
  return { half, range };
}

/**
 * How visible the player is to an observer, 0..1. Distance, cone, a clear
 * line, the light on the player, and how many people stand around them.
 */
export function visibility(
  world: World, t: number, eye: Vec2, facing: number, half: number, range: number, target: Vec2,
  crowd: number, sneaking: boolean, proximitySense: boolean,
): number {
  const d = dist(eye, target);
  if (d > range) return 0;
  const inCone = d < 1e-6 || Math.abs(angleDelta(facing, Math.atan2(target.y - eye.y, target.x - eye.x))) <= half;
  if (!inCone) {
    // Someone right beside you feels you there even without looking.
    if (proximitySense && d < 1.2) return 0.5;
    return 0;
  }
  if (!world.lineOfSight(eye, target, t)) return 0;
  const light = world.lightAt(target);
  let v = (1 - d / range) * (0.3 + 0.7 * light);
  if (crowd >= 3) v *= 0.7;
  else if (crowd >= 2) v *= 0.85;
  if (sneaking) v *= 0.8;
  return clamp(v, 0, 1);
}

/** What a civilian holds against you: behaviour only. */
export function civilianBehaviour(c: Conduct, d: number, tailed: number, victimMatch: boolean): number {
  let b = 0;
  if (c.running && d < 8) b += 1.0;
  if (c.sneaking && d < 3) b += 0.6;
  if (c.restricted) b += 0.6;
  if (c.fareDodge) b += 0.4;
  if (c.tampering) b += 1.2;
  if (c.hoodFlip) b += 1.5;
  if (tailed > 6) b += 0.7;
  if (victimMatch) b += 2;
  return b;
}

/** What staff, guards and cameras hold against you: cause. */
export function securityCause(c: Conduct, alert: number, d: number): number {
  let cause = 0;
  if (c.matches) cause += 2.2;
  if (c.restricted) cause += 1.6;
  if (c.running) cause += 0.7;
  if (c.fareDodge) cause += 2.0;
  if (c.tampering) cause += 2.5;
  if (c.hoodFlip) cause += 0.8;
  if (c.sneaking && d < 4) cause += 0.5;
  if (alert >= 2) cause += 0.4;
  return cause;
}

/** Advance the glance cycle: stir (the 0.6 s tell), then a look around. */
export function updateGlance(a: Agent, dt: number, rng: Rng, toward: number | null): boolean {
  let started = false;
  if (a.glance > 0) {
    a.glance -= dt;
    a.facing += clamp(angleDelta(a.facing, a.glanceDir), -4 * dt, 4 * dt);
    if (a.glance <= 0) {
      a.glance = 0;
      const stir = ACTIVITY[a.activity].stir;
      a.nextGlance = rng.range(5, 13) / stir * (1.2 - a.spec.aware * 0.5);
    }
  } else if (a.stir > 0) {
    a.stir -= dt;
    if (a.stir <= 0) {
      a.stir = 0;
      a.glance = rng.range(0.85, 1.35);
      a.glanceDir = toward ?? a.facing + rng.range(-1.6, 1.6);
      started = true;
    }
  } else {
    a.nextGlance -= dt;
    if (a.nextGlance <= 0) a.stir = 0.6;
  }
  return started;
}

export function attentionOf(a: Agent, t: number, alert: number): number {
  let attn = baseAttention(a, t) * ALERT_ATTN[clamp(Math.round(alert), 0, 3)];
  if (a.glance > 0) attn = Math.max(attn, 0.92);
  if (a.suspicion > 50) attn = Math.max(attn, 0.5 + a.suspicion / 250);
  return clamp(attn, 0, 1);
}

/** How fast suspicion grows from what is seen, per second. */
export function suspicionRate(a: Agent, attn: number, vis: number, d: number, c: Conduct, alert: number, victimMatch: boolean): number {
  if (vis <= 0) return 0;
  if (isSecurity(a)) return securityCause(c, alert, d) * vis * attn * 26;
  const near = d < 3 ? 1 : d < 6 ? 0.55 : 0.25;
  return civilianBehaviour(c, d, a.tailed, victimMatch) * attn * vis * near * 24;
}
