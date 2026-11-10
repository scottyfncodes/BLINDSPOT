/**
 * Calder Central, 23:12 to 23:46. The station where the Night Mail stops.
 *
 * Units are metres, y grows south. North of the station is Kettle Street;
 * south of the concourse the gateline, then platform 1 with the Night Mail
 * parked against it, then platform 2 where the Loop local calls.
 */
import { Rng } from '../core/rng';
import type { Vec2 } from '../core/math';
import { at } from '../sim/clock';
import type { AgentSpec, Appearance, Item, Pocket, Step } from '../sim/agentTypes';
import type { CameraDef, Door, JunctionDef, Light, Poi, Solid, Zone } from '../sim/types';
import type { WorldDef } from '../sim/world';

const PI = Math.PI;
const N = -PI / 2, S = PI / 2, E = 0, W = PI;

export const NIGHT_MAIL = { from: -1, until: at('23:46'), board: at('23:36') };
export const LOOP_LOCAL = { from: at('23:24'), until: at('23:26:30') };

const solid = (kind: Solid['kind'], x: number, y: number, w: number, h: number, z: number, opaque = true, extra: Partial<Solid> = {}): Solid =>
  ({ kind, x, y, w, h, z, opaque, ...extra });

function buildSolids(): Solid[] {
  const s: Solid[] = [];
  // Kettle Street frontage, across the road.
  s.push(solid('building', 0, 0, 30, 9, 16, true, { label: 'Calder Tool & Die', tint: '#3a3632' }));
  s.push(solid('building', 34, 0, 36, 9, 22, true, { label: 'Merrow House', tint: '#34363a' }));
  s.push(solid('building', 74, 0, 46, 9, 14, true, { label: 'Ostler Works', tint: '#3b3530' }));
  // Parked vans and street furniture.
  s.push(solid('vehicle', 12, 10.2, 5.5, 2.2, 2.4, true, { tint: '#55504a' }));
  s.push(solid('vehicle', 78, 10.2, 6, 2.3, 2.6, true, { tint: '#4a5048' }));
  s.push(solid('bin', 46, 18, 0.8, 0.8, 1.1, false));
  s.push(solid('bin', 70, 18, 0.8, 0.8, 1.1, false));
  s.push(solid('planter', 16, 22, 2.4, 1.2, 0.9, false));
  s.push(solid('planter', 104, 22, 2.4, 1.2, 0.9, false));
  // Station envelope. Entrances at x 20-28 and 56-64.
  s.push(solid('wall', 4, 24, 16, 1, 6), solid('wall', 28, 24, 28, 1, 6), solid('wall', 64, 24, 52, 1, 6));
  s.push(solid('wall', 4, 25, 1, 57, 6));
  s.push(solid('wall', 115, 25, 1, 30, 6));
  // Staff side: partition with the staff door at y 38-40.
  s.push(solid('wall', 100, 25, 1, 13, 6), solid('wall', 100, 40, 1, 14, 6));
  // Staff room wall with an open doorway at x 106-108.
  s.push(solid('wall', 101, 36, 5, 1, 6), solid('wall', 108, 36, 7, 1, 6));
  // Platform end of the staff corridor; the second staff door at x 104-106.
  s.push(solid('wall', 101, 54, 3, 1, 6), solid('wall', 106, 54, 9, 1, 6));
  s.push(solid('locker', 110, 26, 4.5, 1, 2.1, true));
  s.push(solid('counter', 103, 30, 4, 2, 0.8, false, { label: 'table' }));
  // Concourse.
  s.push(solid('kiosk', 29, 25, 8, 3.4, 2.6, true, { label: "DEE'S" }));
  s.push(solid('machine', 8, 25, 1.2, 1.1, 1.8, true, { label: 'TICKETS' }));
  s.push(solid('machine', 10.2, 25, 1.2, 1.1, 1.8, true, { label: 'TICKETS' }));
  s.push(solid('board', 44, 25, 12, 0.6, 3.2, true, { label: 'DEPARTURES' }));
  for (const x of [20, 40, 60, 80]) for (const y of [34, 43]) s.push(solid('pillar', x - 0.6, y - 0.6, 1.2, 1.2, 7));
  for (const [x, y] of [[24, 38.6], [44, 38.6], [64, 38.6], [64, 30.6], [84, 30.6]]) s.push(solid('bench', x, y, 8, 0.8, 0.5, false));
  // The gateline: low barriers with five gates.
  let gx = 5;
  for (const gate of [20, 35, 50, 65, 80]) {
    s.push(solid('barrier', gx, 47.6, gate - 0.8 - gx, 0.8, 1.1, false));
    gx = gate + 0.8;
  }
  s.push(solid('barrier', gx, 47.6, 100 - gx, 0.8, 1.1, false));
  // Platform canopy columns and benches.
  for (let x = 16; x <= 100; x += 12) s.push(solid('pillar', x - 0.3, 58.4, 0.6, 0.6, 5));
  for (const x of [20, 44, 68]) s.push(solid('bench', x, 60.6, 6, 0.7, 0.5, false));
  for (let x = 18; x <= 90; x += 14) s.push(solid('pillar', x - 0.3, 71.6, 0.6, 0.6, 5));
  for (const x of [26, 54]) s.push(solid('bench', x, 73.4, 6, 0.7, 0.5, false));
  // Buffer stops at the west end of both tracks.
  s.push(solid('fence', 9, 63.2, 0.6, 4.6, 1.2, false, { label: 'buffer' }));
  s.push(solid('fence', 9, 76.2, 0.6, 4.6, 1.2, false, { label: 'buffer' }));
  // Platform 2 east fence and the boundary fence south of track 2.
  s.push(solid('fence', 100, 68, 0.6, 8, 2, false));
  s.push(solid('fence', 5, 81, 115, 0.6, 2.2, false));
  // The Night Mail: three carriages and the Halvard courier coach.
  const NM = { until: NIGHT_MAIL.until };
  s.push(solid('train', 10, 63.6, 25, 3.8, 4, true, { ...NM, label: 'NIGHT MAIL', tint: '#5d1f22' }));
  s.push(solid('train', 35.6, 63.6, 25, 3.8, 4, true, { ...NM, tint: '#5d1f22' }));
  s.push(solid('train', 61.2, 63.6, 25, 3.8, 4, true, { ...NM, tint: '#5d1f22' }));
  s.push(solid('train', 86.8, 63.6, 26.2, 3.8, 4.2, true, { ...NM, label: 'HALVARD TRUST', tint: '#1f3a30' }));
  // The Loop local, calling briefly at platform 2.
  s.push(solid('train', 12, 76.6, 78, 3.8, 4, true, { from: LOOP_LOCAL.from, until: LOOP_LOCAL.until, label: 'LOOP', tint: '#3d4a52' }));
  return s;
}

