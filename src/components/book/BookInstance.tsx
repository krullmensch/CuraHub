import { forwardRef, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { BoxHitProxy } from '@/lib/boxHitProxy';
import { bookHitBox, bookSizeOf, pedestalSize, PEDESTAL_HEIGHT } from '@/lib/book/geometry';
import { consumeMarqueeClick } from '@/lib/selectionBridge';
import { BookMesh } from './BookMesh';

interface BookInstanceProps {
  instance: ArtworkInstanceData;
  selected: boolean;
  isEditor?: boolean;
}

const PEDESTAL_COLOR = '#f2f2f0';

/** One instance = pedestal + book + label plate; only this outer group is ever transformed. */
export const BookInstance = forwardRef<THREE.Group, BookInstanceProps>(({ instance, selected, isEditor = true }, ref) => {
  const pickInstance = useEditorStore((s) => s.pickInstance);
  const setHoveredBook = useBookViewerStore((s) => s.setHoveredBook);
  const size = bookSizeOf(instance);
  const pedestal = pedestalSize(size);
  const hitProxy = useMemo(() => {
    const proxy = new BoxHitProxy();
    proxy.userData.bookHitProxy = true;
    return proxy;
  }, []);
  useEffect(() => {
    const hit = bookHitBox({ width: size.width, length: size.length, thickness: size.thickness });
    hitProxy.box.min.set(...hit.min);
    hitProxy.box.max.set(...hit.max);
  }, [hitProxy, size.width, size.length, size.thickness]);

  // Clear hover when the book disappears while hovered (deleted, version switch).
  useEffect(() => () => {
    if (useBookViewerStore.getState().hoveredBookId === instance.id) {
      useBookViewerStore.getState().setHoveredBook(null);
      document.body.style.cursor = '';
    }
  }, [instance.id]);

  const asset = instance.artwork.asset;

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (!isEditor) return;
    e.stopPropagation();
    if (consumeMarqueeClick()) return;
    pickInstance(instance.id, e.nativeEvent.shiftKey);
  };

  return (
    <group
      ref={ref}
      position={[instance.position_x, instance.position_y, instance.position_z]}
      rotation={[0, instance.rotation_y, 0]}
      onClick={handleClick}
      // R3F passes events through to objects behind: without this a double-click on a book in front of
      // a modular wall also reaches the wall's handler and opens the 2D wall editor. EditorPage's
      // native dblclick listener opens the book.
      onDoubleClick={(e: ThreeEvent<MouseEvent>) => e.stopPropagation()}
    >
      <mesh position={[0, pedestal.height / 2, 0]}>
        <boxGeometry args={[pedestal.width, pedestal.height, pedestal.depth]} />
        <meshStandardMaterial color={PEDESTAL_COLOR} roughness={0.85} />
      </mesh>
      <group position={[0, PEDESTAL_HEIGHT, 0]}>
        <BookMesh
          instanceId={instance.id}
          size={size}
          coverPath={asset.path}
          thumbnailPath={asset.thumbnailPath ?? null}
          pixelWidth={asset.width}
          pixelHeight={asset.height}
          selected={selected}
        />
        <primitive
          object={hitProxy}
          onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setHoveredBook(instance.id); document.body.style.cursor = 'pointer'; }}
          onPointerOut={() => { setHoveredBook(null); document.body.style.cursor = ''; }}
        />
      </group>
    </group>
  );
});
BookInstance.displayName = 'BookInstance';
