import { describe, expect, it } from 'vitest';
import { shouldAutoStartTour } from './autoStart';

const ok = {
  meLoaded: true,
  isCurator: true,
  onboardingCompletedAt: null,
  pathname: '/project',
  plannerViewMode: 'perspective',
  wallEditorOpen: false,
  dialogOpen: false,
  tourActive: false,
} as const;

describe('shouldAutoStartTour', () => {
  it('starts for a curator who never finished the tour', () => {
    expect(shouldAutoStartTour(ok)).toBe(true);
  });
  it('starts on a project editor route', () => {
    expect(shouldAutoStartTour({ ...ok, pathname: '/exhibition/x/edit' })).toBe(true);
  });
  it.each([
    ['before /auth/me answered', { meLoaded: false }],
    ['for non-curators', { isCurator: false }],
    ['once the tour was completed', { onboardingCompletedAt: '2026-10-29T10:00:00.000Z' }],
    ['for a persisted user without the field', { onboardingCompletedAt: undefined }],
    ['on the asset library', { pathname: '/exhibition/x/assets' }],
    ['in first person', { plannerViewMode: 'firstPerson' }],
    ['in the wall editor', { wallEditorOpen: true }],
    ['while a dialog is open', { dialogOpen: true }],
    ['while a tour runs', { tourActive: true }],
  ])('does not start %s', (_name, patch) => {
    expect(shouldAutoStartTour({ ...ok, ...patch })).toBe(false);
  });
});