const zones: Zone[] = [
  { id: 'street', name: 'Kettle Street', x: 0, y: 9, w: 120, h: 8, floor: 'asphalt', restricted: false, indoor: false },
  { id: 'pavement', name: 'Kettle Street', x: 0, y: 17, w: 120, h: 7, floor: 'pavement', restricted: false, indoor: false },
  { id: 'alley', name: 'Wire Alley', x: 30, y: 0, w: 4, h: 9, floor: 'alley', restricted: false, indoor: false },
  { id: 'concourse', name: 'Concourse', x: 5, y: 25, w: 95, h: 22.6, floor: 'tile', restricted: false, indoor: true },
  { id: 'gateline', name: 'Gateline', x: 5, y: 47.6, w: 95, h: 0.8, floor: 'tile', restricted: false, indoor: true },
  { id: 'paid', name: 'Concourse', x: 5, y: 48.4, w: 95, h: 5.6, floor: 'tile', restricted: false, indoor: true },
  { id: 'staff', name: 'Staff corridor', x: 101, y: 37, w: 14, h: 17, floor: 'staff', restricted: true, indoor: true },
  { id: 'staffroom', name: 'Staff room', x: 101, y: 25, w: 14, h: 11, floor: 'staff', restricted: true, indoor: true },
  { id: 'p1', name: 'Platform 1', x: 5, y: 54, w: 110, h: 9.6, floor: 'platform', restricted: false, indoor: false },
  { id: 'p1end', name: 'Platform end', x: 5, y: 63.6, w: 4, h: 4.8, floor: 'platform', restricted: false, indoor: false },
  { id: 't1', name: 'Track 1', x: 9, y: 63.6, w: 111, h: 4.8, floor: 'track', restricted: true, indoor: false },
  { id: 'p2', name: 'Platform 2', x: 5, y: 68.4, w: 95, h: 8.2, floor: 'platform', restricted: false, indoor: false },
  { id: 'p2end', name: 'Platform end', x: 5, y: 76.6, w: 4, h: 4.4, floor: 'platform', restricted: false, indoor: false },
  { id: 't2', name: 'Track 2', x: 9, y: 76.6, w: 111, h: 4.4, floor: 'track', restricted: true, indoor: false },
  { id: 'trackside', name: 'Track 1', x: 100.6, y: 68.4, w: 19.4, h: 8.2, floor: 'track', restricted: true, indoor: false },
];

