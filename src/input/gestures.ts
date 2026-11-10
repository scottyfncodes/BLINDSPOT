/**
 * Touch gestures, as pure logic (no DOM; the caller passes coordinates).
 * The pattern is UNDERWATCH's TouchEngine: a testable engine behind a thin
 * DOM adapter. The gestures are new:
 *
 *  - one finger anywhere on the world: a floating stick, born where the
 *    thumb lands. Push a little to creep, further to walk, to the rim to run.
 *  - a second finger: the stick lets go and the two fingers pinch to zoom.
 */
export const STICK_RADIUS = 58;
const DEAD = 6;

interface Pt { x: number; y: number }

export class Gestures {
  private pts = new Map<number, Pt>();
  stickId: number | null = null;
  base: Pt = { x: 0, y: 0 };
  tip: Pt = { x: 0, y: 0 };
  private pinch: { d0: number; z0: number } | null = null;
  zoom = 1;
  minZoom = 0.65;
  maxZoom = 1.8;

  down(id: number, x: number, y: number): void {
    this.pts.set(id, { x, y });
    if (this.pts.size === 1) {
      this.stickId = id;
      this.base = { x, y };
      this.tip = { x, y };
      this.pinch = null;
    } else if (this.pts.size === 2) {
      this.stickId = null;
      const [a, b] = [...this.pts.values()];
      this.pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: this.zoom };
    }
  }

  move(id: number, x: number, y: number): void {
    const p = this.pts.get(id);
    if (!p) return;
    p.x = x; p.y = y;
    if (id === this.stickId) {
      this.tip = { x, y };
      // A floating stick follows a thumb that runs off its rim.
      const dx = x - this.base.x, dy = y - this.base.y, d = Math.hypot(dx, dy);
      if (d > STICK_RADIUS * 1.35) {
        const k = (d - STICK_RADIUS * 1.35) / d;
        this.base.x += dx * k; this.base.y += dy * k;
      }
    } else if (this.pinch && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.zoom = clampZoom(this.pinch.z0 * (d / this.pinch.d0), this.minZoom, this.maxZoom);
    }
  }

  up(id: number): void {
    this.pts.delete(id);
    if (id === this.stickId) this.stickId = null;
    if (this.pts.size < 2) this.pinch = null;
  }

  cancelAll(): void { this.pts.clear(); this.stickId = null; this.pinch = null; }

  wheel(dy: number): void { this.zoom = clampZoom(this.zoom * Math.exp(-dy * 0.0015), this.minZoom, this.maxZoom); }

  /** The stick as a vector with magnitude 0..1. */
  vector(): { x: number; y: number } {
    if (this.stickId === null) return { x: 0, y: 0 };
    const dx = this.tip.x - this.base.x, dy = this.tip.y - this.base.y;
    const d = Math.hypot(dx, dy);
    if (d < DEAD) return { x: 0, y: 0 };
    const m = Math.min(1, (d - DEAD) / (STICK_RADIUS - DEAD));
    return { x: (dx / d) * m, y: (dy / d) * m };
  }

  get active(): boolean { return this.stickId !== null; }
}

const clampZoom = (z: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, z));

/** Keyboard state to a stick vector: walk by default, Shift to run, Alt or C to creep. */
export function keyVector(keys: ReadonlySet<string>): { x: number; y: number } {
  let x = 0, y = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
  const d = Math.hypot(x, y);
  if (!d) return { x: 0, y: 0 };
  const m = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 1 : keys.has('AltLeft') || keys.has('KeyC') ? 0.3 : 0.7;
  return { x: (x / d) * m, y: (y / d) * m };
}
