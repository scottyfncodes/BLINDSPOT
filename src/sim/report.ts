/** Turning a finished night into what Wren carries forward. Pure. */
import { clockLabel } from './clock';
import type { Carry, Sim } from './sim';
import type { NightReport } from '../save/save';

export function nightReport(sim: Sim, night: number): { report: NightReport; carry: Carry } {
  const p = sim.player;
  const facts = [...sim.facts.values()];
  const learned = facts.filter((f) => f.status === 'confirmed' || f.status === 'false').length;
  const nightHeat = sim.nightHeat();
  const heat = Math.round(Math.min(100, sim.carry.heat * 0.5 + nightHeat));
  const clone: NightReport['clone'] = p.clone === 'held' && !p.revoked ? 'live' : p.clone === 'revoked' || (p.clone !== 'none' && p.revoked) ? 'revoked' : 'none';
  const consequences: string[] = [];
  const jA = sim.junctions.find((j) => j.def.id === 'A')!, jB = sim.junctions.find((j) => j.def.id === 'B')!;
  const cutsA = sim.carry.boxCutsA + jA.cuts, cutsB = sim.carry.boxCutsB + jB.cuts;
  if (jA.guarded || cutsA >= 2) consequences.push('Box A in Wire Alley gets a padlock and a guard. Cutting it again will not be quiet.');
  else if (jA.cuts) consequences.push('Someone has noticed box A failing. Its cameras will be on edge.');
  if (jB.guarded || cutsB >= 2) consequences.push('Box B in the staff corridor gets a guard on it.');
  else if (jB.cuts) consequences.push('Halvard logs a fault on box B. Its cameras will be on edge.');
  if (sim.description) consequences.push(`Security has a description: ${sim.description.look.hood ? 'pale jacket, hood up' : 'pale jacket, hood down, dark hair'}. From ${sim.description.source}.`);
  if (clone === 'revoked') consequences.push('Halvard cancelled the coach card. Expect a new card, and a courier who checks his belt.');
  if (sim.stats.flags) consequences.push(`LATTICE flagged you ${sim.stats.flags} time${sim.stats.flags > 1 ? 's' : ''}. The station's cameras start the next night watchful.`);
  if (sim.ended === 'caught') consequences.push('Detained, searched and photographed. You lose what you lifted tonight.');
  if (!consequences.length) consequences.push('Nothing. As far as Calder Central knows, you were never there.');
  const caught = sim.ended === 'caught';
  const cash = caught ? Math.min(p.cash, sim.carry.cash) : p.cash;
  const report: NightReport = {
    night,
    reason: sim.ended ?? 'departed',
    endedAt: clockLabel(sim.t),
    clone,
    reader: sim.facts.get('reader')!.status === 'confirmed',
    facts: facts.filter((f) => f.status !== 'unknown').map((f) => ({ id: f.id, title: f.title, status: f.status, text: f.text })),
    learned,
    total: facts.length,
    takes: caught ? 0 : p.takes.reduce((s, x) => s + x.value, 0),
    cash,
    nightHeat,
    heat,
    witnesses: sim.witnesses.size,
    description: sim.description ? (sim.description.look.hood ? 'hood up' : 'hood down') : null,
    consequences,
  };
  return { report, carry: { cash, heat, boxCutsA: cutsA, boxCutsB: cutsB } };
}

/** The one line that tells Wren what to do next. */
export function lead(sim: Sim): string {
  const p = sim.player;
  const pell = sim.agent('pell')!;
  const fp = sim.facts.get('pell')!;
  const reader = sim.facts.get('reader')!.status === 'confirmed';
  if (p.revoked) return 'The card is dead. Get out clean: walk off onto Kettle Street, or lie low until the Night Mail goes.';
  if (reader && p.clone === 'held' && p.card === 'none') return 'The copy opens the coach. Learn what you can before 23:46, or go home.';
  if (p.clone === 'copying') return `Dee is copying the card. Back at ${clockLabel(p.cloneReadyAt)}. Pell stands up at 23:31.`;
  if (p.clone === 'ready') return 'Collect the cards from Dee.';
  if (p.clone === 'held' && p.card === 'original') return 'Put the card back on Pell before he stands up at 23:31. He reads on the bench.';
  if (p.clone === 'held') return 'Test the copy on the coach door reader, east end of platform 1. Camera P3 watches it.';
  if (p.card === 'original') return p.cash >= 20 ? "Take the card to Dee's kiosk. She copies it for $20 in two minutes." : "Dee wants $20 to copy the card. Lift some cash first. You've got until 23:31.";
  if (!pell.live && !pell.gone) return 'The Night Mail leaves at 23:46. Its coach card comes in with a courier. Learn the station while you wait.';
  if (pell.gone) return 'Pell boarded with his card. Nothing left here but what you can learn.';
  if (fp.status !== 'confirmed') return 'A man in a long coat, with a case, came in off Kettle Street. Watch him.';
  if (p.cash < 20) return "Pell's card is on his belt. Dee charges $20 to copy one, so lift some cash first.";
  return "Pell's card is on his belt. Lift it while he reads. He stands up at 23:31.";
}
