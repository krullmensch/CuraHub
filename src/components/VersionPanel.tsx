import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { GitBranch } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import type { Version } from './version-graph/buildVersionGraph';

const VersionPanelContent = lazy(() =>
  import('./VersionPanelContent').then((m) => ({ default: m.VersionPanelContent }))
);

export const VersionPanel = ({
  isOpen,
  onToggle,
  leftSidebarOpen,
  rightSidebarOpen,
}: {
  isOpen: boolean;
  onToggle: () => void;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
}) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);

  const token = useAuthStore((state) => state.token);
  const activeExhibitionId = useEditorStore((state) => state.activeExhibitionId);
  const activeVersionId = useEditorStore((state) => state.activeVersionId);

  // --- Fetch (lightweight, no xyflow needed just for the label) ---
  const fetchVersions = useCallback(async () => {
    if (!token || !activeExhibitionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setVersions(await res.json());
    } catch (e) {
      console.error('Failed to fetch versions:', e);
    }
    setLoading(false);
  }, [token, activeExhibitionId]);

  useEffect(() => {
    if (activeExhibitionId) fetchVersions();
    else setVersions([]);
  }, [activeExhibitionId, fetchVersions]);

  // Mark as opened on the click that opens the panel — avoids a setState-in-effect
  // just to derive this from `isOpen` (react-hooks/set-state-in-effect).
  const handleToggle = () => {
    if (!isOpen) setHasOpenedOnce(true);
    onToggle();
  };

  // --- Toggle button (collapsed, always mounted, no heavy deps) ---
  const activeVersion = versions.find((v) => v.id === activeVersionId);
  const branchLabel = activeVersion?.branch_name ?? '–';
  const versionLabel = activeVersion
    ? (activeVersion.comment || `v${activeVersion.id}`)
    : '–';
  const toggleText = `${branchLabel} / ${versionLabel}`;

  const toggleTextRef = useRef<HTMLSpanElement>(null);
  const toggleContainerRef = useRef<HTMLSpanElement>(null);
  const [needsMarquee, setNeedsMarquee] = useState(false);

  useEffect(() => {
    const textEl = toggleTextRef.current;
    const containerEl = toggleContainerRef.current;
    if (!textEl || !containerEl) { setNeedsMarquee(false); return; }
    setNeedsMarquee(textEl.scrollWidth > containerEl.clientWidth);
  }, [toggleText, isOpen]);

  const toggleButton = (
    <button
      onClick={handleToggle}
      title="Versionen anzeigen"
      className={`absolute bottom-0 ${rightSidebarOpen ? 'right-[20.25rem]' : 'right-9'} h-8 max-w-[16rem] bg-blue-600 border border-blue-700 border-b-0 rounded-t-xl flex items-center gap-2 px-3 hover:bg-blue-500 transition-all duration-300 z-10 shadow-[0_-4px_15px_-3px_rgba(59,130,246,0.3)] ${
        isOpen ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
      }`}
    >
      <GitBranch className="h-3.5 w-3.5 text-blue-200 shrink-0" />
      <span
        ref={toggleContainerRef}
        className="overflow-hidden whitespace-nowrap text-xs font-medium text-white min-w-0"
      >
        <span
          ref={toggleTextRef}
          className={needsMarquee ? 'inline-block animate-marquee' : ''}
        >
          {toggleText}
        </span>
        {needsMarquee && (
          <span className="inline-block animate-marquee pl-8" aria-hidden>
            {toggleText}
          </span>
        )}
      </span>
    </button>
  );

  return (
    <>
      {toggleButton}

      {hasOpenedOnce && (
        <Suspense fallback={null}>
          <VersionPanelContent
            isOpen={isOpen}
            onToggle={onToggle}
            leftSidebarOpen={leftSidebarOpen}
            rightSidebarOpen={rightSidebarOpen}
            versions={versions}
            loading={loading}
            fetchVersions={fetchVersions}
          />
        </Suspense>
      )}
    </>
  );
};
