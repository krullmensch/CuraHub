import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { progressPercent } from '@/lib/loading/progress';

/**
 * Shared loading UI: a spinner, a progress bar (determinate or indeterminate), a centred
 * „spinner + label" state and a full-screen overlay. Everything announces itself to screen
 * readers (`role="status"` / `role="progressbar"`) and the animations stop under
 * `prefers-reduced-motion` (Tailwind's `motion-reduce:`).
 */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none', className)} />;
}

interface ProgressBarProps {
  /** 0…1, or null while the total is unknown (indeterminate stripe). */
  value: number | null;
  className?: string;
  /** Colour of the filled part. */
  barClassName?: string;
  label?: string;
}

export function ProgressBar({ value, className, barClassName, label }: ProgressBarProps) {
  const percent = value == null ? null : progressPercent(value);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent ?? undefined}
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-white/10', className)}
    >
      {percent == null ? (
        <div className={cn('absolute inset-y-0 left-0 w-2/5 rounded-full bg-white animate-progress-indeterminate motion-reduce:animate-none', barClassName)} />
      ) : (
        <div
          className={cn('h-full rounded-full bg-white transition-[width] duration-300 ease-out', barClassName)}
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

interface LoadingStateProps {
  label?: ReactNode;
  /** Optional progress (0…1, null = indeterminate) shown as a bar below the label. */
  progress?: number | null;
  className?: string;
  spinnerClassName?: string;
  /** One row (small spinner left of the label) instead of a centred block. */
  inline?: boolean;
}

/** Spinner with a label, centred in its parent — for panels, lists and dialogs that wait for data. */
export function LoadingState({ label = 'Wird geladen …', progress, className, spinnerClassName, inline = false }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        inline ? 'flex items-center gap-2 text-sm text-zinc-400' : 'flex flex-col items-center justify-center gap-3 py-8 text-sm text-zinc-400',
        className,
      )}
    >
      <Spinner className={cn(inline ? 'h-4 w-4 text-zinc-400' : 'h-6 w-6 text-zinc-400', spinnerClassName)} />
      {label && <span>{label}</span>}
      {progress !== undefined && <ProgressBar value={progress} className="w-40" />}
    </div>
  );
}

/** Full-screen dimmed overlay with a spinner — e.g. while a lazily loaded dialog's code arrives. */
export function LoadingOverlay({ label = 'Wird geladen …', className }: { label?: ReactNode; className?: string }) {
  return (
    <div className={cn('fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[2px]', className)}>
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-5 py-3 text-sm text-zinc-200 shadow-xl" role="status" aria-live="polite">
        <Spinner className="h-4 w-4 text-zinc-400" />
        {label}
      </div>
    </div>
  );
}

/** Page-sized loading screen (route chunks, setup check). */
export function FullPageLoader({ label = 'Wird geladen …' }: { label?: ReactNode }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-zinc-950">
      <LoadingState label={label} />
    </div>
  );
}

interface SkeletonGridProps {
  count: number;
  /** Grid classes (columns, gap) — the same as the real grid, so nothing jumps when it arrives. */
  className: string;
  /** Classes of one placeholder tile (aspect ratio, radius). */
  itemClassName?: string;
  label?: string;
}

/** Placeholder tiles in the shape of a thumbnail grid while its items load. */
export function SkeletonGrid({ count, className, itemClassName, label = 'Wird geladen' }: SkeletonGridProps) {
  return (
    <div role="status" aria-label={label} className={className}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn('aspect-square animate-pulse rounded-md bg-zinc-800/70 motion-reduce:animate-none', itemClassName)}
          style={{ animationDelay: `${(i % 6) * 80}ms` }}
        />
      ))}
    </div>
  );
}
