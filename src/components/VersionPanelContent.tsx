import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
  type ReactFlowInstance,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ChevronDown, Layers, Save, LayoutDashboard } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';
import { useAuthStore } from '../store/authStore';
import { SaveVersionDialog } from './SaveVersionDialog';
import { VersionNode } from './version-graph/VersionNode';
import { BranchContextMenu } from './version-graph/BranchContextMenu';
import { NewBranchDialog } from './version-graph/NewBranchDialog';
import { MergeDialog } from './version-graph/MergeDialog';
import { buildVersionGraph } from './version-graph/buildVersionGraph';
import type { Version } from './version-graph/buildVersionGraph';
import type { VersionNodeData } from './version-graph/buildVersionGraph';

const nodeTypes: NodeTypes = { versionNode: VersionNode as NodeTypes[string] };

const MIN_HEIGHT = 200;
const MAX_HEIGHT = 600;
const DEFAULT_HEIGHT = 384; // h-96

interface VersionPanelContentProps {
  isOpen: boolean;
  onToggle: () => void;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  versions: Version[];
  loading: boolean;
  fetchVersions: () => Promise<void>;
}

export const VersionPanelContent = ({
  isOpen,
  onToggle,
  leftSidebarOpen,
  rightSidebarOpen,
  versions,
  loading,
  fetchVersions,
}: VersionPanelContentProps) => {
  const [panelHeight, setPanelHeight] = useState(DEFAULT_HEIGHT);
  const [isResizing, setIsResizing] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    version: Version;
    x: number;
    y: number;
  } | null>(null);

  // Dialog state
  const [branchSourceVersion, setBranchSourceVersion] = useState<Version | null>(null);
  const [mergeSourceVersion, setMergeSourceVersion] = useState<Version | null>(null);

  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const rfInstanceRef = useRef<ReactFlowInstance<Node<VersionNodeData>, Edge> | null>(null);
  const hasInitialFit = useRef(false);
  const activeVersionIdRef = useRef<number | null>(null);
  const prevVersionCountRef = useRef<number>(0);
  const versionsRef = useRef<Version[]>([]);

  const token = useAuthStore((state) => state.token);
  const isCurator = useAuthStore((state) => state.isCurator);
  const activeExhibitionId = useEditorStore((state) => state.activeExhibitionId);
  const activeVersionId = useEditorStore((state) => state.activeVersionId);
  const setActiveVersion = useEditorStore((state) => state.setActiveVersion);
  const triggerRefresh = useEditorStore((state) => state.triggerInstancesRefresh);

  const canCurate = isCurator;

  // Keep refs in sync so effects can read latest values without re-triggering
  // (layout effects run before the passive effects below)
  useLayoutEffect(() => {
    activeVersionIdRef.current = activeVersionId ?? null;
    versionsRef.current = versions;
  });

  // --- Graph state ---
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => buildVersionGraph(versions, activeVersionId ?? null),
    [versions, activeVersionId]
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<VersionNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // When versions list changes → recompute layout.
  // If count grew (new version/branch created) → full tidy + fitView.
  // Otherwise (initial load, deletion) → preserve existing positions.
  useEffect(() => {
    const { nodes: n, edges: e } = buildVersionGraph(versions, activeVersionIdRef.current);
    const prev = prevVersionCountRef.current;
    prevVersionCountRef.current = versions.length;

    if (versions.length !== prev) {
      // Count changed (new version/branch added, or deletion) → full tidy + fitView
      setNodes(n);
      setEdges(e);
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.3, maxZoom: 1.2 }), 50);
    } else {
      // Same count (e.g. exhibition switched, data refreshed) → preserve positions
      setNodes((prevNodes) => {
        const existingPositions = new Map(prevNodes.map((node) => [node.id, node.position]));
        return n.map((node) => ({
          ...node,
          position: existingPositions.get(node.id) ?? node.position,
        }));
      });
      setEdges(e);
    }
  }, [versions, setNodes, setEdges]);

  // When only activeVersionId changes → update isActive + isOnActiveBranch without touching positions
  useEffect(() => {
    const activeBranch = versionsRef.current.find((v) => v.id === activeVersionId)?.branch_name ?? null;
    setNodes((prev) =>
      prev.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isActive: node.id === String(activeVersionId),
          isOnActiveBranch: (node.data as VersionNodeData).version.branch_name === activeBranch,
        },
      }))
    );
  }, [activeVersionId, setNodes]);

  // Fit view only on first data load, never on subsequent version updates
  useEffect(() => {
    if (versions.length > 0 && !hasInitialFit.current && rfInstanceRef.current) {
      hasInitialFit.current = true;
      setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.3, maxZoom: 1.2 }), 50);
    }
  }, [versions.length]);

  // --- Resize handle ---
  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeStartRef.current = { y: e.clientY, height: panelHeight };
      setIsResizing(true);
    },
    [panelHeight]
  );

  useEffect(() => {
    if (!isResizing) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;
      const delta = resizeStartRef.current.y - e.clientY;
      const newHeight = Math.min(
        MAX_HEIGHT,
        Math.max(MIN_HEIGHT, resizeStartRef.current.height + delta)
      );
      setPanelHeight(newHeight);
    };
    const onMouseUp = () => setIsResizing(false);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);

  // --- Context menu ---
  const openContextMenu = useCallback((event: { clientX: number; clientY: number; preventDefault: () => void }, node: Node<VersionNodeData>) => {
    event.preventDefault();
    const version = (node.data as VersionNodeData).version;
    setContextMenu({ version, x: event.clientX, y: event.clientY });
  }, []);

  const onNodeContextMenu: NodeMouseHandler = useCallback((event, node) => {
    openContextMenu(event, node as Node<VersionNodeData>);
  }, [openContextMenu]);

  const onNodeClick: NodeMouseHandler = useCallback((event, node) => {
    openContextMenu(event, node as Node<VersionNodeData>);
  }, [openContextMenu]);

  // --- Actions ---
  const handleLoad = useCallback(
    (version: Version) => {
      setActiveVersion(version.id);
      triggerRefresh();
    },
    [setActiveVersion, triggerRefresh]
  );

  const handleNewBranch = useCallback((version: Version) => {
    setBranchSourceVersion(version);
  }, []);

  const handleMerge = useCallback((version: Version) => {
    setMergeSourceVersion(version);
  }, []);

  const handleDelete = useCallback(
    async (version: Version) => {
      if (!token || !activeExhibitionId) return;
      try {
        const res = await fetch(
          `/api/exhibitions/${activeExhibitionId}/versions/${version.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          if (activeVersionId === version.id) {
            const fallback =
              versions.find((v) => v.id === version.parent_version_id) ??
              versions.find((v) => v.parent_version_id === null) ??
              null;
            setActiveVersion(fallback?.id ?? null);
            triggerRefresh();
          }
          fetchVersions();
        } else {
          const err = await res.json();
          alert(err.error || 'Fehler beim Löschen');
        }
      } catch {
        alert('Netzwerkfehler beim Löschen');
      }
    },
    [token, activeExhibitionId, activeVersionId, setActiveVersion, triggerRefresh, fetchVersions, versions]
  );

  const handlePublish = useCallback(
    async (version: Version) => {
      if (!token || !activeExhibitionId) return;
      try {
        const res = await fetch(
          `/api/exhibitions/${activeExhibitionId}/versions/${version.id}/publish`,
          { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } }
        );
        if (res.ok) {
          fetchVersions();
        } else {
          const err = await res.json();
          alert(err.error || 'Fehler beim Veröffentlichen');
        }
      } catch {
        alert('Netzwerkfehler beim Veröffentlichen');
      }
    },
    [token, activeExhibitionId, fetchVersions]
  );

  const handleConfirmBranch = useCallback(
    async (branchName: string) => {
      if (!branchSourceVersion || !token || !activeExhibitionId) return;
      const res = await fetch(`/api/exhibitions/${activeExhibitionId}/versions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          comment: `Branch: ${branchName} (ab ${branchSourceVersion.comment || `v${branchSourceVersion.id}`})`,
          branch_name: branchName,
          sourceVersionId: branchSourceVersion.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Branch konnte nicht erstellt werden');
      }
      const newVersion = await res.json();
      setBranchSourceVersion(null);
      await fetchVersions();
      setActiveVersion(newVersion.id);
      triggerRefresh();
    },
    [branchSourceVersion, token, activeExhibitionId, fetchVersions, setActiveVersion, triggerRefresh]
  );

  const handleConfirmMerge = useCallback(async () => {
    if (!mergeSourceVersion || !token || !activeExhibitionId) return;
    const res = await fetch(
      `/api/exhibitions/${activeExhibitionId}/versions/${mergeSourceVersion.id}/merge`,
      { method: 'POST', headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Merge fehlgeschlagen');
    }
    const newVersion = await res.json();
    setMergeSourceVersion(null);
    await fetchVersions();
    setActiveVersion(newVersion.id);
    triggerRefresh();
  }, [mergeSourceVersion, token, activeExhibitionId, fetchVersions, setActiveVersion, triggerRefresh]);

  // --- Tidy layout ---
  const handleTidyLayout = useCallback(() => {
    const { nodes: n, edges: e } = buildVersionGraph(versions, activeVersionId ?? null);
    setNodes(n);
    setEdges(e);
    setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.3, maxZoom: 1.2 }), 50);
  }, [versions, activeVersionId, setNodes, setEdges]);

  return (
    <>
      <div
        className={`absolute bottom-8 bg-zinc-950/90 backdrop-blur-md border border-zinc-800 shadow-2xl z-20 flex flex-col pointer-events-auto rounded-xl overflow-hidden transition-[opacity,transform] duration-300 ease-in-out ${
          isOpen
            ? 'translate-y-0 opacity-100'
            : 'translate-y-[calc(100%+2.5rem)] opacity-0 pointer-events-none'
        } ${leftSidebarOpen ? 'left-[18rem]' : 'left-8'} ${
          rightSidebarOpen ? 'right-[20rem]' : 'right-8'
        }`}
        style={{ height: panelHeight }}
      >
        {/* Resize handle */}
        <div
          className={`absolute top-0 inset-x-0 h-1.5 cursor-ns-resize group z-30 ${isResizing ? 'bg-blue-500/30' : 'hover:bg-blue-500/20'}`}
          onMouseDown={handleResizeMouseDown}
        />

        {/* Header */}
        <div className="px-3 py-2.5 border-b border-zinc-800 bg-blue-600 flex items-center justify-between shrink-0">
          <h3 className="text-sm font-semibold text-white">Versionshistorie</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaveDialog(true)}
              disabled={!activeExhibitionId || !activeVersionId}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed rounded text-xs text-white font-medium transition-colors border border-white/20 shadow-sm"
            >
              <Save className="h-3.5 w-3.5" />
              Version speichern
            </button>
            <button
              onClick={handleTidyLayout}
              disabled={versions.length === 0}
              title="Nodes neu anordnen"
              className="p-1 rounded-md text-blue-100 hover:text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
            </button>
            <button
              onClick={onToggle}
              className="p-1 rounded-md text-blue-100 hover:text-white hover:bg-blue-700 transition-colors"
              title="Schließen"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Graph area */}
        <div className="flex-1 relative overflow-hidden">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-sm text-zinc-500">Lade Versionen…</div>
            </div>
          ) : versions.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-zinc-500">
              <Layers className="h-8 w-8 mb-2 opacity-40" />
              <p className="text-sm">Noch keine Versionen</p>
              <p className="text-xs mt-1">Projekt auswählen, um zu beginnen</p>
            </div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onNodeContextMenu={onNodeContextMenu}
              nodeTypes={nodeTypes}
              onInit={(instance) => {
                rfInstanceRef.current = instance;
                if (!hasInitialFit.current && versions.length > 0) {
                  hasInitialFit.current = true;
                  instance.fitView({ padding: 0.3, maxZoom: 1.2 });
                }
              }}
              nodesDraggable={false}
              nodesConnectable={false}
              connectOnClick={false}
              minZoom={0.3}
              maxZoom={2}
              proOptions={{ hideAttribution: true }}
              className="bg-transparent"
              onPaneClick={() => setContextMenu(null)}
            >
              <Background color="#3f3f46" gap={20} size={1} />
              <Controls
                className="!bg-zinc-900 !border-zinc-700 !shadow-md"
                showInteractive={false}
              />

            </ReactFlow>
          )}
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <BranchContextMenu
          version={contextMenu.version}
          x={contextMenu.x}
          y={contextMenu.y}
          isActive={contextMenu.version.id === activeVersionId}
          canCurate={canCurate}
          onClose={() => setContextMenu(null)}
          onLoad={handleLoad}
          onNewBranch={handleNewBranch}
          onMerge={handleMerge}
          onPublish={handlePublish}
          onDelete={handleDelete}
        />
      )}

      {/* New branch dialog */}
      {branchSourceVersion && (
        <NewBranchDialog
          sourceVersion={branchSourceVersion}
          existingBranchNames={[...new Set(versions.map((v) => v.branch_name))]}
          onConfirm={handleConfirmBranch}
          onCancel={() => setBranchSourceVersion(null)}
        />
      )}

      {/* Merge dialog */}
      {mergeSourceVersion && (
        <MergeDialog
          sourceVersion={mergeSourceVersion}
          onConfirm={handleConfirmMerge}
          onCancel={() => setMergeSourceVersion(null)}
        />
      )}

      {/* Save version dialog */}
      {showSaveDialog && (
        <SaveVersionDialog
          onSave={() => { setShowSaveDialog(false); fetchVersions(); }}
          onCancel={() => setShowSaveDialog(false)}
          branchName={versions.find((v) => v.id === activeVersionId)?.branch_name ?? 'main'}
        />
      )}
    </>
  );
};

export default VersionPanelContent;
