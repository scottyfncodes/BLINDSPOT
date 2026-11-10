/**
 * Saves: one versioned record in localStorage, merged over a fresh template
 * on load so a save from an older build always comes back whole (the pattern
 * from GenAlpha and Big Score). Every storage access is guarded: a private
 * window or blocked storage plays the same, it just does not remember.
 */
import type { Carry } from '../sim/sim';

export const SAVE_KEY = 'blindspot.save';
export const SAVE_VERSION = 1;

export interface ReportFact { id: string; title: string; status: string; text: string }

export interface NightReport {
  night: number;
  reason: 'departed' | 'caught' | 'left';
  endedAt: string;
  clone: 'none' | 'live' | 'revoked';
  reader: boolean;
  facts: ReportFact[];
  learned: number;
  total: number;
  takes: number;
  cash: number;
  nightHeat: number;
  heat: number;
  witnesses: number;
  description: string | null;
  consequences: string[];
}

export interface SaveData {
  v: number;
  settings: { sound: boolean; reducedMotion: boolean };
  nights: number;
  carry: Carry;
  last: NightReport | null;
  seenHelp: boolean;
}

export function freshSave(): SaveData {
  return {
    v: SAVE_VERSION,
    settings: { sound: true, reducedMotion: false },
    nights: 0,
    carry: { cash: 6, heat: 0, boxCutsA: 0, boxCutsB: 0 },
    last: null,
    seenHelp: false,
  };
}

function merge<T>(base: T, over: unknown): T {
  if (typeof base !== 'object' || base === null || Array.isArray(base)) return (over ?? base) as T;
  if (typeof over !== 'object' || over === null) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(base as object)) {
    const bv = (base as Record<string, unknown>)[k];
    const ov = (over as Record<string, unknown>)[k];
    if (ov === undefined) continue;
    out[k] = bv !== null && typeof bv === 'object' && !Array.isArray(bv) ? merge(bv, ov) : typeof ov === typeof bv || bv === null ? ov : bv;
  }
  return out as T;
}

export function migrate(raw: unknown): SaveData {
  return merge(freshSave(), raw);
}

export function load(): SaveData {
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return freshSave();
    return migrate(JSON.parse(s));
  } catch {
    return freshSave();
  }
}

export function store(d: SaveData): void {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* storage unavailable: play on */ }
}
