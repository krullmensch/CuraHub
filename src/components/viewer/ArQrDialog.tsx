import { useEffect, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useEditorStore } from '../../store/editorStore';

interface ArQrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Absolute viewer URL with ?ar=1. */
  url: string;
}

/** Desktop: QR code that opens the exhibition on a phone. Generated in the browser, loaded only on demand. */
export function ArQrDialog({ open, onOpenChange, url }: ArQrDialogProps) {
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { margin: 1, width: 256 }))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  // Keeps first-person keys from firing behind the dialog.
  useEffect(() => {
    if (!open) return;
    useEditorStore.getState().setDialogOpen(true);
    return () => useEditorStore.getState().setDialogOpen(false);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Above the entry overlay (z-[1000]) and the header (z-[1010]). */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[1100] bg-black/80" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-[1110] grid w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border border-zinc-800 bg-zinc-950 p-6 text-zinc-100 shadow-lg">
          <div className="flex flex-col gap-1.5">
            <DialogPrimitive.Title className="text-lg font-semibold">Auf dem Handy öffnen</DialogPrimitive.Title>
            <DialogPrimitive.Description className="text-sm text-zinc-400">
              Scanne den Code mit dem Handy, um die Ausstellung in echter Größe in deinem Raum zu sehen.
            </DialogPrimitive.Description>
          </div>
          <div className="mx-auto flex h-64 w-64 items-center justify-center rounded-md bg-white">
            {qr && <img src={qr} alt="QR-Code zur Ausstellung" width={256} height={256} />}
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100" aria-label="Schließen">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
