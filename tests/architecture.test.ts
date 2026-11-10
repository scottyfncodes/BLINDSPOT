/**
 * The simulation stays pure: no DOM, no rendering, no wall clock, no
 * Math.random. That is what makes a night replayable and these tests honest.
 * (The rule and the test pattern come from UNDERWATCH.)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { Nav } from '../src/sim/nav';
import { stationWorld } from '../src/content/station';

const PURE = ['src/sim', 'src/content', 'src/theft', 'src/core'];
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []);

describe('architecture', () => {
  for (const dir of PURE) {
    for (const f of files(dir)) {
      if (f.endsWith('loop.ts')) continue; // the loop is the one place that reads the frame clock
      it(`${f} is pure`, () => {
        const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
        expect(src).not.toMatch(/Math\.random|Date\.now|performance\.now|setTimeout|document\.|window\./);
        expect(src).not.toMatch(/from '\.\.\/(render|ui|audio|input)\//);
      });
    }
  }
});

describe('the station is sound', () => {
  const world = new World(stationWorld());
  const nav = new Nav(world);
  it('every place people go can be reached from the street', () => {
    const none = new Set<never>();
    const start = world.poi('exit-w');
    for (const p of world.def.pois) {
      if (p.id === 'break' || p.id === 'staffroom' || p.id === 'coach-post') continue;
      expect(nav.path(start, p, 0, none), p.id).not.toBeNull();
    }
  });
  it('the staff side is only reachable with a card', () => {
    const start = world.poi('exit-w');
    expect(nav.path(start, world.poi('break'), 0, new Set())).toBeNull();
    expect(nav.path(start, world.poi('break'), 0, new Set(['staff']))).not.toBeNull();
  });
  it('every camera is on a circuit with a junction box', () => {
    const circuits = new Set(world.def.junctions.map((j) => j.circuit));
    for (const c of world.def.cameras) expect(circuits.has(c.circuit), c.id).toBe(true);
  });
  it('no camera is mounted inside something opaque', () => {
    for (const c of world.def.cameras) {
      const blocked = world.def.solids.some((s) => s.opaque && c.x > s.x && c.x < s.x + s.w && c.y > s.y && c.y < s.y + s.h);
      expect(blocked, c.id).toBe(false);
    }
  });
});
