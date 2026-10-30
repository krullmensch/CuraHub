import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, LogOut, Monitor } from 'lucide-react';
import { EditorPage } from '@/pages/EditorPage';
import { ProjectSelector } from '@/components/ProjectSelector';
import { PublishedVersionBadge } from '@/components/versions/PublishedVersionBadge';
import { SelfAvatar } from '@/components/live/PresenceAvatars';
import { useEditorStore } from '@/store/editorStore';
import { RoomTab } from './RoomTab';
import { AssetsTab } from './AssetsTab';

type Tab = 'room' | 'assets';

interface MobilePlannerLayoutProps {
  onFullEditor: () => void;
  onLogout: () => void;
}

/**
 * The editor on a phone: the room on top (orbit, tap to select), a sheet below with „Raum" (the
 * selected artwork's info, frame and AR) and „Assets" (AR for unplaced pictures). Same stores,
 * auto-sync, claims and published-version protection as the full editor.
 */
export function MobilePlannerLayout({ onFullEditor, onLogout }: MobilePlannerLayoutProps) {
  const [tab, setTab] = useState<Tab>('room');
  const [collapsed, setCollapsed] = useState(false);
  const selectedId = useEditorStore((s) => s.selectedInstanceId);

  // Gizmos, keys, the wall editor and first person stay off while this layout is mounted.
  useEffect(() => {
    const store = useEditorStore.getState();
    store.setMobilePlanner(true);
    // Coming from the full editor: no way out of the wall editor or a multi-selection on the phone.
    if (store.wallEditor) store.closeWallEditor();
    if (store.selectedInstanceIds.length > 1) store.selectInstance(store.selectedInstanceId);
    if (store.plannerViewMode !== 'perspective') store.setPlannerViewMode('perspective');
    return () => useEditorStore.getState().setMobilePlanner(false);
  }, []);

  // A tapped artwork brings its tab up.
  const [seenSelection, setSeenSelection] = useState(selectedId);
  if (seenSelection !== selectedId) {
    setSeenSelection(selectedId);
    if (selectedId !== null) {
      setTab('room');
      setCollapsed(false);
    }
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-950 text-white" style={{ height: '100dvh' }}>
      <header
        className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-3 py-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
      >
        <div className="min-w-0 flex-1">
          <ProjectSelector />
        </div>
        <SelfAvatar />
        <button type="button" aria-label="Logout" onClick={onLogout} className="rounded-md p-2 text-zinc-400">
          <LogOut size={18} />
        </button>
      </header>
      <div className="flex justify-center border-b border-zinc-800 bg-zinc-900 px-3 py-1 empty:hidden">
        <PublishedVersionBadge />
      </div>

      <div className="relative min-h-0 flex-1" style={{ touchAction: 'none' }}>
        <EditorPage isVisible />
      </div>

      <section
        className={`flex flex-col border-t border-zinc-800 bg-zinc-900 ${collapsed ? '' : 'h-[45dvh]'}`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center border-b border-zinc-800">
          {(['room', 'assets'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setCollapsed(false); }}
              className={`flex-1 py-2.5 text-sm font-medium ${tab === t && !collapsed ? 'text-white border-b-2 border-blue-500' : 'text-zinc-400'}`}
            >
              {t === 'room' ? 'Raum' : 'Assets'}
            </button>
          ))}
          <button
            type="button"
            aria-label={collapsed ? 'Ausklappen' : 'Einklappen'}
            onClick={() => setCollapsed((c) => !c)}
            className="px-3 py-2.5 text-zinc-400"
          >
            {collapsed ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
        {!collapsed && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4" style={{ overscrollBehavior: 'contain' }}>
            {tab === 'room' ? <RoomTab /> : <AssetsTab />}
            <button
              type="button"
              onClick={onFullEditor}
              className="mt-6 flex w-full items-center justify-center gap-2 text-xs text-zinc-500"
            >
              <Monitor size={14} />
              Vollen Editor öffnen
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