const doors: Door[] = [
  { id: 'staff-door', label: 'Staff door', x: 100, y: 38, w: 1, h: 2, access: 'staff', reader: { x: 99.3, y: 37.2 } },
  { id: 'platform-door', label: 'Staff door', x: 104, y: 54, w: 2, h: 1, access: 'staff', reader: { x: 106.8, y: 55.7 } },
];

function buildLights(): Light[] {
  const L: Light[] = [];
  for (let x = 7; x < 120; x += 14) L.push({ x, y: 17.5, r: 9, strength: 0.75, tone: 'sodium' });
  L.push({ x: 32, y: 6, r: 3.5, strength: 0.25, tone: 'sodium' });
  for (let x = 15; x <= 90; x += 15) for (const y of [30, 44]) L.push({ x, y, r: 11, strength: 0.62, tone: 'fluoro' });
  L.push({ x: 33, y: 29.5, r: 5, strength: 0.5, tone: 'sign' });
  L.push({ x: 50, y: 27, r: 6, strength: 0.35, tone: 'sign' });
  for (const [x, y] of [[108, 30], [108, 45]]) L.push({ x, y, r: 7, strength: 0.45, tone: 'fluoro' });
  // Platform 1 lamps. The one at x 74 has been out for a week.
  for (let x = 14; x <= 110; x += 12) if (x !== 74) L.push({ x, y: 58.5, r: 8, strength: x === 110 ? 0.4 : 0.66, tone: 'sodium' });
  for (let x = 20; x <= 90; x += 14) L.push({ x, y: 72, r: 8, strength: 0.55, tone: 'sodium' });
  return L;
}

const cameras: CameraDef[] = [
  { id: 'K1', label: 'Kettle St', x: 40, y: 23.4, facing: N, sweep: 0.7, period: 10, phase: 0.1, range: 14, half: 0.5, circuit: 'A' },
  { id: 'C1', label: 'Concourse west', x: 5.6, y: 25.6, facing: PI / 4, sweep: 0.45, period: 9, phase: 0.3, range: 20, half: 0.45, circuit: 'A' },
  { id: 'C2', label: 'Concourse east', x: 99.4, y: 25.6, facing: 3 * PI / 4, sweep: 0.45, period: 11, phase: 0.7, range: 20, half: 0.45, circuit: 'A' },
  { id: 'C3', label: 'Gates west', x: 40, y: 43.8, facing: S, sweep: 0.7, period: 8, phase: 0.0, range: 13, half: 0.45, circuit: 'A' },
  { id: 'C4', label: 'Gates east', x: 80, y: 43.8, facing: S, sweep: 0.7, period: 10, phase: 0.5, range: 13, half: 0.45, circuit: 'A' },
  { id: 'P1', label: 'Platform west', x: 5.6, y: 54.6, facing: E, sweep: 0.12, period: 14, phase: 0.2, range: 24, half: 0.3, circuit: 'B' },
  { id: 'P2', label: 'Platform middle', x: 62, y: 54.6, facing: S, sweep: 1.0, period: 12, phase: 0.6, range: 14, half: 0.45, circuit: 'B' },
  { id: 'P3', label: 'Coach door', x: 114.4, y: 55.6, facing: W, sweep: 0.3, period: 7, phase: 0.4, range: 20, half: 0.4, circuit: 'B' },
];

const junctions: JunctionDef[] = [
  { id: 'A', label: 'Junction box, Wire Alley', x: 32, y: 1.4, circuit: 'A' },
  { id: 'B', label: 'Junction box, staff corridor', x: 114.3, y: 46, circuit: 'B' },
];

