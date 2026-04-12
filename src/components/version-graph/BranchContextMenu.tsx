import { useEffect, useRef } from 'react';
import { CheckCircle, GitBranch, GitMerge, Trash2 } from 'lucide-react';
import type { Version } from './buildVersionGraph';

interface BranchContextMenuProps {
  version: Version;
  x: number;
  y: number;
  isActive: boolean;
  canCurate: boolean;
  onClose: () => void;
  onLoad: (version: Version) => void;
  onNewBranch: (version: Version) => void;
  onMerge: (version: Version) => void;
  onDelete: (version: Version) => void;
}

export const BranchContextMenu = ({
  version,
  x,
  y,
  isActive,
  canCurate,
  onClose,
  onLoad,
  onNewBranch,
  onMerge,
  onDelete,
}: BranchContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Adjust position so menu doesn't overflow viewport
  const adjustedX = Math.min(x, window.innerWidth - 200);
  const adjustedY = Math.min(y, window.innerHeight - 200);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-48 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 text-sm"
      style={{ left: adjustedX, top: adjustedY }}
    >
      <div className="px-3 py-1.5 border-b border-zinc-800 mb-1">
        <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium truncate">
          {version.branch_name}
        </p>
        <p className="text-xs text-white truncate">{version.comment || 'Kein Kommentar'}</p>
      </div>

      {!isActive && (
        <button
          onClick={() => { onLoad(version); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-white hover:bg-zinc-800 transition-colors"
        >
          <CheckCircle className="h-4 w-4 text-blue-400 shrink-0" />
          Aktivieren
        </button>
      )}

      {canCurate && (
        <button
          onClick={() => { onNewBranch(version); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-white hover:bg-zinc-800 transition-colors"
        >
          <GitBranch className="h-4 w-4 text-indigo-400 shrink-0" />
          Neuer Branch ab hier
        </button>
      )}

      {canCurate && version.branch_name !== 'main' && (
        <button
          onClick={() => { onMerge(version); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-white hover:bg-zinc-800 transition-colors"
        >
          <GitMerge className="h-4 w-4 text-green-400 shrink-0" />
          In main mergen
        </button>
      )}

      <div className="border-t border-zinc-800 mt-1 pt-1">
        <button
          onClick={() => { onDelete(version); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
          Löschen
        </button>
      </div>
    </div>
  );
};
