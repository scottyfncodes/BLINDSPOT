/**
 * The static city: geometry, zones, doors, light, sightlines and the nav grid.
 * Everything here is fixed for a night, except solids that exist only
 * between two times (a train in the station).
 */
import { clamp, segmentIntersectT, type Vec2 } from '../core/math';
import { SpatialHash, unique } from '../core/spatial';
import type { Access, Box, CameraDef, Door, JunctionDef, Light, Poi, Solid, Zone } from './types';

export interface WorldDef {
  width: number;
  height: number;
  solids: Solid[];
  zones: Zone[];
  doors: Door[];
  lights: Light[];
  cameras: CameraDef[];
  junctions: JunctionDef[];
  pois: Poi[];
  /** Ambient light everywhere, 0..1, before lamps. */
  ambient: number;
}

export const NAV_CELL = 0.5;
/** Clearance kept from walls by anyone walking. */
export const BODY_R = 0.3;

const activeAt = (s: Solid, t: number): boolean =>
  (s.from === undefined || t >= s.from) && (s.until === undefined || t < s.until);

export class World {
  readonly def: WorldDef;
  readonly cols: number;
  readonly rows: number;
  /** 0 free, 1 blocked always, 2 blocked by a timed solid, 3+ door index + 3. */
  readonly grid: Uint8Array;
  private solidHash = new SpatialHash<Solid>(4);
  private poiById = new Map<string, Poi>();
  private scratch: Solid[] = [];

  constructor(def: WorldDef) {
    this.def = def;
    for (const s of def.solids) this.solidHash.insertRect(s, s);
    for (const p of def.pois) this.poiById.set(p.id, p);
    this.cols = Math.ceil(def.width / NAV_CELL);
    this.rows = Math.ceil(def.height / NAV_CELL);
    this.grid = new Uint8Array(this.cols * this.rows);
    this.buildGrid();
  }

