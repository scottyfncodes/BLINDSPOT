/**
 * THE DIP. A pocket lift played with one finger.
 *
 * Ported from LIFT (js/mini/common.js MiniBase + js/mini/pickpocket.js DipGame)
 * at 70557ed, as pure logic: no DOM, no window, no Math.random, so it can be
 * tested and replayed. Fixes on the way over: `glanceMul` is required and
 * typed (LIFT went NaN without it), the mark's look cycle uses the seeded RNG,
 * and a PLANT mode puts something back into a pocket.
 *
 * Design space is 400 x 400. The pocket is a trapezoid in its own (u, v)
 * frame: u across the mouth, v down into the pocket.
 */
import { clamp } from '../core/math';
import { Rng } from '../core/rng';
import type { ItemKind, Pocket } from '../sim/agentTypes';

export type LiftQuality = 'critical' | 'clean' | 'sloppy';

export interface DipOptions {
  mode: 'lift' | 'plant';
  pocket: Pocket;
  item: ItemKind;
  /** Starting awareness from the world, 0..90 (see liftSetup). */
  start: number;
  /** How costly moving during their glance is. */
  glanceMul: number;
  aware: number;
  /** Their activity's stir factor: low means they look up rarely. */
  stir: number;
  /** A crowd periodically covers your movements. */
  crowdCover: boolean;
  seed: number;
}

export interface DipResult {
  success: boolean;
  aborted?: boolean;
  quality?: LiftQuality;
  why?: 'brush' | 'speed' | 'glance' | 'impatience' | 'fumble';
  peak: number;
}

interface PocketShape { cx: number; cy: number; w: number; d: number; a: number; name: string; bag?: boolean }

export const POCKETS: Record<Pocket, PocketShape> = {
  hip: { cx: 205, cy: 150, w: 170, d: 175, a: -0.06, name: 'hip pocket' },
  breast: { cx: 210, cy: 120, w: 112, d: 215, a: 0.12, name: 'inside breast pocket' },
  waist: { cx: 200, cy: 165, w: 120, d: 130, a: -0.1, name: 'belt clip pouch' },
  bag: { cx: 200, cy: 140, w: 160, d: 170, a: 0, name: 'bag', bag: true },
};

const ITEM_R: Record<ItemKind, number> = { cash: 20, phone: 22, card: 17 };

export const COAT_SPOT = { x: 345, y: 355, r: 38 };
export const PATIENCE = 24;
export const GRIP_TIME = 0.42;

export class Dip {
  readonly o: DipOptions;
  readonly P: PocketShape;
  readonly tol: number;
  readonly speedLim: number;
  readonly itemR: number;
  private rng: Rng;

  aw: number;
  peak: number;
  t = 0;
  done = false;
  result: DipResult | null = null;
  near = 0;

  // The hand
  hx = 70; hy = 380; hv = 0;
  private off: { x: number; y: number } | null = null;
  private finger: { x: number; y: number } | null = null;

  inside = false;
  gripT = 0;
  gripped: boolean;
  extracted = false;
  placed = false;
  concealT = 0;
  readonly itemLocal: { u: number; v: number };
  pen = 0;
  lastWall: 'L' | 'R' | 'B' | null = null;
  private contact = false;

  // The mark
  stir = 0;
  glance = 0;
  private nextStir: number;
  coverT = 0;
  private nextCover: number;

  /** Short message for the view, with seconds left to show it. */
  msg: string | null = null;
  msgT = 0;
  /** Things the view should play: 'brush', 'grip', 'out', 'stir', 'freeze', 'cover'. */
  cues: string[] = [];

  constructor(o: DipOptions) {
    this.o = o;
    this.rng = new Rng(o.seed);
    this.P = { ...POCKETS[o.pocket] };
    this.aw = clamp(o.start, 0, 90);
    this.peak = this.aw;
    this.tol = 14 + (o.pocket === 'hip' ? 4 : 0);
    this.speedLim = 125;
    this.itemR = ITEM_R[o.item];
    this.gripped = o.mode === 'plant';
    this.itemLocal = { u: (this.rng.next() - 0.5) * this.P.w * 0.3, v: this.P.d * (0.62 + this.rng.next() * 0.18) };
    this.nextStir = this.rollStir();
    this.nextCover = 3 + this.rng.next() * 3;
  }

