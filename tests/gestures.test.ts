import { describe, expect, it } from 'vitest';
import { Gestures, keyVector, STICK_RADIUS } from '../src/input/gestures';

describe('touch gestures', () => {
  it('a thumb makes a floating stick where it lands', () => {
    const g = new Gestures();
    g.down(1, 100, 500);
    expect(g.vector()).toEqual({ x: 0, y: 0 });
    g.move(1, 100 + STICK_RADIUS, 500);
    const v = g.vector();
    expect(v.x).toBeCloseTo(1, 5);
    expect(v.y).toBeCloseTo(0, 5);
  });

  it('a small push creeps, the rim runs', () => {
    const g = new Gestures();
    g.down(1, 0, 0);
    g.move(1, 0, 20);
    const creep = Math.hypot(g.vector().x, g.vector().y);
    expect(creep).toBeLessThan(0.45);
    g.move(1, 0, STICK_RADIUS);
    expect(Math.hypot(g.vector().x, g.vector().y)).toBeGreaterThan(0.92);
  });

  it('the base follows a thumb that runs past the rim', () => {
    const g = new Gestures();
    g.down(1, 0, 0);
    g.move(1, 300, 0);
    expect(g.base.x).toBeGreaterThan(200);
    expect(g.vector().x).toBeCloseTo(1, 5);
  });

  it('a second finger lets go of the stick and pinches to zoom', () => {
    const g = new Gestures();
    g.down(1, 100, 100);
    g.down(2, 200, 100);
    expect(g.active).toBe(false);
    g.move(2, 300, 100);
    expect(g.zoom).toBeCloseTo(1.8, 5);
    g.move(2, 150, 100);
    expect(g.zoom).toBeCloseTo(0.65, 5);
    g.up(1); g.up(2);
    expect(g.vector()).toEqual({ x: 0, y: 0 });
  });

  it('keyboard walks by default, Shift runs, C creeps', () => {
    expect(Math.hypot(...Object.values(keyVector(new Set(['KeyW'])))) ).toBeCloseTo(0.7);
    expect(Math.hypot(...Object.values(keyVector(new Set(['KeyW', 'ShiftLeft']))))).toBeCloseTo(1);
    expect(Math.hypot(...Object.values(keyVector(new Set(['KeyD', 'KeyC']))))).toBeCloseTo(0.3);
  });
});
