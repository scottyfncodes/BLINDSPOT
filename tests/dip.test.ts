import { describe, expect, it } from 'vitest';
import { COAT_SPOT, Dip, itemPoint, type DipOptions } from '../src/theft/dip';

const base: DipOptions = { mode: 'lift', pocket: 'hip', item: 'cash', start: 10, glanceMul: 1, aware: 0.4, stir: 0.6, crowdCover: false, seed: 3 };

/** Drive the hand along waypoints at a speed (design px/s), holding still at stops. */
function play(d: Dip, path: Array<{ x: number; y: number; hold?: number }>, speed: number): void {
  const dt = 1 / 60;
  d.pointerDown(d.hx, d.hy);
  let fx = d.hx, fy = d.hy;
  for (const wp of path) {
    for (let guard = 0; guard < 2000 && !d.done; guard++) {
      const dx = wp.x - fx, dy = wp.y - fy, dist = Math.hypot(dx, dy);
      if (dist < 1) break;
      const step = Math.min(dist, speed * dt);
      fx += (dx / dist) * step; fy += (dy / dist) * step;
      d.pointerMove(fx, fy);
      d.update(dt);
    }
    for (let i = 0; i < (wp.hold ?? 0) * 60 && !d.done; i++) d.update(dt);
  }
}

describe('the Dip (ported from LIFT)', () => {
  it('a slow hand straight in, a hold on the item, out and into the jacket succeeds', () => {
    const d = new Dip({ ...base, stir: 0.05 });
    const item = itemPoint(d);
    const mouth = d.toWorld(0, -12);
    play(d, [{ x: mouth.x, y: mouth.y }, { x: item.x, y: item.y, hold: 0.6 }, { x: mouth.x, y: mouth.y }, { x: COAT_SPOT.x, y: COAT_SPOT.y }], 70);
    expect(d.done).toBe(true);
    expect(d.result?.success).toBe(true);
  });

  it('rushing it gets you felt', () => {
    const d = new Dip({ ...base, stir: 0.05 });
    const item = itemPoint(d);
    const mouth = d.toWorld(0, -12);
    const deep = d.toWorld(d.P.w * 0.45, d.P.d * 0.95);
    for (let k = 0; k < 6 && !d.done; k++) play(d, [{ x: mouth.x, y: mouth.y, hold: 0.3 }, { x: deep.x, y: deep.y }, { x: item.x, y: item.y }], 600);
    expect(d.result?.success).toBe(false);
  });

  it('awareness never goes NaN even with odd inputs (LIFT bug)', () => {
    const d = new Dip({ ...base, glanceMul: 0 });
    for (let i = 0; i < 600; i++) d.update(1 / 60);
    expect(Number.isFinite(d.aw)).toBe(true);
  });

  it('plant mode: carry it in, let go at the bottom, ease out', () => {
    const d = new Dip({ ...base, mode: 'plant', item: 'card', stir: 0.05 });
    expect(d.gripped).toBe(true);
    const item = itemPoint(d);
    const mouth = d.toWorld(0, -12);
    play(d, [{ x: mouth.x, y: mouth.y }, { x: item.x, y: item.y, hold: 0.6 }, { x: mouth.x, y: mouth.y - 10 }], 70);
    expect(d.placed).toBe(true);
    expect(d.result?.success).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const a = new Dip(base), b = new Dip(base);
    for (let i = 0; i < 900; i++) { a.update(1 / 60); b.update(1 / 60); }
    expect(a.aw).toBe(b.aw);
    expect(a.itemLocal).toEqual(b.itemLocal);
  });
});
