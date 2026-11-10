/** What a person in Calder is, before the sim brings them to life. */
import type { Vec2 } from '../core/math';
import type { Access, Faction } from './types';

export type Role = 'civilian' | 'courier' | 'guard' | 'escort';

export type Activity =
  | 'walk' | 'wait' | 'phone' | 'read' | 'talk' | 'coffee' | 'sleep' | 'music' | 'board'
  | 'post' | 'patrol' | 'break' | 'repair';

/**
 * How much of their attention is out in the world, and how often they look
 * up. Constants carried from LIFT's ACTIVITY_INFO, retuned for a station.
 */
export const ACTIVITY: Record<Activity, { attn: number; stir: number; label: string }> = {
  walk: { attn: 0.55, stir: 1.0, label: 'walking' },
  wait: { attn: 0.6, stir: 1.2, label: 'waiting' },
  phone: { attn: 0.3, stir: 0.6, label: 'on their phone' },
  read: { attn: 0.35, stir: 0.7, label: 'reading' },
  talk: { attn: 0.3, stir: 0.8, label: 'talking' },
  coffee: { attn: 0.5, stir: 0.9, label: 'at the kiosk' },
  sleep: { attn: 0.08, stir: 0.25, label: 'asleep' },
  music: { attn: 0.25, stir: 0.6, label: 'headphones in' },
  board: { attn: 0.5, stir: 1.0, label: 'boarding' },
  post: { attn: 0.85, stir: 1.6, label: 'on post' },
  patrol: { attn: 0.75, stir: 1.4, label: 'on patrol' },
  break: { attn: 0.2, stir: 0.4, label: 'on break' },
  repair: { attn: 0.45, stir: 0.8, label: 'repairing' },
};

export type Pocket = 'hip' | 'breast' | 'waist' | 'bag';
export type ItemKind = 'cash' | 'phone' | 'card';

export interface Item { kind: ItemKind; value: number; label: string }

export interface Appearance {
  coat: string;
  skin: string;
  hair: string;
  hat?: 'cap' | 'beanie' | 'brim';
  bag?: 'backpack' | 'case' | 'tote' | 'suitcase';
  /** Shoulder width multiplier. */
  build: number;
}

export type Step =
  | { do: 'go'; to: Vec2 | string; brisk?: boolean }
  | { do: 'act'; act: Activity; until?: number; for?: number; facing?: number }
  | { do: 'patrol'; route: Vec2[]; until?: number }
  | { do: 'leave' };

export interface AgentSpec {
  id: string;
  name: string;
  role: Role;
  faction: Faction;
  archetype: string;
  /** 0..1, how naturally watchful they are. */
  aware: number;
  pocket: Pocket;
  item: Item | null;
  look: Appearance;
  spawnAt: number;
  spawn: Vec2 | string;
  plan: Step[];
  access: Access[];
}
