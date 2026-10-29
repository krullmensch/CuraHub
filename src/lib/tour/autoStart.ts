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

/** Whether the dashboard tour should start on its own right now. */
export function shouldAutoStartTour(s: AutoStartInput): boolean {
  return (
    s.meLoaded &&
    s.isCurator &&
    s.onboardingCompletedAt === null &&
    !s.pathname.includes('/assets') &&
    s.plannerViewMode !== 'firstPerson' &&
    !s.wallEditorOpen &&
    !s.dialogOpen &&
    !s.tourActive
  );
}
