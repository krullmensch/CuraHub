import { useState } from 'react';
import { BookOpen, Volume2, VolumeX, X } from 'lucide-react';
import { useEditorStore, videoRefMap } from '@/store/editorStore';
import { useWalking } from '@/lib/touch/walking';

/**
 * Touch viewer's artwork info: set by a tap (TouchTapHandler), compact at the top so it never covers
 * the sticks, closed with ✕ or a tap into empty space. Same design language as the desktop panel.
 */
export function TouchArtworkInfo() {
  const info = useEditorStore((s) => s.fpvHoveredInfo);
  const walking = useWalking();
  const [muted, setMuted] = useState(true);
  const [mutedFor, setMutedFor] = useState<number | null>(null);

  if (!info || !walking) return null;

  // Each video starts muted in the panel's eyes; the real state lives on the <video> element.
  if (mutedFor !== info.instanceId) {
    setMutedFor(info.instanceId);
    setMuted(videoRefMap.get(info.instanceId)?.muted ?? true);
  }

  const toggleMute = () => {
    const vid = videoRefMap.get(info.instanceId);
    if (!vid) return;
    vid.muted = !vid.muted;
    setMuted(vid.muted);
  };

  return (
    <div
      className="fixed inset-x-0 z-[1006] flex justify-center px-4 pointer-events-none"
      style={{ top: 'calc(env(safe-area-inset-top) + 72px)' }}
    >
      <div
        className="pointer-events-auto relative w-full max-w-md text-white"
        style={{
          background: 'rgba(0, 0, 0, 0.35)',
          border: '2px solid rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(10px)',
          padding: '12px 40px 12px 12px',
        }}
      >
        <button
          type="button"
          aria-label="Schließen"
          onClick={() => useEditorStore.getState().setFpvHoveredInfo(null)}
          className="absolute top-1 right-1 p-2 text-white/80"
        >
          <X size={18} />
        </button>
        <div
          style={{ fontFamily: '"Funnel Display", sans-serif', fontSize: 20, fontWeight: 800, lineHeight: 1.2, overflowWrap: 'anywhere' }}
        >
          {info.title}
        </div>
        {info.description && (
          <div
            className="mt-1 overflow-y-auto"
            style={{ fontFamily: '"Albert Sans", sans-serif', fontSize: 14, lineHeight: 1.2, maxHeight: '22vh', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', touchAction: 'pan-y', overscrollBehavior: 'contain' }}
          >
            {info.description}
          </div>
        )}
        {(info.artist || info.year) && (
          <div className="mt-2" style={{ fontFamily: '"Albert Sans", sans-serif', fontSize: 14, fontWeight: 800 }}>
            {info.artist}
            {info.artist && info.year && ' — '}
            {info.year}
          </div>
        )}
        {info.assetType === 'video' && (
          <button
            type="button"
            onClick={toggleMute}
            className="mt-2 flex items-center gap-1.5 text-xs text-white/70"
            style={{ fontFamily: '"Albert Sans", sans-serif' }}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {muted ? 'Ton aktivieren' : 'Stummschalten'}
          </button>
        )}
        {/* A readable book within reach opens on tap, so a shown book is one that is too far away. */}
        {info.assetType === 'book' && (info as { publicReadable?: boolean }).publicReadable === true && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-white/60" style={{ fontFamily: '"Albert Sans", sans-serif' }}>
            <BookOpen size={14} />
            Näher herangehen zum Lesen
          </div>
        )}
      </div>
    </div>
  );
}
