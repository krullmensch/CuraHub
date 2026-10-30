import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Search, Smartphone } from 'lucide-react';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';
import { assetSearch, arSourceFromAsset, type PlannerAsset } from '@/lib/mobilePlanner/assetSearch';
import { arArtworkInstance } from '@/lib/mobilePlanner/arArtwork';
import { assetSizeCm } from '@/lib/mobilePlanner/arSize';
import { FrameSheet } from './FrameSheet';

const ArWallSheet = lazy(() => import('./ArWallSheet'));

interface ArTarget {
  instance: ArtworkInstanceData;
  title: string;
  sizeLabel: string;
}

const titleOf = (asset: PlannerAsset) => asset.artwork?.title || asset.filename;
const cmText = (v: number) => (Math.round(v * 10) / 10).toLocaleString('de-DE');
const sizeLabel = (s: { w: number; h: number }) => `${cmText(s.w)} × ${cmText(s.h)} cm`;

/** The project's pictures and videos, each with „In AR an Wand" (no upload, no placing on the phone). */
export function AssetsTab() {
  const projectId = useEditorStore((s) => s.activeProjectId);
  const token = useAuthStore((s) => s.token);
  const [assets, setAssets] = useState<PlannerAsset[]>([]);
  const [query, setQuery] = useState('');
  const [sheetFor, setSheetFor] = useState<PlannerAsset | null>(null);
  const [arTarget, setArTarget] = useState<ArTarget | null>(null);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/assets?projectId=${projectId}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: PlannerAsset[]) => { if (!cancelled) setAssets(data); })
      .catch(() => toast.error('Fehler', { description: 'Assets konnten nicht geladen werden.' }));
    return () => { cancelled = true; };
  }, [projectId, token]);

  const shown = useMemo(() => assetSearch(assets, query), [assets, query]);
  const closeAr = useCallback(() => setArTarget(null), []);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2">
        <Search size={16} className="text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suchen"
          className="w-full bg-transparent text-base text-white outline-none placeholder:text-zinc-500"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        {shown.map((asset) => {
          return (
            <div key={asset.id} className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900">
              <img src={asset.thumbnailPath || asset.path} alt="" loading="lazy" className="aspect-square w-full object-cover" />
              <div className="space-y-2 p-2">
                <div className="truncate text-xs text-zinc-200">{titleOf(asset)}</div>
                <button
                  type="button"
                  onClick={() => setSheetFor(asset)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 py-2 text-xs font-semibold text-white disabled:opacity-40"
                >
                  <Smartphone size={14} />
                  In AR an Wand
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {sheetFor && (
        <FrameSheet
          title={titleOf(sheetFor)}
          imageUrl={sheetFor.thumbnailPath || sheetFor.path}
          pictureCm={assetSizeCm(arSourceFromAsset(sheetFor).artwork)}
          onCancel={() => setSheetFor(null)}
          onStart={(frame, size) => {
            setArTarget({
              instance: arArtworkInstance(arSourceFromAsset(sheetFor), frame, size),
              title: titleOf(sheetFor),
              sizeLabel: sizeLabel(size),
            });
            setSheetFor(null);
          }}
        />
      )}

      {arTarget && (
        <Suspense fallback={null}>
          <ArWallSheet {...arTarget} onClose={closeAr} />
        </Suspense>
      )}
    </div>
  );
}
