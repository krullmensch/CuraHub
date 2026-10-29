import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTourStore } from '@/store/tourStore';
import { isOnScreen, popoverPosition, spotlightRect, type Rect } from '@/lib/tour/placement';
import { TourBody } from './TourBody';

const POPOVER_WIDTH = 320;

/** Measured target of one step; `key` ties it to the step so a stale rect is never shown. */
interface Measured { key: string; rect: Rect | null }

function measureTarget(target: string | undefined): Rect | null {
  if (!target) return null;
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const rect = { x: r.left, y: r.top, width: r.width, height: r.height };
  if (rect.width === 0 || rect.height === 0) return null;
  return isOnScreen(rect, { width: window.innerWidth, height: window.innerHeight }) ? rect : null;
}

/**
 * The dashboard tour: dims the screen, cuts the current step's element out of the dimming and
 * shows the step's popover next to it. Swallows clicks outside the popover while it runs.
 */
export function TourOverlay() {
  const active = useTourStore((s) => s.active);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const steps = useTourStore((s) => s.steps);
  const step = active ? steps[stepIndex] : undefined;
  const stepKey = step ? `${stepIndex}:${step.id}` : '';

  const [measured, setMeasured] = useState<Measured>({ key: '', rect: null });
  const [popSize, setPopSize] = useState({ width: POPOVER_WIDTH, height: 180 });
  const [viewport, setViewport] = useState({ width: window.innerWidth, height: window.innerHeight });
  const popoverRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  // A logout (or any unmount of the editor) must not leave the controls locked by a running tour.
  useEffect(() => () => useTourStore.getState().reset(), []);

  // Find and follow the target. ResizeObserver reports once on observe, so the first measure
  // happens in its callback.
  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const measure = () => {
      setMeasured({ key: stepKey, rect: measureTarget(step.target) });
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    if (el) ro.observe(el);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step, stepKey]);

  // Popover size for the placement.
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!active || !el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setPopSize((prev) => (prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [active]);

  useEffect(() => {
    if (active) primaryRef.current?.focus();
  }, [active, stepIndex]);

  // Tour keys win over the editor's and the wiki's handlers.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const { next, back, skip } = useTourStore.getState();
      if (e.key === 'Enter') {
        const onButton = e.target instanceof HTMLButtonElement && popoverRef.current?.contains(e.target);
        if (onButton) return; // the focused button's own click
        next();
      } else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
      else if (e.key === 'Escape') skip();
      else return;
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
  const target = measured.key === stepKey ? measured.rect : null;
  const hole = target ? spotlightRect(target) : null;
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

  const popoverStyle: React.CSSProperties =
    placement.mode === 'anchored'
      ? { left: 0, top: 0, width: POPOVER_WIDTH, transform: `translate(${placement.x}px, ${placement.y}px)` }
      : placement.mode === 'centered'
        ? { left: '50%', top: '50%', width: POPOVER_WIDTH, transform: 'translate(-50%, -50%)' }
        : {};

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
            {hole && (
              <rect
                className="transition-all duration-200 motion-reduce:transition-none"
                x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={8} fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tour-mask)" />
        {hole && (
          <rect
            className="transition-all duration-200 motion-reduce:transition-none"
            x={hole.x} y={hole.y} width={hole.width} height={hole.height} rx={8}
            fill="none" stroke="rgb(59 130 246 / 0.6)" strokeWidth={2}
          />
        )}
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
        <h2 id="tour-title" className="mb-2 font-display text-base font-semibold text-white">{step.title}</h2>
        <p className="font-body text-sm leading-relaxed text-zinc-300"><TourBody body={step.body} /></p>

        <div className="mt-4 flex items-center gap-3">
          {!isLast && (
            <button onClick={skip} className="text-xs text-zinc-500 transition-colors hover:text-zinc-300">
              Überspringen
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5" aria-hidden="true">
            {steps.map((s, i) => (
              <span key={s.id} className={`h-1.5 w-1.5 rounded-full ${i === stepIndex ? 'bg-blue-500' : 'bg-zinc-700'}`} />
            ))}
          </div>
          <span className="text-xs tabular-nums text-zinc-500">{stepIndex + 1} / {steps.length}</span>
          {!isFirst && (
            <button onClick={back} className="rounded px-2.5 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800">
              Zurück
            </button>
          )}
          <button
            ref={primaryRef}
            onClick={next}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-500"
          >
            {isFirst ? "Los geht's" : isLast ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