  get hint(): string {
    if (this.o.mode === 'plant') {
      if (this.placed) return 'Placed. Ease out the way you came.';
      return `Slide it back into the ${this.P.name}. Let go at the bottom.`;
    }
    if (this.extracted) return 'Conceal it: drag to your jacket, bottom right.';
    if (this.gripped) return 'Got it. Ease it out the way you came.';
    return `Drag into the ${this.P.name}. Slowly.`;
  }

  private rollStir(): number {
    return (2.6 + this.rng.next() * 3.4) / Math.max(0.25, this.o.stir) * (1.3 - this.o.aware * 0.5);
  }

  pointerDown(x: number, y: number): void {
    this.finger = { x, y };
    // Grab offset: the hand stays where it is instead of jumping under the finger.
    this.off = { x: this.hx - x, y: this.hy - y };
  }
  pointerMove(x: number, y: number): void { if (this.finger) { this.finger.x = x; this.finger.y = y; } }
  pointerUp(): void { this.finger = null; this.off = null; this.gripT = this.o.mode === 'plant' ? this.gripT : 0; }

  /** Withdraw empty-handed. */
  abort(): void {
    if (this.done) return;
    this.done = true;
    this.result = { success: false, aborted: true, peak: this.peak };
  }

  private say(m: string, t = 1.2): void { this.msg = m; this.msgT = t; }

  private addAw(n: number, why: DipResult['why']): void {
    if (this.done || !(n > 0)) return;
    this.aw = clamp(this.aw + n, 0, 100);
    this.peak = Math.max(this.peak, this.aw);
    if (this.aw >= 100) { this.done = true; this.result = { success: false, why, peak: 100 }; }
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    const quality: LiftQuality = this.peak < 32 && this.near === 0 ? 'critical' : this.peak < 66 ? 'clean' : 'sloppy';
    this.result = { success: true, quality, peak: this.peak };
  }

  toLocal(x: number, y: number): { u: number; v: number } {
    const P = this.P, ca = Math.cos(-P.a), sa = Math.sin(-P.a);
    const dx = x - P.cx, dy = y - P.cy;
    return { u: dx * ca - dy * sa, v: dx * sa + dy * ca };
  }
  toWorld(u: number, v: number): { x: number; y: number } {
    const P = this.P, ca = Math.cos(P.a), sa = Math.sin(P.a);
    return { x: P.cx + u * ca - v * sa, y: P.cy + u * sa + v * ca };
  }
  halfW(v: number): number { return this.P.w / 2 * (1 - 0.14 * clamp(v / this.P.d, 0, 1)); }

  get masked(): number { return this.coverT > 0 ? 0.3 : 1; }

