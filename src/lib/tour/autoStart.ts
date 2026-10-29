export interface AutoStartInput {
  meLoaded: boolean;
  isCurator: boolean;
  /** undefined = persisted user from before the field existed: wait for /auth/me. */
  onboardingCompletedAt: string | null | undefined;
  pathname: string;
  plannerViewMode: string;
  wallEditorOpen: boolean;
  dialogOpen: boolean;
  tourActive: boolean;
}

/** The tour only runs in the orbit views: first person and the 2D wall editor have keys it doesn't guard. */
export function tourModeAllowed(s: { plannerViewMode: string; wallEditorOpen: boolean }): boolean {
  return s.plannerViewMode !== 'firstPerson' && !s.wallEditorOpen;
}

/** Whether the dashboard tour should start on its own right now. */
export function shouldAutoStartTour(s: AutoStartInput): boolean {
  return (
    s.meLoaded &&
    s.isCurator &&
    s.onboardingCompletedAt === null &&
    !s.pathname.includes('/assets') &&
    tourModeAllowed(s) &&
    !s.dialogOpen &&
    !s.tourActive
  );
}
