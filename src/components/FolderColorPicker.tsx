import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOLDER_COLOR_PALETTE } from '@/lib/folders';

interface FolderColorPickerProps {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

/**
 * Inline 4×2 swatch grid for picking a folder color.
 * Used inside the create dialog and the recolor popover.
 */
export const FolderColorPicker = ({ value, onChange, className }: FolderColorPickerProps) => {
  return (
    <div className={cn('grid grid-cols-4 gap-2', className)}>
      {FOLDER_COLOR_PALETTE.map((hex) => {
        const isSelected = value.toLowerCase() === hex.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            className={cn(
              'relative h-8 w-8 rounded-full border-2 transition-transform hover:scale-110',
              isSelected ? 'border-white' : 'border-zinc-700'
            )}
            style={{ backgroundColor: hex }}
            aria-label={`Farbe ${hex}`}
          >
            {isSelected && (
              <Check className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow" strokeWidth={3} />
            )}
          </button>
        );
      })}
    </div>
  );
};
