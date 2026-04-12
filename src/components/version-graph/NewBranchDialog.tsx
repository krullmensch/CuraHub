import { useState } from 'react';
import { GitBranch, X } from 'lucide-react';
import type { Version } from './buildVersionGraph';

interface NewBranchDialogProps {
  sourceVersion: Version;
  onConfirm: (branchName: string) => Promise<void>;
  onCancel: () => void;
}

export const NewBranchDialog = ({ sourceVersion, onConfirm, onCancel }: NewBranchDialogProps) => {
  const [branchName, setBranchName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReserved = branchName.trim().toLowerCase() === 'main';
  const isValid = branchName.trim().length > 0 && !isReserved;

  const handleConfirm = async () => {
    if (!isValid) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm(branchName.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Erstellen des Branches');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-indigo-400" />
            <h2 className="text-base font-semibold text-white">Neuer Branch</h2>
          </div>
          <button onClick={onCancel} className="p-1 hover:bg-zinc-800 rounded transition-colors">
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-zinc-500 mb-1">Basiert auf</p>
            <p className="text-sm text-white bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 truncate">
              <span className="text-zinc-400 mr-1.5">[{sourceVersion.branch_name}]</span>
              {sourceVersion.comment || 'Kein Kommentar'}
            </p>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Branch-Name</label>
            <input
              type="text"
              placeholder="z. B. entwurf-kurator, experiment-licht"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              autoFocus
            />
            {isReserved && (
              <p className="text-xs text-red-400 mt-1">"main" ist reserviert und kann nicht als Branch-Name verwendet werden.</p>
            )}
          </div>

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
            disabled={loading || !isValid}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
          >
            {loading ? 'Erstelle…' : 'Branch erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
};
