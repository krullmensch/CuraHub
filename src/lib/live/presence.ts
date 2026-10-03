import type { EditorMode, PresenceMember } from './protocol';

/** Pure helpers for showing who is where (header, version graph). */

export interface PresencePerson {
  userId: number;
  name: string;
  color: string;
  mode: EditorMode;
  /** Number of tabs this person has open at the place in question. */
  tabs: number;
}

/**
 * One entry per person (several tabs collapse into one), in the order they arrived. The mode
 * is the "most engaged" one across their tabs: wall editor > first person > orbit.
 */
export function peopleOf(members: PresenceMember[]): PresencePerson[] {
  const byUser = new Map<number, PresencePerson>();
  for (const m of members) {
    const known = byUser.get(m.userId);
    if (known) {
      known.tabs++;
      if (MODE_RANK[m.mode] > MODE_RANK[known.mode]) known.mode = m.mode;
    } else {
      byUser.set(m.userId, { userId: m.userId, name: m.name, color: m.color, mode: m.mode, tabs: 1 });
    }
  }
  return [...byUser.values()];
}

const MODE_RANK: Record<EditorMode, number> = { orbit: 0, firstPerson: 1, wallEditor: 2 };

/** Everybody except the signed-in person themselves. */
export function othersOf(members: PresenceMember[], selfUserId: number | null): PresenceMember[] {
  return selfUserId === null ? members : members.filter((m) => m.userId !== selfUserId);
}

/** Other people in this version, and how many other people are elsewhere in the exhibition. */
export function versionPresence(members: PresenceMember[], selfUserId: number | null, versionId: number | null) {
  const others = othersOf(members, selfUserId);
  const here = peopleOf(others.filter((m) => m.versionId === versionId));
  const hereIds = new Set(here.map((p) => p.userId));
  const elsewhere = peopleOf(others.filter((m) => m.versionId !== versionId && !hereIds.has(m.userId)));
  return { here, elsewhere };
}

export const MODE_LABEL: Record<EditorMode, string> = {
  orbit: 'im Editor',
  firstPerson: 'in der Ego-Perspektive',
  wallEditor: 'im Wandeditor',
};

export function personTitle(person: PresencePerson): string {
  const tabs = person.tabs > 1 ? ` (${person.tabs} Tabs)` : '';
  return `${person.name} – ${MODE_LABEL[person.mode]}${tabs}`;
}

/** "1 Person" / "3 Personen". */
export function peopleCount(n: number): string {
  return `${n} ${n === 1 ? 'Person' : 'Personen'}`;
}

/** Location the editor reports, from its view state. */
export function editorModeOf(plannerViewMode: string, wallEditorOpen: boolean): EditorMode {
  if (wallEditorOpen) return 'wallEditor';
  return plannerViewMode === 'firstPerson' ? 'firstPerson' : 'orbit';
}

/** Mixes two `#rrggbb` colours; t = 0 → a, 1 → b. */
export function mixHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return a;
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function parseHex(hex: string): number[] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

/**
 * Palette for a person's boring-avatars face: only tints and shades of their own colour, so
 * the avatar always reads as "their colour" (like their outline in 3D) and never turns dark on
 * the dark header.
 */
export function avatarPalette(color: string): string[] {
  return [color, mixHex(color, '#ffffff', 0.3), mixHex(color, '#ffffff', 0.6), mixHex(color, '#000000', 0.2), mixHex(color, '#000000', 0.4)];
}
