/**
 * The systems talking to each other: these are the claims the design makes.
 * Each one is played out in the sim, not asserted from a table.
 */
import { describe, expect, it } from 'vitest';
import { Sim } from '../src/sim/sim';
import { at } from '../src/sim/clock';
import { nightReport } from '../src/sim/report';

const idle = { mx: 0, my: 0, hood: false };
const run = (sim: Sim, seconds: number) => { for (let i = 0; i < seconds * 60 && !sim.ended; i++) sim.step(1 / 60, idle); };
const runUntil = (sim: Sim, t: number) => { while (sim.t < t && !sim.ended) sim.step(1 / 60, idle); };
/** Put Wren somewhere directly (tests skip the walking). */
const place = (sim: Sim, x: number, y: number) => { sim.player.pos = { x, y }; sim.player.prev = { x, y }; };

describe('the card', () => {
  it('a clean lift, a copy and a plant leave a live copy and nobody the wiser', () => {
    const sim = new Sim(11, { cash: 30, heat: 0, boxCutsA: 0, boxCutsB: 0 });
    runUntil(sim, at('23:21'));
    const pell = sim.agent('pell')!;
    expect(pell.activity).toBe('read');
    place(sim, pell.pos.x - 0.6, pell.pos.y + 0.6);
    const lift = sim.liftSetup('pell', 'lift')!;
    sim.resolveLift(lift, { success: true, quality: 'critical' });
    expect(sim.player.card).toBe('original');
    expect(sim.startCopy()).toBe(true);
    expect(sim.player.cash).toBe(10);
    run(sim, 21);
    expect(sim.player.clone).toBe('ready');
    sim.perform('kiosk');
    expect(sim.player.clone).toBe('held');
    expect(sim.player.card).toBe('original');
    sim.resolveLift(sim.liftSetup('pell', 'plant')!, { success: true, quality: 'clean' });
    expect(pell.item?.kind).toBe('card');
    runUntil(sim, at('23:31:30'));
    expect(sim.player.revoked).toBe(false);
    expect(sim.facts.get('returned')!.status).toBe('confirmed');
    expect(sim.playerAccess().has('coach')).toBe(true);
    // The copy opens the coach door.
    place(sim, 98.4, 62.2);
    sim.perform('reader');
    expect(sim.facts.get('reader')!.status).toBe('confirmed');
    runUntil(sim, 1e9);
    const { report } = nightReport(sim, 1);
    expect(report.clone).toBe('live');
    expect(report.reader).toBe(true);
  });

  it('keep the card past 23:31 and Pell finds it gone: Halvard cancels it and every copy', () => {
    const sim = new Sim(11, { cash: 30, heat: 0, boxCutsA: 0, boxCutsB: 0 });
    runUntil(sim, at('23:21'));
    const pell = sim.agent('pell')!;
    place(sim, pell.pos.x - 0.6, pell.pos.y + 0.6);
    sim.resolveLift(sim.liftSetup('pell', 'lift')!, { success: true, quality: 'clean' });
    sim.startCopy();
    run(sim, 21);
    sim.perform('kiosk');
    runUntil(sim, at('23:31:30'));
    expect(pell.discovered).toBe(true);
    expect(sim.player.revoked).toBe(true);
    expect(sim.player.clone).toBe('revoked');
    expect(sim.playerAccess().size).toBe(0);
    expect(sim.alert).toBeGreaterThanOrEqual(1);
  });

  it('a fumbled lift on Pell burns the card on the spot', () => {
    const sim = new Sim(11);
    runUntil(sim, at('23:21'));
    const pell = sim.agent('pell')!;
    place(sim, pell.pos.x - 0.6, pell.pos.y + 0.6);
    sim.resolveLift(sim.liftSetup('pell', 'lift')!, { success: false });
    expect(sim.player.revoked).toBe(true);
    expect(sim.description).not.toBeNull();
    expect(sim.stats.confrontations).toBe(1);
  });
});

