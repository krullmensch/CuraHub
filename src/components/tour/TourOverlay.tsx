import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTourStore } from '@/store/tourStore';
import { isOnScreen, popoverPosition, spotlightRect, type Rect } from '@/lib/tour/placement';
import { tourKeyAction } from '@/lib/tour/keys';
import { TourBody } from './TourBody';

const POPOVER_WIDTH = 380;

function measureTarget(target: string | undefined): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
  if (rect.width === 0 || rect.height === 0) return null;
  return isOnScreen(rect, { width: window.innerWidth, height: window.innerHeight }) ? rect : null;
}

const sameRect = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/**
 * The dashboard tour: dims the screen, cuts the current step's element out of the dimming and
 * shows the step's popover next to it. Swallows clicks outside the popover while it runs.
 */
export function TourOverlay() {
  const active = useTourStore((s) => s.active);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const steps = useTourStore((s) => s.steps);
  const step = active ? steps[stepIndex] : undefined;

  // The previous step's rect stays until the new one is measured (before paint), so the
  // spotlight and the popover transition from there instead of jumping through „no target".
  const [target, setTarget] = useState<Rect | null>(null);
  const [popSize, setPopSize] = useState({ width: POPOVER_WIDTH, height: 180 });
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const popoverRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // A logout (or any unmount of the editor) must not leave the controls locked by a running tour.
  useEffect(() => () => useTourStore.getState().reset(), []);

  // Find and follow the target: measured synchronously before paint, then on every layout change.
  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const measure = () => {
      const next = measureTarget(step.target);
      setTarget((prev) => (sameRect(prev, next) ? prev : next));
      setViewport((prev) => (prev.width === window.innerWidth && prev.height === window.innerHeight
        ? prev
        : { width: window.innerWidth, height: window.innerHeight }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (el) ro.observe(el);
    // Targets can mount after their step began (e.g. „Viewer testen" once the project loaded).
    let frame = 0;
    const mo = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure(); });
    });
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      mo.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  // Popover size for the placement: measured before paint on every step, then on resize.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!active || !el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setPopSize((prev) => (prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [active, stepIndex]);

  useEffect(() => {
    if (active) primaryRef.current?.focus();
  }, [active, stepIndex]);

  // Tour keys win over the editor's and the wiki's handlers.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const action = tourKeyAction(e);
      if (!action) return;
      const onButton = e.target instanceof HTMLButtonElement && popoverRef.current?.contains(e.target);
      if (e.key === 'Enter' && onButton) return; // the focused button's own click
      useTourStore.getState()[action]();
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [active]);

  if (!step) return null;

  const { next, back, skip } = useTourStore.getState();
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  // Always mounted, so it can transition; without a target it shrinks to the screen centre.
  const hole = target
    ? spotlightRect(target)
    : { x: viewport.width / 2, y: viewport.height / 2, width: 0, height: 0 };
  const placement = popoverPosition(target, popSize, viewport, step.placement ?? 'bottom');

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !popoverRef.current) return;
    const buttons = Array.from(popoverRef.current.querySelectorAll('button'));
    if (buttons.length === 0) return;
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  // Anchored and centred differ only in the transform, so moving between them animates.
  const popoverStyle: React.CSSProperties =
    placement.mode === 'sheet'
      ? {}
      : { left: 0, top: 0, width: POPOVER_WIDTH, transform: `translate(${placement.x}px, ${placement.y}px)` };

  return createPortal(
    <div className="fixed inset-0 z-[10000]">
      <svg
        className="absolute inset-0 h-full w-full"
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => e.stopPropagation()}
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            <rect
              className="transition-all duration-200 motion-reduce:transition-none"
              x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={8} fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)" />
        <rect
          className="transition-all duration-200 motion-reduce:transition-none"
          x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={8}
          fill="none" stroke="rgb(59 130 246 / 0.6)" strokeWidth={target ? 2 : 0}
        />
      </svg>

      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        onKeyDown={trapTab}
        style={popoverStyle}
        className={`absolute border border-zinc-700 bg-zinc-900 p-4 shadow-xl transition-transform duration-200 motion-reduce:transition-none ${
          placement.mode === 'sheet' ? 'inset-x-0 bottom-0 rounded-t-lg' : 'rounded-lg'
        }`}
      >
        <div className="mb-3 flex items-center gap-3">
          <div
            className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={stepIndex + 1}
            aria-label="Fortschritt der Tour"
          >
            <div
              className="h-full rounded-full bg-blue-500 transition-[width] duration-200 motion-reduce:transition-none"
              style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
            />
          </div>
          <span className="shrink-0 text-xs tabular-nums text-zinc-400">Schritt {stepIndex + 1} von {steps.length}</span>
        </div>

        <h2 id="tour-title" className="mb-2 font-display text-base font-semibold text-white">{step.title}</h2>
        <p className="font-body text-sm leading-relaxed text-zinc-300"><TourBody body={step.body} /></p>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {!isLast && (
            <button onClick={skip} className="mr-auto text-xs text-zinc-400 transition-colors hover:text-zinc-300">
              Überspringen
            </button>
          )}
          {!isFirst && (
            <button onClick={back} className="rounded px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800">
              Zurück
            </button>
          )}
          <button
            ref={primaryRef}
            onClick={next}
            className="rounded bg-blue-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            {isFirst ? "Los geht's" : isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
