import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';
import { useEditorStore } from '@/store/editorStore';
import { useTourStore } from '@/store/tourStore';
import { shouldAutoStartTour } from '@/lib/tour/autoStart';

interface TourAutoStartProps {
  /** Dialogs EditorLayout keeps in local state (wiki, project settings). */
  layoutDialogOpen: boolean;
}

/** Starts the onboarding tour on a curator's first dashboard visit (see lib/tour/autoStart). */
export function TourAutoStart({ layoutDialogOpen }: TourAutoStartProps): null {
  const { pathname } = useLocation();
  const meLoaded = useAuthStore((s) => s.meLoaded);
  const isCurator = useAuthStore((s) => s.isCurator);
  const onboardingCompletedAt = useAuthStore((s) => s.user?.onboardingCompletedAt);
  const role = useAuthStore((s) => s.user?.role);
  const plannerViewMode = useEditorStore((s) => s.plannerViewMode);
  const wallEditorOpen = useEditorStore((s) => s.wallEditor !== null);
  const dialogOpen = useEditorStore((s) => s.isDialogOpen) || layoutDialogOpen;
  const tourActive = useTourStore((s) => s.active);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !role) return;
    if (!shouldAutoStartTour({ meLoaded, isCurator, onboardingCompletedAt, pathname, plannerViewMode, wallEditorOpen, dialogOpen, tourActive })) return;
    started.current = true;
    useTourStore.getState().start(role);
  }, [meLoaded, isCurator, onboardingCompletedAt, role, pathname, plannerViewMode, wallEditorOpen, dialogOpen, tourActive]);

  return null;
}
