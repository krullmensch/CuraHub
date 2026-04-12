import { useState } from 'react';
import { GitMerge, X } from 'lucide-react';
import type { Version } from './buildVersionGraph';

interface MergeDialogProps {
  sourceVersion: Version;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export const MergeDialog = ({ sourceVersion, onConfirm, onCancel }: MergeDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Mergen');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <GitMerge className="h-4 w-4 text-green-400" />
            <h2 className="text-base font-semibold text-white">Branch in main mergen</h2>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-zinc-800 rounded transition-colors">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-zinc-300">
            Der Inhalt des Branches{' '}
            <span className="font-semibold text-white">„{sourceVersion.branch_name}"</span>{' '}
            wird als neue Version auf <span className="font-semibold text-white">main</span> kopiert.
          </p>
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
            <p className="text-xs text-zinc-500 mb-0.5">Quell-Version</p>
            <p className="text-sm text-white truncate">{sourceVersion.comment || 'Kein Kommentar'}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{sourceVersion._count.instances} Objekte</p>
          </div>
          <p className="text-xs text-zinc-500">
            Die bestehenden Versionen auf main werden nicht verändert — es wird lediglich eine neue Version hinzugefügt.
          </p>

          {error && (
            <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
          >
            {loading ? 'Merging…' : 'Merge bestätigen'}
          </button>
        </div>
      </div>
    </div>
  );
};
