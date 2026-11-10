/**
 * Set dressing for Calder Central: what makes it a place rather than a plan.
 * Render-only (nobody collides with a poster), except the lights a few of
 * these give off, which are added to the world's light list in station.ts
 * so that what looks lit is lit for perception too.
 */
import { Rng } from '../core/rng';
import type { Light, Solid } from '../sim/types';

export type Dressing =
  | { k: 'poster'; x: number; y: number; w: number; art: 'halvard' | 'lattice' | 'kettle' | 'gig' | 'lost' | 'calder'; lit: boolean }
  | { k: 'tag'; x: number; y: number; s: number; rot: number; art: 'eye' | 'wren' | 'wesee' | 'arrow' }
  | { k: 'litter'; x: number; y: number; rot: number; kind: 'cup' | 'paper' | 'butts' | 'can' }
  | { k: 'puddle'; x: number; y: number; r: number; seed: number }
  | { k: 'stain'; x: number; y: number; r: number; rot: number }
  | { k: 'tactile'; x: number; y: number; w: number; h: number }
  | { k: 'sign'; x: number; y: number; text: string; w: number }
  | { k: 'manhole'; x: number; y: number }
  | { k: 'grate'; x: number; y: number; steam: boolean }
  | { k: 'crossing'; x: number; y: number; w: number; h: number }
  | { k: 'window'; x: number; y: number; w: number; lit: boolean; warm: boolean }
  | { k: 'roofbox'; x: number; y: number; w: number; h: number; kind: 'ac' | 'vent' | 'tank' | 'skylight' }
  | { k: 'clock'; x: number; y: number }
  | { k: 'bikes'; x: number; y: number; n: number }
  | { k: 'lamp'; x: number; y: number; tall: boolean }
  | { k: 'timetable'; x: number; y: number };

export const POSTER_COLOURS: Record<string, { bg: string; fg: string; light: string }> = {
  halvard: { bg: '#1f3a30', fg: '#d8c58a', light: 'rgba(170,210,180,1)' },
  lattice: { bg: '#e9e3d6', fg: '#b8321f', light: 'rgba(240,236,226,1)' },
  kettle: { bg: '#2a3442', fg: '#e8d9b0', light: 'rgba(150,180,220,1)' },
  calder: { bg: '#5d1f22', fg: '#efe4cc', light: 'rgba(230,150,120,1)' },
  gig: { bg: '#e8e0cc', fg: '#141210', light: '' },
  lost: { bg: '#d8d2c4', fg: '#2a2620', light: '' },
};

