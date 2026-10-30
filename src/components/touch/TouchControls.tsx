import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { StickTracker } from '@/lib/touch/stickTracker';
import { touchInput } from '@/lib/touch/touchInput';
import type { StickValue } from '@/lib/touch/stick';
import { useControlsLocked } from '@/lib/controlsLock';

/** Stick diameter: 28 % of the short screen side, between 96 and 140 px. */
function stickSize(): number {
  if (typeof window === 'undefined') return 120;
  return Math.round(Math.min(140, Math.max(96, 0.28 * Math.min(window.innerWidth, window.innerHeight))));
}

interface StickProps {
  side: 'left' | 'right';
  size: number;
  disabled: boolean;
  onChange: (v: StickValue) => void;
  label: string;
}

function Stick({ side, size, disabled, onChange, label }: StickProps) {
  const radius = size / 2;
  const tracker = useRef(new StickTracker(radius));
  const knob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = new StickTracker(radius);
    tracker.current = t;
    return () => {
      t.release();
      onChange({ x: 0, y: 0 });
    };
  }, [radius, onChange]);

  useEffect(() => {
    if (!disabled) return;
    tracker.current.release();
    onChange({ x: 0, y: 0 });
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
  }, [disabled, onChange]);

  const moveKnob = (x: number, y: number) => {
    const offset = tracker.current.knobOffset(x, y);
    if (knob.current) knob.current.style.transform = `translate(${offset.x}px, ${offset.y}px)`;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const centre = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    if (!tracker.current.pointerDown(e.pointerId, e.clientX, e.clientY, centre)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveKnob(e.clientX, e.clientY);
    onChange(tracker.current.value());
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!tracker.current.owns(e.pointerId)) return;
    e.preventDefault();
    tracker.current.pointerMove(e.pointerId, e.clientX, e.clientY);
    moveKnob(e.clientX, e.clientY);
    onChange(tracker.current.value());
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!tracker.current.owns(e.pointerId)) return;
    tracker.current.pointerUp(e.pointerId);
    if (knob.current) knob.current.style.transform = 'translate(0px, 0px)';
    onChange({ x: 0, y: 0 });
  };

  const knobSize = Math.round(size * 0.42);
  const inset = side === 'left'
    ? { left: 'calc(env(safe-area-inset-left) + 24px)' }
    : { right: 'calc(env(safe-area-inset-right) + 24px)' };

  return (
    <div
      role="presentation"
      aria-label={label}
      data-touch-stick={side}
      className="fixed z-[1005] rounded-full border border-white/40 bg-black/20 backdrop-blur-sm"
      style={{
        ...inset,
        bottom: 'calc(env(safe-area-inset-bottom) + 24px)',
        width: size,
        height: size,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onLostPointerCapture={onUp}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        ref={knob}
        className="pointer-events-none absolute rounded-full bg-white/70 shadow-md"
        style={{ width: knobSize, height: knobSize, left: (size - knobSize) / 2, top: (size - knobSize) / 2 }}
      />
    </div>
  );
}

/** The touch viewer's twin joysticks: bottom left walks, bottom right looks around. */
export function TouchControls() {
  const locked = useControlsLocked();
  const [size, setSize] = useState(stickSize);

  useEffect(() => {
    const onResize = () => setSize(stickSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <>
      <Stick side="left" size={size} disabled={locked} onChange={touchInput.setMove} label="Gehen" />
      <Stick side="right" size={size} disabled={locked} onChange={touchInput.setLook} label="Umsehen" />
    </>
  );
}
