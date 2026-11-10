/** Shared data shapes for the simulation. Plain data: no DOM, no rendering. */
import type { Vec2 } from '../core/math';

export interface Box { x: number; y: number; w: number; h: number }

export type SolidKind =
  | 'building' | 'wall' | 'pillar' | 'train' | 'counter' | 'bench' | 'barrier'
  | 'machine' | 'fence' | 'board' | 'locker' | 'bin' | 'planter' | 'vehicle' | 'kiosk';

export interface Solid extends Box {
  kind: SolidKind;
  /** Height in metres; drawn as an extrusion. */
  z: number;
  /** Whether it blocks line of sight (low furniture does not). */
  opaque: boolean;
  /** Present only between these sim times, e.g. a train in the station. */
  from?: number;
  until?: number;
  label?: string;
  tint?: string;
}

export type Floor = 'asphalt' | 'pavement' | 'tile' | 'platform' | 'track' | 'staff' | 'bridge' | 'alley';

export interface Zone extends Box {
  id: string;
  name: string;
  floor: Floor;
  /** Being here is trespass. */
  restricted: boolean;
  indoor: boolean;
}

export type Access = 'staff' | 'coach';

export interface Door extends Box {
  id: string;
  label: string;
  /** Who may pass. Without it the door is solid. */
  access: Access;
  /** A reader the player can tap a card against, if any. */
  reader?: Vec2;
}

export interface Light { x: number; y: number; r: number; strength: number; tone: 'sodium' | 'fluoro' | 'sign' }

export interface CameraDef {
  id: string;
  label: string;
  x: number; y: number;
  facing: number;
  /** Half amplitude of the sweep, radians. */
  sweep: number;
  /** Seconds per full sweep. */
  period: number;
  phase: number;
  range: number;
  /** Half field of view, radians. */
  half: number;
  circuit: string;
}

export interface JunctionDef { id: string; label: string; x: number; y: number; circuit: string }

export type PoiKind = 'seat' | 'stand' | 'kiosk' | 'machine' | 'board' | 'platform' | 'door' | 'exit' | 'post' | 'break';

export interface Poi { id: string; kind: PoiKind; x: number; y: number; facing: number; zone?: string }

/** The player's appearance, as a witness would put it. */
export interface Look { hood: boolean }

export type Faction = 'civilian' | 'staff' | 'halvard';
