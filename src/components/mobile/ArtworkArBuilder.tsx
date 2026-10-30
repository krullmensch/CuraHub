import { useCallback, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import type * as THREE from 'three';
import { createRendererFactory } from '@/lib/rendererBackend';
import { Scene } from '@/components/Scene';
import { ExportPart } from '@/components/arExport/ExportPart';
import { useSettledExport } from '@/components/arExport/useSettledExport';
import { ExportModeContext, ExportSession, type ExportModeValue } from '@/lib/arExport/exportMode';
import { prepareExportScene } from '@/lib/arExport/prepareScene';
import { exportGlb } from '@/lib/arExport/exportScene';
import type { ArtworkInstanceData } from '@/store/editorStore';

const MAX_TEXTURE = 2048;
/** A single picture loads in seconds; give up well before the visitor does. */
const DEADLINE_MS = 30_000;

interface BuilderProps {
  instance: ArtworkInstanceData;
  onDone: (glb: Blob) => void;
  onError: (err: unknown) => void;
}

const Runner = ({ session, onDone, onError }: { session: ExportSession; onDone: (glb: Blob) => void; onError: (err: unknown) => void }) => {
  const run = useCallback(async (_deadline: boolean, skipped: Set<number>, scene: THREE.Scene) => {
    if (skipped.size > 0) throw new Error('Bild konnte nicht geladen werden');
    onDone(await exportGlb(prepareExportScene(scene, { maxTexture: MAX_TEXTURE })));
  }, [onDone]);
  useSettledExport(session, run, onError, { requireRoom: false, deadlineMs: DEADLINE_MS });
  return null;
};

/**
 * Builds the GLB of one artwork (picture, passepartout, frame) in a hidden canvas with the same
 * components as the editor, in the AR export mode, without the room. Renders its own instance —
 * never the editor's list, so nothing reaches auto-sync.
 */
export function ArtworkArBuilder({ instance, onDone, onError }: BuilderProps) {
  const session = useMemo(() => new ExportSession(), []);
  const exportMode = useMemo<ExportModeValue>(() => ({ active: true, maxTexture: MAX_TEXTURE, session }), [session]);
  const glConfig = useMemo(() => createRendererFactory({ backend: 'webgl' }, { antialias: false, toneMappingExposure: 1.1 }), []);
  const instances = useMemo(() => [instance], [instance]);

  useEffect(() => {
    session.setFatalHandler(onError);
    return () => session.setFatalHandler(null);
  }, [session, onError]);

  return (
    <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 64, height: 64, overflow: 'hidden', pointerEvents: 'none' }}>
      <Canvas dpr={1} frameloop="demand" style={{ width: 64, height: 64 }} gl={glConfig}>
        <ExportModeContext.Provider value={exportMode}>
          <ExportPart part="artwork">
            <Scene isEditor={false} roomless viewerInstances={instances} viewerWalls={[]} viewerScaleFigures={[]} />
          </ExportPart>
          <Runner session={session} onDone={onDone} onError={onError} />
        </ExportModeContext.Provider>
      </Canvas>
    </div>
  );
}
