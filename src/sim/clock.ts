/**
 * The night's clock. Sim time is real seconds since the night began; the
 * clock on the wall runs RATE times faster, so a 34-minute casing night
 * plays in under six real minutes.
 */
export const RATE = 6;
export const NIGHT_START = hms('23:12');
export const NIGHT_END = hms('23:46');

export function hms(s: string): number {
  const [h, m, sec] = s.split(':').map(Number);
  return h * 3600 + m * 60 + (sec || 0);
}

/** Sim seconds at which the wall clock reads `s` ("23:16" or "23:16:30"). */
export const at = (s: string): number => (hms(s) - NIGHT_START) / RATE;

/** Wall-clock seconds of the day at sim time t. */
export const wall = (t: number): number => NIGHT_START + t * RATE;

export function clockLabel(t: number): string {
  const s = Math.floor(wall(t));
  const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** The night ends when the Night Mail leaves. */
export const NIGHT_LENGTH = at('23:46');