export function stationDressing(): { items: Dressing[]; lights: Light[]; solids: Solid[] } {
  const rng = new Rng(0xd2e55);
  const items: Dressing[] = [];
  const lights: Light[] = [];
  const solids: Solid[] = [];

  // Lightbox adverts along the concourse's north wall, between the doors.
  const ads: Array<[number, 'halvard' | 'lattice' | 'kettle' | 'calder']> = [[12.5, 'lattice'], [40, 'halvard'], [70, 'calder'], [80, 'lattice'], [92, 'kettle']];
  for (const [x, art] of ads) {
    items.push({ k: 'poster', x, y: 25, w: 3.6, art, lit: true });
    lights.push({ x, y: 26.6, r: 4.2, strength: 0.32, tone: 'ad', color: POSTER_COLOURS[art].light });
  }
  // Paper posters and wheatpastes on the street side of the station.
  for (const [x, art] of [[8, 'gig'], [10, 'gig'], [32, 'lost'], [68, 'gig'], [74, 'lost'], [108, 'gig']] as const) {
    items.push({ k: 'poster', x, y: 23.6, w: 1.4, art, lit: false });
  }
  // Graffiti. Wren's crowd answer the cameras with eyes of their own.
  items.push({ k: 'tag', x: 31.2, y: 4.2, s: 1.6, rot: -0.1, art: 'eye' });
  items.push({ k: 'tag', x: 32.8, y: 7.4, s: 1.2, rot: 0.2, art: 'wesee' });
  items.push({ k: 'tag', x: 66, y: 23.5, s: 1.0, rot: 0, art: 'wesee' });
  items.push({ k: 'tag', x: 7, y: 79.2, s: 1.6, rot: 0.05, art: 'eye' });
  items.push({ k: 'tag', x: 96, y: 79.4, s: 1.3, rot: -0.04, art: 'wren' });
  items.push({ k: 'tag', x: 112, y: 75, s: 1.1, rot: 0.3, art: 'arrow' });
  items.push({ k: 'tag', x: 104.4, y: 47.5, s: 0.8, rot: 1.57, art: 'wren' });

  // Tactile paving at both platform edges.
  items.push({ k: 'tactile', x: 9, y: 62.7, w: 106, h: 0.55 });
  items.push({ k: 'tactile', x: 9, y: 68.5, w: 91, h: 0.55 });
  items.push({ k: 'tactile', x: 9, y: 75.9, w: 91, h: 0.55 });

  // Hanging signs and the clock.
  items.push({ k: 'sign', x: 30, y: 52, text: 'PLATFORM 1  NIGHT MAIL', w: 8 });
  items.push({ k: 'sign', x: 72, y: 52, text: 'PLATFORM 1  PLATFORM 2', w: 8 });
  items.push({ k: 'sign', x: 24, y: 23, text: 'CALDER CENTRAL', w: 9 });
  items.push({ k: 'sign', x: 60, y: 23, text: 'CALDER CENTRAL', w: 9 });
  items.push({ k: 'sign', x: 104, y: 41.4, text: 'STAFF ONLY', w: 3.2 });
  items.push({ k: 'clock', x: 50, y: 36.5 });

  // The street.
  items.push({ k: 'crossing', x: 21, y: 10, w: 6, h: 7 });
  items.push({ k: 'crossing', x: 57, y: 10, w: 6, h: 7 });
  for (const x of [6, 44, 88, 112]) items.push({ k: 'manhole', x, y: 13.5 });
  items.push({ k: 'grate', x: 38, y: 16.2, steam: true });
  items.push({ k: 'grate', x: 96, y: 16.4, steam: false });
  items.push({ k: 'bikes', x: 48, y: 22.8, n: 4 });
  for (let i = 0; i < 9; i++) items.push({ k: 'puddle', x: rng.range(2, 118), y: rng.range(9.6, 16.4), r: rng.range(0.6, 1.6), seed: rng.int(1, 9999) });
  items.push({ k: 'puddle', x: 32, y: 3, r: 1.1, seed: 77 });
  items.push({ k: 'puddle', x: 74, y: 58.4, r: 1.3, seed: 55 }); // under the dead lamp: a leak in the canopy

  // Oil and grime where people wait and trains stand.
  for (let i = 0; i < 26; i++) items.push({ k: 'stain', x: rng.range(10, 112), y: rng.range(55, 63), r: rng.range(0.25, 0.8), rot: rng.range(0, 3.14) });
  for (let i = 0; i < 14; i++) items.push({ k: 'stain', x: rng.range(10, 98), y: rng.range(69, 76), r: rng.range(0.25, 0.7), rot: rng.range(0, 3.14) });
  for (let i = 0; i < 12; i++) items.push({ k: 'stain', x: rng.range(2, 118), y: rng.range(9.5, 16.5), r: rng.range(0.5, 1.4), rot: rng.range(0, 3.14) });

  // Shopfronts across Kettle Street: windows on their south faces.
  for (const [x0, x1] of [[1, 29], [35, 69], [75, 119]] as const) {
    for (let x = x0 + 1; x < x1 - 1.5; x += 3) {
      const lit = rng.chance(0.35);
      items.push({ k: 'window', x, y: 9, w: 1.8, lit, warm: rng.chance(0.7) });
      if (lit) lights.push({ x: x + 0.9, y: 10.2, r: 2.6, strength: 0.18, tone: 'window', color: 'rgba(240,180,110,1)' });
    }
  }
  // Roofs.
  items.push({ k: 'roofbox', x: 4, y: 2, w: 3, h: 2, kind: 'ac' });
  items.push({ k: 'roofbox', x: 18, y: 3, w: 2.4, h: 2.4, kind: 'tank' });
  items.push({ k: 'roofbox', x: 40, y: 1.5, w: 6, h: 2.2, kind: 'skylight' });
  items.push({ k: 'roofbox', x: 54, y: 4, w: 2, h: 1.6, kind: 'vent' });
  items.push({ k: 'roofbox', x: 62, y: 2, w: 3, h: 2.2, kind: 'ac' });
  items.push({ k: 'roofbox', x: 82, y: 2.4, w: 8, h: 2.4, kind: 'skylight' });
  items.push({ k: 'roofbox', x: 100, y: 2, w: 2.4, h: 2.4, kind: 'tank' });
  items.push({ k: 'roofbox', x: 110, y: 4.5, w: 2, h: 1.5, kind: 'vent' });

  // Litter: cups by the kiosk, paper on the platforms, butts by the doors.
  const scatter = (n: number, x0: number, y0: number, x1: number, y1: number, kinds: Array<'cup' | 'paper' | 'butts' | 'can'>) => {
    for (let i = 0; i < n; i++) items.push({ k: 'litter', x: rng.range(x0, x1), y: rng.range(y0, y1), rot: rng.range(0, 6.28), kind: rng.pick(kinds) });
  };
  scatter(6, 28, 29, 40, 33, ['cup', 'cup', 'paper']);
  scatter(10, 10, 55, 110, 62, ['paper', 'cup', 'butts', 'can']);
  scatter(6, 10, 69, 98, 75, ['paper', 'butts', 'can']);
  scatter(8, 18, 17.5, 66, 23.5, ['butts', 'cup', 'paper']);
  scatter(4, 30.4, 0.5, 33.6, 8.5, ['can', 'paper']);
  scatter(6, 8, 30, 96, 46, ['paper', 'cup']);

  // Lamp posts under every platform and street lamp.
  for (let x = 14; x <= 110; x += 12) if (x !== 74) items.push({ k: 'lamp', x, y: 58.5, tall: false });
  items.push({ k: 'lamp', x: 74, y: 58.5, tall: false });
  for (let x = 20; x <= 90; x += 14) items.push({ k: 'lamp', x, y: 72, tall: false });
  for (let x = 7; x < 120; x += 14) items.push({ k: 'lamp', x, y: 17.4, tall: true });
  for (const x of [32, 82]) items.push({ k: 'timetable', x, y: 56.2 });
  items.push({ k: 'timetable', x: 60, y: 70.2 });

  // Glass waiting shelters: they stop a body, not a look.
  solids.push({ kind: 'shelter', x: 50, y: 55.2, w: 5, h: 1.6, z: 2.4, opaque: false });
  solids.push({ kind: 'shelter', x: 36, y: 69.4, w: 5, h: 1.6, z: 2.4, opaque: false });
  solids.push({ kind: 'shelter', x: 74, y: 69.4, w: 5, h: 1.6, z: 2.4, opaque: false });
  // A photo booth and the information desk.
  solids.push({ kind: 'machine', x: 95.4, y: 25, w: 1.6, h: 1.6, z: 2.1, opaque: true, label: 'PHOTOS', tint: '#6a5a2a' });
  lights.push({ x: 96.2, y: 27.2, r: 2.6, strength: 0.25, tone: 'screen', color: 'rgba(240,220,160,1)' });
  solids.push({ kind: 'counter', x: 70, y: 41.4, w: 3.4, h: 1.2, z: 1.1, opaque: false, label: 'INFORMATION', tint: '#3a3f46' });

  // Vending machines and a luggage trolley (these are solid).
  solids.push({ kind: 'machine', x: 14.2, y: 25, w: 1.4, h: 1.1, z: 1.9, opaque: true, label: 'SNACKS', tint: '#2c3a4a' });
  solids.push({ kind: 'machine', x: 16, y: 25, w: 1.4, h: 1.1, z: 1.9, opaque: true, label: 'DRINKS', tint: '#4a2c2c' });
  lights.push({ x: 15.6, y: 26.8, r: 3.2, strength: 0.3, tone: 'screen', color: 'rgba(190,215,240,1)' });
  solids.push({ kind: 'counter', x: 88, y: 50.6, w: 2.2, h: 1.1, z: 1.0, opaque: false, label: 'trolley', tint: '#5a5550' });
  solids.push({ kind: 'bin', x: 30, y: 46.6, w: 0.7, h: 0.7, z: 1.0, opaque: false });
  solids.push({ kind: 'bin', x: 70, y: 46.6, w: 0.7, h: 0.7, z: 1.0, opaque: false });
  solids.push({ kind: 'bin', x: 40, y: 61.2, w: 0.7, h: 0.7, z: 1.0, opaque: false });
  return { items, lights, solids };
}
