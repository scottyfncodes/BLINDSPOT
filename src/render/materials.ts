/**
 * Surface textures (made by tools/textures.py, seamless, 512 px). Each is
 * mapped to the world at TILE_M metres per tile, so a floor pattern stays
 * locked to the ground as the camera moves and zooms.
 */
import type { Floor } from '../sim/types';

const SOURCES = {
  terrazzo: { file: 'terrazzo', m: 4.5 },
  platform: { file: 'platform', m: 6 },
  asphalt: { file: 'asphalt', m: 6 },
  pavement: { file: 'pavement', m: 3.6 },
  ballast: { file: 'ballast', m: 3 },
  lino: { file: 'lino', m: 4 },
  roof: { file: 'roof', m: 8 },
  cobble: { file: 'cobble', m: 3 },
} as const;

export type MaterialId = keyof typeof SOURCES;

export const FLOOR_MATERIAL: Record<Floor, MaterialId> = {
  asphalt: 'asphalt', pavement: 'pavement', tile: 'terrazzo', platform: 'platform',
  track: 'ballast', staff: 'lino', bridge: 'platform', alley: 'cobble',
};

export class Materials {
  private pats = new Map<MaterialId, CanvasPattern>();
  ready = false;

  constructor(private ctx: CanvasRenderingContext2D, base: string) {
    let left = Object.keys(SOURCES).length;
    for (const [id, src] of Object.entries(SOURCES) as Array<[MaterialId, { file: string; m: number }]>) {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        const p = this.ctx.createPattern(img, 'repeat');
        if (p) {
          // 512 px -> src.m metres in world space.
          p.setTransform(new DOMMatrix().scale(src.m / img.width, src.m / img.height));
          this.pats.set(id, p);
        }
        if (--left === 0) this.ready = true;
      };
      img.onerror = () => { if (--left === 0) this.ready = true; };
      img.src = `${base}tex/${src.file}.webp`;
    }
  }

  /** The pattern for a material, or null until it has loaded (draw flat colour then). */
  get(id: MaterialId): CanvasPattern | null { return this.pats.get(id) ?? null; }
}
