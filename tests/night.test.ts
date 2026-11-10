import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { NIGHT_LENGTH } from '../src/sim/clock';

const idle = { mx: 0, my: 0, hood: false };

describe('a night at Calder Central', () => {
  it('runs from 23:12 until the Night Mail leaves, and nobody walking gets stuck', () => {
    const sim = new Sim(7);
    const last = new Map<string, { x: number; y: number; t: number }>();
    const stuck = new Set<string>();
    while (!sim.ended) {
      sim.step(1 / 60, idle);
      if (sim.tick % 60 !== 0) continue;
      for (const a of sim.agents) {
        if (!a.live || a.spec.plan[a.stepIdx]?.do !== 'go') { last.delete(a.id); continue; }
        const l = last.get(a.id);
        if (!l || Math.hypot(a.pos.x - l.x, a.pos.y - l.y) > 1) last.set(a.id, { x: a.pos.x, y: a.pos.y, t: sim.t });
        else if (sim.t - l.t > 12) stuck.add(`${a.id}@${a.pos.x.toFixed(1)},${a.pos.y.toFixed(1)}`);
      }
    }
    expect(sim.ended).toBe('departed');
    expect(sim.t).toBeGreaterThanOrEqual(NIGHT_LENGTH);
    expect([...stuck]).toEqual([]);
    expect(sim.agent('pell')!.gone).toBe(true);
  });

  it('is deterministic: the same seed plays the same night', () => {
    const run = (seed: number) => {
      const sim = new Sim(seed);
      for (let i = 0; i < 6000; i++) sim.step(1 / 60, { mx: i % 600 < 300 ? 1 : -0.5, my: 0.2, hood: i === 900 });
      return sim.agents.map((a) => `${a.pos.x.toFixed(4)},${a.pos.y.toFixed(4)}`).join('|') + sim.player.pos.x.toFixed(4);
    };
    expect(run(3)).toBe(run(3));
    expect(run(3)).not.toBe(run(4));
  });
});