function buildPois(): Poi[] {
  const P: Poi[] = [];
  P.push({ id: 'exit-w', kind: 'exit', x: 0.6, y: 20.5, facing: W });
  P.push({ id: 'exit-e', kind: 'exit', x: 119.4, y: 20.5, facing: E });
  P.push({ id: 'kiosk', kind: 'kiosk', x: 33, y: 29.2, facing: N });
  P.push({ id: 'kiosk-q1', kind: 'stand', x: 30.6, y: 30.4, facing: N });
  P.push({ id: 'kiosk-q2', kind: 'stand', x: 35.6, y: 30.6, facing: N });
  P.push({ id: 'machine', kind: 'machine', x: 9.6, y: 27, facing: N });
  for (const x of [46, 49, 52, 55]) P.push({ id: `board-${x}`, kind: 'board', x, y: 29.5 + (x % 2) * 0.6, facing: N });
  // Bench seats: facing away from the bench's open side.
  const benches: Array<[number, number, number]> = [[24, 38.6, N], [44, 38.6, N], [64, 38.6, N], [64, 30.6, S], [84, 30.6, S]];
  benches.forEach(([bx, by, f], bi) => {
    for (let k = 0; k < 4; k++) P.push({ id: `seat-c${bi}-${k}`, kind: 'seat', x: bx + 1 + k * 2, y: f === N ? by + 1.3 : by - 0.5, facing: f });
  });
  for (const [bi, bx] of [[0, 20], [1, 44], [2, 68]] as const) for (let k = 0; k < 3; k++) {
    P.push({ id: `seat-p${bi}-${k}`, kind: 'seat', x: bx + 1 + k * 2, y: 60.1, facing: N });
  }
  const stands: Array<[number, number, number]> = [[14, 36, E], [30, 45, S], [52, 41, W], [70, 46, S], [90, 40, W], [26, 30, N], [74, 35, S], [58, 51, S], [86, 51, S], [12, 51, E]];
  stands.forEach(([x, y, f], i) => P.push({ id: `stand-${i}`, kind: 'stand', x, y, facing: f }));
  for (const x of [22, 34, 48, 58, 76, 84, 92]) P.push({ id: `wait-${x}`, kind: 'platform', x, y: 57 + (x % 3) * 1.2, facing: S });
  // Passenger doors of the Night Mail (the coach has its own).
  for (const x of [16, 28, 41, 54, 67, 80]) P.push({ id: `door-${x}`, kind: 'door', x, y: 63.0, facing: S });
  P.push({ id: 'coach-reader', kind: 'door', x: 98.4, y: 62.8, facing: S });
  P.push({ id: 'coach-post', kind: 'post', x: 100.8, y: 62.4, facing: N });
  P.push({ id: 'break', kind: 'break', x: 104.5, y: 33, facing: E });
  P.push({ id: 'staffroom', kind: 'post', x: 112, y: 31, facing: W });
  for (const x of [20, 35, 50, 65, 80]) P.push({ id: `loop-door-${x}`, kind: 'door', x, y: 76.0, facing: N });
  for (const x of [20, 35, 50, 65, 80]) {
    P.push({ id: `gate-n-${x}`, kind: 'stand', x, y: 46.6, facing: S });
    P.push({ id: `gate-s-${x}`, kind: 'stand', x, y: 49.4, facing: S });
  }
  P.push({ id: 'walkway', kind: 'stand', x: 7, y: 66, facing: S });
  return P;
}

export function stationWorld(): WorldDef {
  return {
    width: 120,
    height: 82,
    solids: buildSolids(),
    zones,
    doors,
    lights: buildLights(),
    cameras,
    junctions,
    pois: buildPois(),
    ambient: 0.1,
  };
}

// ---------------------------------------------------------------------------
// People

const SKIN = ['#8d5a3c', '#c38e6a', '#e2b897', '#5e3b29', '#a8714f', '#f0cdb0', '#704530'];
const HAIR = ['#1b1612', '#3a281c', '#6b4a2e', '#9a9488', '#c9a46a', '#2a2a2e'];

interface Archetype {
  id: string; aware: [number, number]; pocket: Pocket[]; cash: [number, number]; phone: number;
  coats: string[]; hats: Array<Appearance['hat']>; bags: Array<Appearance['bag']>;
  acts: Array<'phone' | 'read' | 'wait' | 'music' | 'talk' | 'sleep'>;
}

