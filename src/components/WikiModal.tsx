import { useEffect, lazy, Suspense } from 'react';
import { Compass, X } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTourStore } from '@/store/tourStore';
import { useEditorStore } from '@/store/editorStore';
import { tourModeAllowed } from '@/lib/tour/autoStart';

const WikiView = lazy(() =>
  import('./WikiView').then((m) => ({ default: m.WikiView }))
);

interface WikiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WikiModal = ({ isOpen, onClose }: WikiModalProps) => {
  const isCurator = useAuthStore((s) => s.isCurator);
  const role = useAuthStore((s) => s.user?.role);
  const plannerViewMode = useEditorStore((s) => s.plannerViewMode);
  const wallEditorOpen = useEditorStore((s) => s.wallEditor !== null);
  const canStartTour = isCurator && tourModeAllowed({ plannerViewMode, wallEditorOpen });

  const startTour = () => {
    if (!role) return;
    onClose();
    useTourStore.getState().start(role);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Dimmed backdrop — click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative w-[90vw] h-[85vh] max-w-7xl rounded-xl overflow-hidden shadow-2xl border border-zinc-700">
        {canStartTour && (
          <button
            onClick={startTour}
            className="absolute top-3 right-16 z-10 flex items-center gap-1.5 px-3 py-2 bg-zinc-900/80 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-white rounded-lg transition-colors backdrop-blur-sm border border-zinc-700"
          >
            <Compass className="h-4 w-4" />
            Tour starten
          </button>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors backdrop-blur-sm border border-zinc-700"
          title="Close Wiki"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wiki content rendered in-app */}
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center bg-zinc-950 text-zinc-400 text-sm">
              Lädt …
            </div>
          }
        >
          <WikiView />
        </Suspense>
      </div>
    </div>
  );
};
