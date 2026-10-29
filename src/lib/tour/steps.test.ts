import { describe, expect, it } from 'vitest';
import { TOUR_STEPS, stepsForRole, parseTourBody } from './steps';

const ids = (role: Parameters<typeof stepsForRole>[0]) => stepsForRole(role).map((s) => s.id);

describe('stepsForRole', () => {
  it('gives curators the thirteen base steps in order', () => {
    expect(ids('curator')).toEqual(['welcome', 'projects', 'assets', 'place', 'transform', 'axes', 'view', 'tools', 'display', 'properties', 'versions', 'publish', 'wiki']);
  });
  it('adds project settings for profs', () => {
    expect(ids('prof')).toEqual(['welcome', 'projects', 'assets', 'place', 'transform', 'axes', 'view', 'tools', 'display', 'properties', 'versions', 'publish', 'settings', 'wiki']);
  });
  it('adds settings and user management for admins', () => {
    expect(ids('admin')).toHaveLength(15);
    expect(ids('admin').slice(12)).toEqual(['settings', 'users', 'wiki']);
  });
  it('spotlights each tool bar group on its own', () => {
    const targets = TOUR_STEPS.map((s) => s.target);
    expect(targets).toEqual(expect.arrayContaining(['toolbar-transform', 'toolbar-axes', 'toolbar-view', 'toolbar-tools', 'toolbar-display']));
    expect(targets).not.toContain('editor-toolbar');
  });
  it('has a target for every step but the welcome step', () => {
    expect(TOUR_STEPS.filter((s) => !s.target).map((s) => s.id)).toEqual(['welcome']);
  });
});

describe('parseTourBody', () => {
  it('splits kbd and emphasis', () => {
    expect(parseTourBody('Unter *Assets* drück <kbd>G</kbd>.')).toEqual([
      { kind: 'text', text: 'Unter ' }, { kind: 'em', text: 'Assets' },
      { kind: 'text', text: ' drück ' }, { kind: 'kbd', text: 'G' }, { kind: 'text', text: '.' },
    ]);
  });
  it('parses keys inside an emphasis', () => {
    expect(parseTourBody('*Taste <kbd>G</kbd> drücken*')).toEqual([
      { kind: 'em', text: 'Taste ' }, { kind: 'kbd', text: 'G' }, { kind: 'em', text: ' drücken' },
    ]);
  });
  it('keeps unclosed markers as plain text', () => {
    expect(parseTourBody('a *b <kbd>c')).toEqual([{ kind: 'text', text: 'a *b <kbd>c' }]);
  });
  it('parses every step body without losing characters', () => {
    for (const s of TOUR_STEPS) {
      const plain = s.body.replace(/<\/?kbd>/g, '').replace(/\*/g, '');
      expect(parseTourBody(s.body).map((p) => p.text).join('')).toBe(plain);
    }
  });
});