const ARCH: Archetype[] = [
  { id: 'office', aware: [0.4, 0.6], pocket: ['breast', 'hip'], cash: [8, 24], phone: 0.5, coats: ['#3b4250', '#2e3440', '#4a4f57'], hats: [undefined], bags: ['tote', undefined], acts: ['phone', 'phone', 'read', 'wait'] },
  { id: 'student', aware: [0.2, 0.38], pocket: ['hip'], cash: [2, 9], phone: 0.7, coats: ['#5a6b4a', '#6b3f3a', '#3c4f63'], hats: ['beanie', 'cap', undefined], bags: ['backpack'], acts: ['music', 'music', 'phone'] },
  { id: 'nightshift', aware: [0.4, 0.55], pocket: ['hip'], cash: [5, 16], phone: 0.3, coats: ['#4d4a3c', '#3f4743'], hats: ['beanie', undefined], bags: ['backpack', undefined], acts: ['wait', 'sleep', 'phone'] },
  { id: 'traveller', aware: [0.3, 0.45], pocket: ['bag', 'hip'], cash: [12, 30], phone: 0.4, coats: ['#6d5a44', '#53606b'], hats: [undefined, 'brim'], bags: ['suitcase'], acts: ['wait', 'read', 'phone'] },
  { id: 'elder', aware: [0.55, 0.75], pocket: ['breast', 'bag'], cash: [6, 20], phone: 0.1, coats: ['#5b4d42', '#47505a'], hats: ['brim', undefined], bags: ['tote', undefined], acts: ['read', 'wait'] },
  { id: 'suit', aware: [0.5, 0.7], pocket: ['breast'], cash: [15, 40], phone: 0.6, coats: ['#25282d', '#2f2a26'], hats: [undefined], bags: ['case'], acts: ['phone', 'wait'] },
];

const FIRST = ['Ines', 'Theo', 'Marguerite', 'Sol', 'Kofi', 'Rania', 'Bram', 'Odette', 'Yusuf', 'Pia', 'Callum', 'Noor', 'Ezra', 'June', 'Desmond', 'Ayo', 'Hollis', 'Mira', 'Tomasz', 'Leda', 'Ravi', 'Greer', 'Femi', 'Ilse', 'Cass', 'Dorian', 'Lucia', 'Otto', 'Saoirse', 'Wim'];
const LAST = ['Okafor', 'Vance', 'Sato', 'Lindqvist', 'Mbeki', 'Harrow', 'Quill', 'Ferreira', 'Nakamura', 'Doyle', 'Ashby', 'Kaur', 'Reyes', 'Brandvold', 'Ilić', 'Moreau'];

function makeLook(rng: Rng, a: Archetype): Appearance {
  return {
    coat: rng.pick(a.coats), skin: rng.pick(SKIN), hair: rng.pick(HAIR),
    hat: rng.pick(a.hats), bag: rng.pick(a.bags), build: rng.range(0.9, 1.12),
  };
}

function makeItem(rng: Rng, a: Archetype): Item {
  if (rng.chance(a.phone * 0.5)) return { kind: 'phone', value: rng.int(18, 40), label: 'a phone' };
  const v = rng.int(a.cash[0], a.cash[1]);
  return { kind: 'cash', value: v, label: `$${v}` };
}

