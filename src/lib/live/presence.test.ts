import { describe, expect, it } from 'vitest';
import { editorModeOf, initialOf, peopleCount, peopleOf, personTitle, versionPresence } from './presence';
import type { PresenceMember } from './protocol';

const member = (session: string, userId: number, versionId: number | null, mode: PresenceMember['mode'] = 'orbit'): PresenceMember => ({
  session, userId, name: `user${userId}`, color: '#000', versionId, mode,
});

describe('presence helpers', () => {
  it('collapses tabs of one person and keeps the most engaged mode', () => {
    const people = peopleOf([member('a', 1, 5), member('b', 2, 5), member('c', 1, 5, 'wallEditor'), member('d', 1, 5, 'firstPerson')]);
    expect(people.map((p) => [p.userId, p.mode, p.tabs])).toEqual([[1, 'wallEditor', 3], [2, 'orbit', 1]]);
  });

  it('splits others into this version and elsewhere, without myself', () => {
    const members = [member('me', 1, 5), member('a', 2, 5), member('b', 3, 6), member('c', 2, 7), member('d', 4, null)];
    const { here, elsewhere } = versionPresence(members, 1, 5);
    expect(here.map((p) => p.userId)).toEqual([2]);
    // Person 2 is here (in another tab elsewhere) → counted once, here.
    expect(elsewhere.map((p) => p.userId)).toEqual([3, 4]);
  });

  it('shows everybody when the own user is unknown', () => {
    expect(versionPresence([member('a', 1, 5)], null, 5).here).toHaveLength(1);
  });

  it('labels', () => {
    expect(initialOf('  émile')).toBe('É');
    expect(initialOf('42x')).toBe('4');
    expect(initialOf('…')).toBe('?');
    expect(peopleCount(1)).toBe('1 Person');
    expect(peopleCount(3)).toBe('3 Personen');
    expect(personTitle({ userId: 1, name: 'anna', color: '', mode: 'firstPerson', tabs: 2 })).toBe('anna – in der Ego-Perspektive (2 Tabs)');
  });

  it('derives the editor mode', () => {
    expect(editorModeOf('perspective', false)).toBe('orbit');
    expect(editorModeOf('orthographic', false)).toBe('orbit');
    expect(editorModeOf('firstPerson', false)).toBe('firstPerson');
    expect(editorModeOf('firstPerson', true)).toBe('wallEditor');
  });
});
