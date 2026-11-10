/**
 * The case file: what Wren knows, how she knows it, and how sure she can be.
 *
 * From Big Score: intel has a source and a confidence, and a bought fact can
 * be a lie that only shows itself when it matters. From UNDERWATCH: watching
 * something for long enough teaches you how it behaves, and that knowledge is
 * drawn into the world (a learned camera shows its sweep; an unlearned one
 * shows only which way it points).
 */
export type FactStatus = 'unknown' | 'observing' | 'confirmed' | 'rumoured' | 'false' | 'dead';

export type FactKind = 'person' | 'camera' | 'route' | 'circuit' | 'tip' | 'card';

export interface Fact {
  id: string;
  kind: FactKind;
  title: string;
  /** What Wren has written down. Updated when the status changes. */
  text: string;
  status: FactStatus;
  /** 0..1 progress while observing. */
  progress: number;
  /** Sim time it became known. */
  at: number;
}

export const fact = (id: string, kind: FactKind, title: string, text: string): Fact =>
  ({ id, kind, title, text, status: 'unknown', progress: 0, at: -1 });

export const known = (f: Fact | undefined): boolean => !!f && (f.status === 'confirmed' || f.status === 'rumoured');

export const STATUS_LABEL: Record<FactStatus, string> = {
  unknown: 'Unknown',
  observing: 'Watching',
  confirmed: 'Confirmed',
  rumoured: 'Rumoured',
  false: 'False',
  dead: 'Dead',
};