/** Everyone who passes through Calder Central between 23:12 and 23:46. */
export function stationPeople(seed: number): AgentSpec[] {
  const rng = new Rng(seed);
  const out: AgentSpec[] = [];
  const used = new Set<string>();
  const name = () => {
    for (;;) {
      const n = `${rng.pick(FIRST)} ${rng.pick(LAST)}`;
      if (!used.has(n)) { used.add(n); return n; }
    }
  };
  let n = 0;
  const civ = (spawnAt: number, spawn: Vec2 | string, plan: Step[], arch?: Archetype): AgentSpec => {
    const a = arch ?? rng.pick(ARCH);
    return {
      id: `c${n++}`, name: name(), role: 'civilian', faction: 'civilian', archetype: a.id,
      aware: rng.range(a.aware[0], a.aware[1]), pocket: rng.pick(a.pocket), item: makeItem(rng, a),
      look: makeLook(rng, a), spawnAt, spawn, plan, access: [],
    };
  };
  const actOf = (a: string) => rng.pick(ARCH.find((x) => x.id === a)!.acts);
  const boardStep = (): Step[] => [
    { do: 'go', to: `gate-n-${rng.pick([20, 35, 50, 65, 80])}` },
    { do: 'go', to: `gate-s-${rng.pick([20, 35, 50, 65, 80])}` },
    { do: 'go', to: `wait-${rng.pick([22, 34, 48, 58, 76, 84, 92])}` },
    { do: 'act', act: 'wait', until: NIGHT_MAIL.board + rng.range(0, 30) },
    { do: 'go', to: `door-${rng.pick([16, 28, 41, 54, 67, 80])}` },
    { do: 'act', act: 'board', for: 1.2 },
    { do: 'leave' },
  ];
  const exitStep = (): Step[] => [{ do: 'go', to: rng.pick(['exit-w', 'exit-e']) }, { do: 'leave' }];

  // Already here at 23:12: seated, standing, at the board.
  // seat-c1-1 is Pell's: he sits there every night.
  const seats = [...Array(5).keys()].flatMap((b) => [0, 1, 2, 3].map((k) => `seat-c${b}-${k}`)).filter((id) => id !== 'seat-c1-1');
  const startSeats = seats.filter(() => rng.chance(0.45));
  for (const seat of startSeats) {
    const a = rng.pick(ARCH);
    const act = actOf(a.id);
    const leaves = rng.chance(0.3);
    out.push(civ(0, seat, [
      { do: 'act', act, until: leaves ? rng.range(at('23:16'), at('23:34')) : NIGHT_MAIL.board - rng.range(10, 60) },
      ...(leaves ? exitStep() : boardStep()),
    ], a));
  }
  for (let i = 0; i < 6; i++) {
    const a = rng.pick(ARCH);
    out.push(civ(0, `stand-${i}`, [
      { do: 'act', act: actOf(a.id), until: rng.range(at('23:14'), at('23:30')) },
      ...(rng.chance(0.5) ? boardStep() : exitStep()),
    ], a));
  }
  for (const x of [22, 48, 76]) {
    out.push(civ(0, `wait-${x}`, [{ do: 'act', act: 'wait', until: NIGHT_MAIL.board + rng.range(0, 40) }, { do: 'go', to: `door-${rng.pick([28, 54, 80])}` }, { do: 'act', act: 'board', for: 1 }, { do: 'leave' }]));
  }
  // Arrivals from Kettle Street, heavier as the Night Mail gets close.
  for (let t = at('23:13'); t < at('23:40'); t += rng.range(4.5, 9) * (t > at('23:30') ? 0.7 : 1)) {
    const from = rng.pick(['exit-w', 'exit-e']);
    const plan: Step[] = [];
    if (rng.chance(0.35)) plan.push({ do: 'go', to: rng.pick(['kiosk-q1', 'kiosk-q2']) }, { do: 'act', act: 'coffee', for: rng.range(6, 14) });
    else if (rng.chance(0.3)) plan.push({ do: 'go', to: `board-${rng.pick([46, 49, 52, 55])}` }, { do: 'act', act: 'wait', for: rng.range(4, 10) });
    if (t < at('23:32') && rng.chance(0.4)) plan.push({ do: 'go', to: rng.pick(seats) }, { do: 'act', act: rng.pick(['phone', 'read', 'wait'] as const), until: NIGHT_MAIL.board - rng.range(0, 40) });
    plan.push(...boardStep());
    out.push(civ(t, from, plan));
  }
  // The Loop local lets off a crowd at 23:24:30 that walks out to the street.
  for (let i = 0; i < 12; i++) {
    out.push(civ(LOOP_LOCAL.from + 4 + i * 0.7, `loop-door-${[20, 35, 50, 65, 80][i % 5]}`, [
      { do: 'go', to: 'walkway' },
      { do: 'go', to: `gate-s-${rng.pick([20, 35, 50])}` },
      { do: 'go', to: `gate-n-${rng.pick([20, 35, 50])}` },
      ...exitStep(),
    ]));
  }
  return out;
}

