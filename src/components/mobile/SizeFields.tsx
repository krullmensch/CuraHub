import { useState } from 'react';
import { sizeForHeightCm, sizeForWidthCm, type SizeCm } from '@/lib/mobilePlanner/arSize';

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
const parse = (text: string) => parseFloat(text.replace(',', '.'));

interface SizeFieldsProps {
  size: SizeCm;
  onChange: (size: SizeCm) => void;
  disabled?: boolean;
}

/** Picture width × height in cm, aspect ratio kept; applied on Enter or when a field loses focus. */
export function SizeFields({ size, onChange, disabled }: SizeFieldsProps) {
  const [draft, setDraft] = useState<{ w: string; h: string } | null>(null);
  const shown = draft ?? { w: fmt(size.w), h: fmt(size.h) };

  const apply = (axis: 'w' | 'h') => {
    if (!draft) return;
    const value = parse(axis === 'w' ? draft.w : draft.h);
    setDraft(null);
    const next = axis === 'w' ? sizeForWidthCm(size, value) : sizeForHeightCm(size, value);
    if (next !== size) onChange(next);
  };

  const field = (axis: 'w' | 'h', label: string) => (
    <label className="flex-1">
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      <input
        inputMode="decimal"
        disabled={disabled}
        value={shown[axis]}
        onChange={(e) => setDraft({ ...shown, [axis]: e.target.value })}
        onBlur={() => apply(axis)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-base text-white disabled:opacity-50"
      />
    </label>
  );

  return (
    <div className="flex items-end gap-2">
      {field('w', 'Breite (cm)')}
      <span className="pb-2 text-zinc-500">×</span>
      {field('h', 'Höhe (cm)')}
    </div>
  );
}