describe('who is watching', () => {
  it('a lift starts harder in a bright, watched spot than in a quiet one', () => {
    const sim = new Sim(5);
    runUntil(sim, at('23:21'));
    const pell = sim.agent('pell')!;
    place(sim, pell.pos.x + 0.9, pell.pos.y + 0.4);
    // Looking away, absorbed in his paper.
    pell.facing = Math.atan2(-0.4, -0.9);
    const unseen = sim.liftSetup('pell', 'lift')!;
    // The same spot while he looks up, straight at you.
    pell.facing = Math.atan2(0.4, 0.9);
    pell.glance = 1;
    const seen = sim.liftSetup('pell', 'lift')!;
    expect(seen.start).toBeGreaterThan(unseen.start + 15);
    expect(seen.label).toBe('bad');
  });

  it('staff ignore an ordinary passer-by but act on a reason', () => {
    const sim = new Sim(5);
    const k = sim.agent('kowalski')!;
    runUntil(sim, 4);
    // Stand in front of the guard, doing nothing wrong.
    place(sim, k.pos.x + Math.cos(k.facing) * 3, k.pos.y + Math.sin(k.facing) * 3);
    for (let i = 0; i < 120; i++) sim.step(1 / 60, idle);
    expect(k.suspicion).toBeLessThan(5);
    // Now run circles in front of him.
    for (let i = 0; i < 240; i++) {
      place(sim, k.pos.x + Math.cos(k.facing) * 3, k.pos.y + Math.sin(k.facing) * 3);
      sim.step(1 / 60, { mx: Math.cos(i / 10), my: Math.sin(i / 10), hood: false });
    }
    expect(k.suspicion).toBeGreaterThan(20);
  });

  it('cutting a junction box blinds its cameras until somebody fixes it, and twice gets it guarded', () => {
    const sim = new Sim(5);
    const box = sim.junctions.find((j) => j.def.id === 'A')!;
    place(sim, box.def.x, box.def.y + 0.8);
    sim.perform('inspect:A');
    run(sim, 1.5);
    expect(sim.facts.get('circuit-A')!.status).toBe('confirmed');
    sim.perform('cut:A');
    run(sim, 3);
    expect(box.cut).toBe(true);
    expect(sim.cameras.filter((c) => c.def.circuit === 'A').every((c) => !c.online)).toBe(true);
    // Step away and let the station deal with it.
    place(sim, 3, 20);
    run(sim, 120);
    expect(box.cut).toBe(false);
    expect(sim.cameras.find((c) => c.def.id === 'C1')!.vigilance).toBeGreaterThan(0.3);
    place(sim, box.def.x, box.def.y + 0.8);
    sim.perform('cut:A');
    run(sim, 3);
    place(sim, 3, 20);
    run(sim, 140);
    expect(box.guarded).toBe(true);
  });
});

describe('what you know', () => {
  it('watching a camera for one full sweep learns it, and proves Dee lied about P2', () => {
    const sim = new Sim(5, { cash: 30, heat: 0, boxCutsA: 0, boxCutsB: 0 });
    expect(sim.buyTip('tip-p2-dead')).toBe(true);
    expect(sim.facts.get('tip-p2-dead')!.status).toBe('rumoured');
    // Stand on the platform where P2 can be watched (not in its cone).
    place(sim, 70, 55.4);
    run(sim, 13);
    expect(sim.facts.get('cam-P2')!.status).toBe('confirmed');
    expect(sim.facts.get('tip-p2-dead')!.status).toBe('false');
  });

  it('carries heat, cash and box cuts into the next night', () => {
    const sim = new Sim(5, { cash: 6, heat: 40, boxCutsA: 1, boxCutsB: 0 });
    runUntil(sim, 1e9);
    const { carry } = nightReport(sim, 2);
    expect(carry.heat).toBe(20);
    expect(carry.boxCutsA).toBe(1);
    // A hot city starts the night with watchful cameras.
    expect(new Sim(5, carry).cameras[0].vigilance).toBeGreaterThan(0);
  });
});