  update(dt: number): void {
    if (this.done) return;
    this.cues.length = 0;
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;

    // Crowd cover: every few seconds someone brushes past and hides you.
    if (this.o.crowdCover) {
      if (this.coverT > 0) this.coverT -= dt;
      this.nextCover -= dt;
      if (this.nextCover <= 0) { this.coverT = 1.4; this.nextCover = 5 + this.rng.next() * 4; this.cues.push('cover'); }
    }
    // The mark's look cycle: a 0.65 s stir you can see coming, then a glance.
    if (this.glance > 0) { this.glance -= dt; if (this.glance <= 0) this.nextStir = this.rollStir(); }
    else if (this.stir > 0) { this.stir -= dt; if (this.stir <= 0) this.glance = 0.85 + this.rng.next() * 0.5; }
    else { this.nextStir -= dt; if (this.nextStir <= 0) { this.stir = 0.65; this.cues.push('stir'); } }
    // Patience: linger and they notice anyway.
    if (this.t > PATIENCE) this.addAw(5 * dt, 'impatience');
    else this.aw = Math.max(0, this.aw - (this.glance > 0 ? 0 : 2.2) * dt);

    const P = this.P;
    let tx = this.hx, ty = this.hy;
    if (this.finger && this.off) { tx = this.finger.x + this.off.x; ty = this.finger.y + this.off.y; }
    const k = Math.min(1, dt * 16);
    let nx = this.hx + (tx - this.hx) * k, ny = this.hy + (ty - this.hy) * k;
    const vel = Math.hypot(nx - this.hx, ny - this.hy) / Math.max(dt, 1e-3);
    const prev = this.toLocal(this.hx, this.hy);
    const L = this.toLocal(nx, ny);
    const carrying = this.gripped;
    const extra = carrying ? this.itemR * 0.55 : 0;

    // Entering the pocket: only through the mouth.
    if (!this.inside && !this.extracted) {
      if (prev.v <= 0 && L.v > 0) {
        if (Math.abs(L.u) < this.halfW(0) - 4) this.inside = true;
        else {
          L.v = 0;
          const w = this.toWorld(L.u, -1); nx = w.x; ny = w.y;
          this.addAw(4, 'fumble'); this.cues.push('brush');
        }
      }
    }
    this.pen = 0; this.lastWall = null;
    if (this.inside) {
      if (L.v < 0) {
        const out = this.o.mode === 'lift' ? this.gripped : this.placed;
        if (out && Math.abs(L.u) < this.halfW(0)) {
          this.inside = false;
          if (this.o.mode === 'lift') { this.extracted = true; this.cues.push('out'); this.say('Out.', 0.8); }
          else { this.hx = nx; this.hy = ny; this.finish(); return; }
        } else if (Math.abs(L.u) < this.halfW(0)) this.inside = false;
        else L.v = 1;
      }
      if (this.inside) {
        const hw = this.halfW(L.v);
        const sideClear = hw - Math.abs(L.u) - extra, botClear = P.d - L.v - extra * 0.6;
        const clear = Math.min(sideClear, botClear);
        this.lastWall = sideClear < botClear ? (L.u < 0 ? 'L' : 'R') : 'B';
        if (clear < this.tol) {
          this.pen = clamp((this.tol - clear) / this.tol, 0, 1.4);
          if (clear < 0) {
            if (sideClear < 0) L.u = Math.sign(L.u) * (hw - extra);
            if (botClear < 0) L.v = P.d - extra * 0.6;
            const w = this.toWorld(L.u, L.v); nx = w.x; ny = w.y;
          }
        }
        if (this.pen > 0) {
          const moving = vel > 15 ? 1 : 0.25;
          this.addAw(this.pen * 62 * dt * this.masked * moving, 'brush');
          if (this.pen > 0.55 && !this.contact) { this.contact = true; this.near++; this.cues.push('brush'); this.say('The lining.', 0.9); }
        } else if (this.pen < 0.2) this.contact = false;
        if (vel > this.speedLim) this.addAw((vel - this.speedLim) * 0.4 * dt * this.masked, 'speed');
        // Grip (lift) or release (plant): hold still on the spot.
        const d = Math.hypot(L.u - this.itemLocal.u, L.v - this.itemLocal.v);
        const holding = this.finger !== null;
        if (this.o.mode === 'lift' && !this.gripped) {
          if (d < this.itemR + 8 && vel < 60 && holding) {
            this.gripT += dt;
            if (this.gripT > GRIP_TIME) { this.gripped = true; this.cues.push('grip'); }
          } else this.gripT = Math.max(0, this.gripT - dt * 2);
        } else if (this.o.mode === 'plant' && !this.placed) {
          if (d < this.itemR + 10 && vel < 60) {
            this.gripT += dt;
            if (this.gripT > GRIP_TIME) { this.placed = true; this.gripped = false; this.cues.push('grip'); this.say('Placed.', 0.8); }
          } else this.gripT = Math.max(0, this.gripT - dt * 2);
        }
      }
    }
    // Moving while they look round is how people get caught.
    const moving = (this.inside && vel > 25) || (!this.inside && !this.extracted && vel > 140);
    if (this.glance > 0 && moving) {
      this.addAw(110 * dt * this.o.glanceMul, 'glance');
      if (!this.msgT || this.msg !== 'Freeze.') { this.say('Freeze.', 0.6); this.cues.push('freeze'); }
    }
    this.hx = nx; this.hy = ny; this.hv = vel;
    if (this.extracted) {
      this.concealT += dt;
      if (this.concealT > 3) this.addAw(14 * dt, 'fumble');
      if (Math.hypot(this.hx - COAT_SPOT.x, this.hy - COAT_SPOT.y) < COAT_SPOT.r) this.finish();
    }
  }
}

/** Where the item sits, in design space (for drawing). */
export function itemPoint(d: Dip): { x: number; y: number } {
  return d.toWorld(d.itemLocal.u, d.itemLocal.v);
}
