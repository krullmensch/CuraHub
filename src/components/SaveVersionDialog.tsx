import { useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { Save, X } from 'lucide-react';

interface SaveVersionDialogProps {
  onSave: () => void;
  onCancel: () => void;
}

export const SaveVersionDialog = ({ onSave, onCancel }: SaveVersionDialogProps) => {
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = useAuthStore((state) => state.token);
  const activeExhibitionId = useEditorStore((state) => state.activeExhibitionId);
  const activeVersionId = useEditorStore((state) => state.activeVersionId);
  const setActiveVersion = useEditorStore((state) => state.setActiveVersion);
  const triggerRefresh = useEditorStore((state) => state.triggerInstancesRefresh);

  const handleSave = async () => {
    if (!comment.trim() || !token || !activeExhibitionId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          comment: comment.trim(),
          sourceVersionId: activeVersionId,
          instances: (() => {
            const walls = useEditorStore.getState().localWalls;
            return useEditorStore.getState().localInstances.map(inst => ({
              artworkId: inst.artworkId !== undefined ? inst.artworkId : (inst.artwork.id !== undefined ? inst.artwork.id : undefined),
              assetId: inst.assetId,
              wallId: inst.wallId ?? null,
              wallIndex: inst.wallId ? walls.findIndex(w => w.id === inst.wallId) : null,
              position_x: inst.position_x,
              position_y: inst.position_y,
              position_z: inst.position_z,
              rotation_x: inst.rotation_x,
              rotation_y: inst.rotation_y,
              rotation_z: inst.rotation_z,
              scale_x: inst.scale_x,
              scale_y: inst.scale_y,
              scale_z: inst.scale_z,
            }));
          })(),
          walls: useEditorStore.getState().localWalls.map(w => ({
            label: w.label ?? null,
            position_x: w.position_x,
            position_y: w.position_y,
            position_z: w.position_z,
            rotation_x: w.rotation_x,
            rotation_y: w.rotation_y,
            rotation_z: w.rotation_z,
            width: w.width,
            height: w.height,
            thickness: w.thickness,
            color: w.color,
            isLocked: w.isLocked,
          }))
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save version');
      }

      const newVersion = await res.json();
      setActiveVersion(newVersion.id);
      useEditorStore.getState().markSaved();
      triggerRefresh();
      onSave();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Save className="h-4 w-4 text-blue-400" />
            <h2 className="text-base font-semibold text-white">Save as New Version</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-zinc-800 rounded transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <label className="block text-sm text-gray-400 mb-2">
            Version comment
          </label>
          <textarea
            placeholder="Describe what changed in this version..."
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) handleSave();
            }}
            className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            rows={3}
            autoFocus
          />
          <p className="text-xs text-gray-600 mt-1.5">
            A snapshot of all current artwork placements and modular walls will be saved.
          </p>

          {error && (
            <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded text-sm text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-zinc-800">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading || !comment.trim()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm text-white font-medium transition-colors"
          >
            {loading ? 'Saving...' : 'Save Version'}
          </button>
        </div>
      </div>
    </div>
  );
};
