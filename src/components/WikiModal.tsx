import { useEffect } from 'react';
import { X } from 'lucide-react';
import { WikiView } from './WikiView';

interface WikiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WikiModal = ({ isOpen, onClose }: WikiModalProps) => {

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Dimmed backdrop — click to close */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal container */}
      <div className="relative w-[90vw] h-[85vh] max-w-7xl rounded-xl overflow-hidden shadow-2xl border border-zinc-700">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-2 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors backdrop-blur-sm border border-zinc-700"
          title="Close Wiki"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Wiki content rendered in-app */}
        <WikiView />
      </div>
    </div>
  );
};