  private buildGrid(): void {
    const { cols, rows, grid } = this;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = { x: (c + 0.5) * NAV_CELL, y: (r + 0.5) * NAV_CELL };
        let v = 0;
        if (p.x < BODY_R || p.y < BODY_R || p.x > this.def.width - BODY_R || p.y > this.def.height - BODY_R) v = 1;
        if (!v) {
          for (const s of this.solidsNear(p, 1)) {
            if (inflatedContains(s, p, BODY_R)) { v = s.from !== undefined || s.until !== undefined ? 2 : 1; if (v === 1) break; }
          }
        }
        if (!v) {
          const di = this.def.doors.findIndex((d) => inflatedContains(d, p, 0.05));
          if (di >= 0) v = 3 + di;
        }
        grid[r * cols + c] = v;
      }
    }
  }

  poi(id: string): Poi {
    const p = this.poiById.get(id);
    if (!p) throw new Error(`no poi ${id}`);
    return p;
  }

  poisOf(kind: Poi['kind']): Poi[] { return this.def.pois.filter((p) => p.kind === kind); }

  solidsNear(p: Vec2, r: number): Solid[] {
    return unique(this.solidHash.queryRadius(p, r, this.scratch).slice());
  }

  solidsActive(t: number): Solid[] { return this.def.solids.filter((s) => activeAt(s, t)); }

  zoneAt(p: Vec2): Zone | null {
    // Later zones are more specific and win.
    for (let i = this.def.zones.length - 1; i >= 0; i--) {
      const z = this.def.zones[i];
      if (p.x >= z.x && p.x < z.x + z.w && p.y >= z.y && p.y < z.y + z.h) return z;
    }
    return null;
  }

  doorAt(p: Vec2, pad = 0.6): Door | null {
    for (const d of this.def.doors) if (inflatedContains(d, p, pad)) return d;
    return null;
  }

  /**
   * Push a circle out of everything solid at time `t`. Doors are solid unless
   * `access` holds their key. Resolved one axis at a time, so a body slides
   * along a wall instead of sticking to it.
   */
  collide(pos: Vec2, r: number, t: number, access: ReadonlySet<Access>): void {
    pos.x = clamp(pos.x, r, this.def.width - r);
    pos.y = clamp(pos.y, r, this.def.height - r);
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const s of this.solidsNear(pos, r + 1)) {
        if (!activeAt(s, t)) continue;
        moved = pushOut(pos, r, s) || moved;
      }
      for (const d of this.def.doors) {
        if (access.has(d.access)) continue;
        moved = pushOut(pos, r, d) || moved;
      }
      if (!moved) break;
    }
  }

  /** Is the straight line between a and b clear of anything opaque? */
  lineOfSight(a: Vec2, b: Vec2, t: number): boolean {
    const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
    const cand = unique(this.solidHash.queryRect({ x: minX, y: minY, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }, this.scratch).slice());
    for (const s of cand) {
      if (!s.opaque || !activeAt(s, t)) continue;
      if (segmentHitsBox(a, b, s)) return false;
    }
    return true;
  }

  /** Distance along a ray before something opaque stops it (for drawing sightlines). */
  rayDistance(o: Vec2, angle: number, maxR: number, t: number): number {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const end = { x: o.x + dx * maxR, y: o.y + dy * maxR };
    const cand = unique(this.solidHash.queryRect({ x: Math.min(o.x, end.x), y: Math.min(o.y, end.y), w: Math.abs(end.x - o.x), h: Math.abs(end.y - o.y) }, this.scratch).slice());
    let best = maxR;
    for (const s of cand) {
      if (!s.opaque || !activeAt(s, t)) continue;
      // Slab test.
      let t0 = 0, t1 = best;
      for (const [p, d, lo, hi] of [[o.x, dx, s.x, s.x + s.w], [o.y, dy, s.y, s.y + s.h]] as const) {
        if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { t0 = Infinity; break; } continue; }
        let a = (lo - p) / d, b = (hi - p) / d;
        if (a > b) { const tmp = a; a = b; b = tmp; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) break;
      }
      if (t0 <= t1 && t0 < best) best = Math.max(0, t0);
    }
    return best;
  }

  /** How lit a point is, 0..1. Darkness is cover. */
  lightAt(p: Vec2): number {
    let l = this.def.ambient;
    for (const L of this.def.lights) {
      const dx = p.x - L.x, dy = p.y - L.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > L.r * L.r) continue;
      const f = 1 - Math.sqrt(d2) / L.r;
      l += L.strength * f * f * (3 - 2 * f);
    }
    return clamp(l, 0, 1);
  }

  cellOf(p: Vec2): number {
    const c = clamp(Math.floor(p.x / NAV_CELL), 0, this.cols - 1);
    const r = clamp(Math.floor(p.y / NAV_CELL), 0, this.rows - 1);
    return r * this.cols + c;
  }

  cellCenter(i: number): Vec2 {
    return { x: ((i % this.cols) + 0.5) * NAV_CELL, y: (Math.floor(i / this.cols) + 0.5) * NAV_CELL };
  }

  /** Can a body with these keys stand in cell i at time t? */
  passable(i: number, t: number, access: ReadonlySet<Access>): boolean {
    const v = this.grid[i];
    if (v === 0) return true;
    if (v === 1) return false;
    if (v === 2) {
      const p = this.cellCenter(i);
      for (const s of this.solidsNear(p, 1)) if (activeAt(s, t) && inflatedContains(s, p, BODY_R)) return false;
      return true;
    }
    return access.has(this.def.doors[v - 3].access);
  }
}

export function inflatedContains(b: Box, p: Vec2, pad: number): boolean {
  return p.x > b.x - pad && p.x < b.x + b.w + pad && p.y > b.y - pad && p.y < b.y + b.h + pad;
}

function pushOut(pos: Vec2, r: number, b: Box): boolean {
  const cx = clamp(pos.x, b.x, b.x + b.w), cy = clamp(pos.y, b.y, b.y + b.h);
  const dx = pos.x - cx, dy = pos.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    pos.x = cx + (dx / d) * r;
    pos.y = cy + (dy / d) * r;
    return true;
  }
  // Centre inside the box: leave by the nearest face.
  const left = pos.x - b.x, right = b.x + b.w - pos.x, top = pos.y - b.y, bottom = b.y + b.h - pos.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pos.x = b.x - r;
  else if (m === right) pos.x = b.x + b.w + r;
  else if (m === top) pos.y = b.y - r;
  else pos.y = b.y + b.h + r;
  return true;
}

export function segmentHitsBox(a: Vec2, b: Vec2, s: Box): boolean {
  const inside = (p: Vec2) => p.x > s.x && p.x < s.x + s.w && p.y > s.y && p.y < s.y + s.h;
  if (inside(a) || inside(b)) return true;
  const c = [
    { x: s.x, y: s.y }, { x: s.x + s.w, y: s.y }, { x: s.x + s.w, y: s.y + s.h }, { x: s.x, y: s.y + s.h },
  ];
  for (let i = 0; i < 4; i++) if (segmentIntersectT(a, b, c[i], c[(i + 1) % 4]) !== null) return true;
  return false;
}