/** The people the job is about, and the people paid to stop it. */
export function stationCast(): AgentSpec[] {
  const pell: AgentSpec = {
    id: 'pell', name: 'Aldous Pell', role: 'courier', faction: 'halvard', archetype: 'courier', aware: 0.55,
    pocket: 'waist', item: { kind: 'card', value: 0, label: 'a Halvard coach card' },
    look: { coat: '#23272b', skin: '#d6a98a', hair: '#7d7468', hat: 'brim', bag: 'case', build: 1.08 },
    spawnAt: at('23:14'), spawn: 'exit-w', access: ['staff', 'coach'],
    plan: [
      { do: 'go', to: 'kiosk', brisk: true },
      { do: 'act', act: 'coffee', until: at('23:18') },
      { do: 'go', to: 'seat-c1-1', brisk: true },
      { do: 'act', act: 'read', until: at('23:31') },
      { do: 'go', to: 'gate-n-80' },
      { do: 'go', to: 'gate-s-80' },
      { do: 'go', to: 'coach-reader' },
      { do: 'act', act: 'board', until: at('23:33:30') },
      { do: 'leave' },
    ],
  };
  const kowalski: AgentSpec = {
    id: 'kowalski', name: 'Kowalski', role: 'guard', faction: 'staff', archetype: 'guard', aware: 0.6,
    pocket: 'hip', item: null,
    look: { coat: '#2b3a52', skin: '#e2b897', hair: '#3a281c', hat: 'cap', build: 1.15 },
    spawnAt: 0, spawn: { x: 14, y: 31 }, access: ['staff'],
    plan: [{ do: 'patrol', route: [{ x: 14, y: 31 }, { x: 50, y: 32 }, { x: 92, y: 32 }, { x: 92, y: 45.6 }, { x: 50, y: 46 }, { x: 14, y: 45.6 }] }],
  };
  const ade: AgentSpec = {
    id: 'ade', name: 'Ade', role: 'guard', faction: 'staff', archetype: 'guard', aware: 0.55,
    pocket: 'hip', item: null,
    look: { coat: '#2b3a52', skin: '#5e3b29', hair: '#1b1612', hat: 'cap', build: 1.05 },
    spawnAt: 0, spawn: { x: 30, y: 57 }, access: ['staff'],
    plan: [
      { do: 'patrol', route: [{ x: 12, y: 56.6 }, { x: 60, y: 57 }, { x: 108, y: 56.8 }, { x: 108, y: 61.8 }, { x: 60, y: 62 }, { x: 14, y: 61.8 }], until: at('23:30') },
      { do: 'go', to: 'break' },
      { do: 'act', act: 'break', until: at('23:34') },
      { do: 'patrol', route: [{ x: 12, y: 56.6 }, { x: 60, y: 57 }, { x: 108, y: 56.8 }, { x: 108, y: 61.8 }, { x: 60, y: 62 }, { x: 14, y: 61.8 }] },
    ],
  };
  const brandt: AgentSpec = {
    id: 'brandt', name: 'Brandt', role: 'escort', faction: 'halvard', archetype: 'escort', aware: 0.7,
    pocket: 'hip', item: null,
    look: { coat: '#1f3a30', skin: '#c38e6a', hair: '#2a2a2e', build: 1.2 },
    spawnAt: 0, spawn: 'staffroom', access: ['staff', 'coach'],
    plan: [
      { do: 'act', act: 'break', until: at('23:25') },
      { do: 'go', to: 'coach-post' },
      { do: 'act', act: 'post', facing: N },
    ],
  };
  return [pell, kowalski, ade, brandt];
}

/** Where Wren comes in: off Kettle Street, at the west end. */
export const PLAYER_START: Vec2 = { x: 3, y: 20.5 };

/** What Dee at the kiosk will sell you, true or not. */
export interface Tip { id: string; price: number; teaser: string; text: string; truth: boolean }
export const TIPS: Tip[] = [
  { id: 'tip-ade-break', price: 10, teaser: "When the platform guard isn't on the platform", text: 'Ade takes his break in the staff room from 23:30 to 23:34. Every night.', truth: true },
  { id: 'tip-p2-dead', price: 10, teaser: 'A camera on platform 1 nobody has fixed', text: 'The camera over the middle of platform 1 is dead. Has been all week.', truth: false },
];

export const PRICES = { ticket: 4, copy: 20 };
export const COPY_SECONDS = 2 * 60 / 6; // two minutes on the clock
