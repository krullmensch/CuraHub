import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BookSettingsForm, type BookSettingsAsset } from './BookSettingsForm';

export type { BookSettingsAsset } from './BookSettingsForm';

interface BookSettingsDialogProps {
  asset: BookSettingsAsset;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Reload the asset list after a change. */
  onSaved: () => void;
}

/** Asset browser: the book settings form in a dialog. */
export function BookSettingsDialog({ asset, open, onOpenChange, onSaved }: BookSettingsDialogProps) {
  const { pageWidthMm, pageHeightMm, pageCount } = asset.metadata ?? {};
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Buch-Einstellungen</DialogTitle>
          <DialogDescription>
            {pageCount ?? 0} Seiten{pageWidthMm && pageHeightMm ? ` · ${Math.round(pageWidthMm)} × ${Math.round(pageHeightMm)} mm` : ''}
          </DialogDescription>
        </DialogHeader>
        <BookSettingsForm mode="dialog" asset={asset} onSaved={onSaved} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
