import { Spinner } from '@/components/ui/loading';

interface EditorLoadingOverlayProps {
  /** What the editor waits for, or null when nothing (overlay hidden). */
  label: string | null;
}

/**
 * Centred „spinner + label" over the editor canvas while the 3D view, the version's content or
 * first person get ready. Fades in after 200 ms so fast loads never flash it; never catches
 * pointer events (the canvas stays usable, and a stuck load can't trap the curator).
 */
export function EditorLoadingOverlay({ label }: EditorLoadingOverlayProps) {
  if (!label) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-[18] flex items-center justify-center bg-zinc-950/30 animate-in fade-in fill-mode-backwards delay-200 duration-300">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/70 px-5 py-3 text-sm text-white/90 shadow-xl backdrop-blur-md"
      >
        <Spinner className="h-4 w-4 text-white/70" />
        {label}
      </div>
    </div>
  );
}
