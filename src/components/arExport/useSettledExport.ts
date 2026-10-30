import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { isExportSettled, type ExportSession } from '@/lib/arExport/exportMode';
import { frameTexturesPending } from '@/lib/frameMaterials';
import { instanceRefMap } from '@/store/editorStore';

/** How often the scene is checked for having loaded. */
const POLL_MS = 250;
/** Everything must stay loaded this long (frame textures and instance matrices arrive a few frames late). */
const QUIET_MS = 1000;
/** Export what is there after this long; works still loading are skipped (the server job gives up at 5 min). */
const DEADLINE_MS = 180_000;

export interface SettledExportOptions {
  /** Server export: without the room there is nothing worth exporting. The single-artwork AR has no room. */
  requireRoom: boolean;
  quietMs?: number;
  deadlineMs?: number;
}

/**
 * Inside an export-mode Canvas: polls until the scene has settled (or the deadline passed), hides
 * the works that failed, waits a few frames for frame instances to collapse and calls `run` once.
 * Shared by the server's export page and the mobile planner's AR builder.
 */
export function useSettledExport(
  session: ExportSession,
  run: (deadline: boolean, skipped: Set<number>, scene: THREE.Scene) => Promise<void>,
  onFatal: (err: unknown) => void,
  opts: SettledExportOptions,
): void {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const frameWaiters = useRef<Array<() => void>>([]);
  const { requireRoom, quietMs = QUIET_MS, deadlineMs = DEADLINE_MS } = opts;
  // Latest callbacks without restarting the poll: a new callback identity (a parent re-render)
  // must not reset the quiet/deadline timers or start a second export.
  const runRef = useRef(run);
  const fatalRef = useRef(onFatal);
  useEffect(() => {
    runRef.current = run;
    fatalRef.current = onFatal;
  });

  // Frames are only needed for useFrame work (texture manager, frame instances); drawing them
  // would upload every texture to the GPU for nothing.
  useEffect(() => {
    camera.layers.disableAll();
  }, [camera]);

  useFrame(() => {
    const waiting = frameWaiters.current;
    frameWaiters.current = [];
    for (const resolve of waiting) resolve();
  });

  useEffect(() => {
    let started = false;
    let settledSince: number | null = null;
    const startedAt = performance.now();

    const nextFrames = (count: number) => new Promise<void>((resolve) => {
      let left = count;
      const step = () => {
        left--;
        if (left <= 0) {
          resolve();
          return;
        }
        frameWaiters.current.push(step);
        invalidate();
      };
      frameWaiters.current.push(step);
      invalidate();
    });

    const exportNow = async (deadline: boolean) => {
      const skipped = new Set([...session.failedInstanceIds(), ...session.textureFailures()]);
      if (deadline) {
        for (const id of session.unsettledInstanceIds()) skipped.add(id);
        for (const id of session.texturePending()) skipped.add(id);
      }
      // Works without a picture are left out, not exported as empty boards.
      for (const id of skipped) {
        const group = instanceRefMap.get(id);
        if (group) group.visible = false;
      }
      // Frame instances of hidden works collapse on the next frames.
      await nextFrames(3);
      await runRef.current(deadline, skipped, scene);
    };

    const start = (deadline: boolean) => {
      started = true;
      exportNow(deadline).catch((err) => fatalRef.current(err));
    };

    const timer = setInterval(() => {
      if (started) return;
      // Already reported (onFatal); exporting a room without its room or walls helps nobody.
      if (session.hadFatal) {
        started = true;
        return;
      }
      invalidate();
      const now = performance.now();
      const settled = session.partsSettled && isExportSettled(session.textureProgress(), frameTexturesPending());
      if (settled) {
        settledSince ??= now;
        if (now - settledSince >= quietMs) start(false);
      } else {
        settledSince = null;
      }
      if (!started && now - startedAt >= deadlineMs) {
        if (requireRoom && !session.isReady('room')) {
          started = true;
          fatalRef.current(new Error('Raum nicht geladen'));
        } else {
          start(true);
        }
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [session, scene, invalidate, requireRoom, quietMs, deadlineMs]);
}
