import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Monitor, Projector } from 'lucide-react';

interface VideoMediumPickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (medium: 'monitor' | 'beamer') => void;
}

export function VideoMediumPickerDialog({ open, onOpenChange, onSelect }: VideoMediumPickerDialogProps) {
    const handlePick = (medium: 'monitor' | 'beamer') => {
        onSelect(medium);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-zinc-100 max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-zinc-100">Wiedergabemedium wählen</DialogTitle>
                    <DialogDescription className="text-zinc-400">
                        Auf welchem Medium soll dieses Video gezeigt werden?
                    </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => handlePick('monitor')}
                        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-6 text-zinc-100 transition-colors hover:border-blue-500 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <Monitor className="h-10 w-10 text-zinc-300" />
                        <span className="text-sm font-medium">Monitor</span>
                        <span className="text-[10px] text-zinc-500 text-center leading-tight">
                            65" Bildschirm,<br />feste Größe
                        </span>
                    </button>
                    <button
                        type="button"
                        onClick={() => handlePick('beamer')}
                        className="flex flex-col items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-6 text-zinc-100 transition-colors hover:border-blue-500 hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <Projector className="h-10 w-10 text-zinc-300" />
                        <span className="text-sm font-medium">Beamer</span>
                        <span className="text-[10px] text-zinc-500 text-center leading-tight">
                            Projektion,<br />Größe einstellbar
                        </span>
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
