import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, instanceRefMap, type ArtworkInstanceData } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { collectOccluders, pickArtworkAt } from '@/lib/artworkPick';
import { bookInReach, openBookForInstance } from '@/lib/book/viewerActions';
import { TapTracker } from '@/lib/touch/tapTracker';
import { isTouchWalking } from '@/lib/touch/walking';
import { isControlsLocked } from '@/lib/controlsLock';

/**
 * Touch viewer: a tap on the canvas picks the artwork under the finger. A readable book within reach
 * opens at once; any other artwork shows its info; empty space closes the info.
 */
export function TouchTapHandler({ instances }: { instances: ArtworkInstanceData[] }) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const scene = useThree((state) => state.scene);
  const instancesRef = useRef(instances);
  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);

  useEffect(() => {
    const el = gl.domElement;
    const tracker = new TapTracker();
    const raycaster = new THREE.Raycaster();

    const onDown = (e: PointerEvent) => tracker.down(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
    const onCancel = (e: PointerEvent) => tracker.cancel(e.pointerId);
    const onUp = (e: PointerEvent) => {
      const tap = tracker.up(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp });
      if (!tap || !isTouchWalking() || isControlsLocked()) return;
      const rect = el.getBoundingClientRect();
      const ndc = {
        x: ((tap.x - rect.left) / rect.width) * 2 - 1,
        y: -((tap.y - rect.top) / rect.height) * 2 + 1,
      };
      const pick = pickArtworkAt(ndc, camera, Array.from(instanceRefMap.values()), collectOccluders(scene), raycaster);
      const store = useEditorStore.getState();
      if (!pick) {
        store.setFpvHoveredInfo(null);
        return;
      }
      const info = pick.info as NonNullable<typeof store.fpvHoveredInfo> & { publicReadable?: boolean };
      const readable = info.publicReadable === true;
      if (info.assetType === 'book' && bookInReach(pick.hit, readable)) {
        const inst = instancesRef.current.find((i) => i.id === pick.instanceId);
        if (inst) {
          store.setFpvHoveredInfo(null);
          openBookForInstance(inst, true);
          return;
        }
      }
      useBookViewerStore.getState().setBookInReach(null);
      store.setFpvHoveredInfo(info);
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onCancel);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onCancel);
      useEditorStore.getState().setFpvHoveredInfo(null);
    };
  }, [gl, camera, scene]);

  return null;
}
