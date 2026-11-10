/**
 * Pathfinding on the world's nav grid: 8-way A* with a binary heap, no corner
 * cutting, then string-pulled so walkers take straight lines across open
 * floor instead of staircase steps. Replaces LIFT's linear-scan A*.
 */
import type { Vec2 } from '../core/math';
import type { Access } from './types';
import type { World } from './world';

const SQRT2 = Math.SQRT2;
const MAX_EXPAND = 40000;

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size(): number { return this.ids.length; }
  push(id: number, key: number): void {
    const ids = this.ids, keys = this.keys;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p];
      i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop(): number {
    const ids = this.ids, keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!, lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i, mk = lastKey;
        if (l < n && keys[l] < mk) { m = l; mk = keys[l]; }
        if (r < n && keys[r] < mk) { m = r; mk = keys[r]; }
        if (m === i) break;
        ids[i] = ids[m]; keys[i] = keys[m];
        i = m;
      }
      ids[i] = lastId; keys[i] = lastKey;
    }
    return top;
  }
}

export class Nav {
  private g: Float32Array;
  private from: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private run = 0;

  constructor(private world: World) {
    const n = world.cols * world.rows;
    this.g = new Float32Array(n);
    this.from = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
  }

  /** Nearest passable cell to p, searching outward a little. */
  nearestFree(p: Vec2, t: number, access: ReadonlySet<Access>): number {
    const w = this.world;
    const start = w.cellOf(p);
    if (w.passable(start, t, access)) return start;
    const c0 = start % w.cols, r0 = Math.floor(start / w.cols);
    for (let rad = 1; rad < 8; rad++) {
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
          const c = c0 + dc, r = r0 + dr;
          if (c < 0 || r < 0 || c >= w.cols || r >= w.rows) continue;
          const i = r * w.cols + c;
          if (w.passable(i, t, access)) return i;
        }
      }
    }
    return -1;
  }

  /** A walkable route from a to b, or null. The first point is not `a`. */
  path(a: Vec2, b: Vec2, t: number, access: ReadonlySet<Access>): Vec2[] | null {
    const w = this.world;
    const s = this.nearestFree(a, t, access), e = this.nearestFree(b, t, access);
    if (s < 0 || e < 0) return null;
    if (s === e) return [{ x: b.x, y: b.y }];
    const run = ++this.run;
    const { g, from, stamp, closed } = this;
    const cols = w.cols, rows = w.rows;
    const ec = e % cols, er = Math.floor(e / cols);
    const h = (i: number) => {
      const dc = Math.abs((i % cols) - ec), dr = Math.abs(Math.floor(i / cols) - er);
      return (dc + dr) + (SQRT2 - 2) * Math.min(dc, dr);
    };
    const open = new Heap();
    g[s] = 0; from[s] = -1; stamp[s] = run;
    open.push(s, h(s));
    let expanded = 0, found = false;
    while (open.size > 0) {
      const cur = open.pop();
      if (closed[cur] === run) continue;
      closed[cur] = run;
      if (cur === e) { found = true; break; }
      if (++expanded > MAX_EXPAND) break;
      const cc = cur % cols, cr = Math.floor(cur / cols);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc, nr = cr + dr;
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
          const ni = nr * cols + nc;
          if (closed[ni] === run || !w.passable(ni, t, access)) continue;
          if (dr && dc && (!w.passable(cr * cols + nc, t, access) || !w.passable(nr * cols + cc, t, access))) continue;
          const cost = g[cur] + (dr && dc ? SQRT2 : 1);
          if (stamp[ni] === run && cost >= g[ni]) continue;
          stamp[ni] = run; g[ni] = cost; from[ni] = cur;
          open.push(ni, cost + h(ni));
        }
      }
    }
    if (!found) return null;
    const cells: number[] = [];
    for (let i = e; i !== -1; i = from[i]) cells.push(i);
    cells.reverse();
    return this.pull(cells, b, t, access);
  }

  /** Keep only the corners: drop each cell the walker can see past. */
  private pull(cells: number[], goal: Vec2, t: number, access: ReadonlySet<Access>): Vec2[] {
    const out: Vec2[] = [];
    let anchor = 0;
    for (let i = 2; i < cells.length; i++) {
      if (!this.walkable(cells[anchor], cells[i], t, access)) {
        out.push(this.world.cellCenter(cells[i - 1]));
        anchor = i - 1;
      }
    }
    out.push({ x: goal.x, y: goal.y });
    return out;
  }

  /** Grid ray march: is every cell on the line passable? */
  walkable(a: number, b: number, t: number, access: ReadonlySet<Access>): boolean {
    const w = this.world;
    const p = w.cellCenter(a), q = w.cellCenter(b);
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    const steps = Math.ceil(d / 0.2);
    for (let k = 1; k < steps; k++) {
      const f = k / steps;
      const x = p.x + (q.x - p.x) * f, y = p.y + (q.y - p.y) * f;
      // Check the point and a body's width either side.
      if (!w.passable(w.cellOf({ x, y }), t, access)) return false;
    }
    return true;
  }
}
