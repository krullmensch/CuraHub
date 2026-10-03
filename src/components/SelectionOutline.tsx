import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { instanceRefMap, useEditorStore, type ArtworkInstanceData } from '@/store/editorStore';
import { outlineShape, projectShape, type OutlineShape } from '@/lib/selectionOutlineShape';
import { useBookViewerStore } from '@/store/bookViewerStore';
import { WE_COLORS } from './wall-editor/theme';

/**
 * Outline of the selected artworks: their corners (in the artwork group's local space) are projected
 * every frame and written into one SVG path over the canvas. SVG instead of 3D lines gives a real
 * pixel width and works the same on WebGPU and WebGL (drei's Line uses a ShaderMaterial).
 */

let pathElement: SVGPathElement | null = null;

const setPath = (d: string) => {
    if (pathElement && pathElement.getAttribute('d') !== d) pathElement.setAttribute('d', d);
};

// Thinner, fainter outline of the artwork under the cursor (books).
let hoverPathElement: SVGPathElement | null = null;

const setHoverPath = (d: string) => {
    if (hoverPathElement && hoverPathElement.getAttribute('d') !== d) hoverPathElement.setAttribute('d', d);
};

export const SelectionOutlineSvg = () => (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}>
        <path
            ref={(el) => { hoverPathElement = el; }}
            fill="none"
            stroke={WE_COLORS.select}
            strokeOpacity={0.55}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
        />
        <path
            ref={(el) => { pathElement = el; }}
            fill="none"
            stroke={WE_COLORS.select}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
        />
    </svg>
);

export const SelectionOutlineTracker = () => {
    const instances = useEditorStore(useShallow((s) =>
        s.localInstances.filter((i) => s.selectedInstanceIds.includes(i.id))));
    const active = useEditorStore((s) => s.plannerViewMode !== 'firstPerson' && !s.wallEditor);
    // Outline per selected artwork, rebuilt when its data changes (scale, frame, …).
    const shapes = useRef(new Map<number, { instance: ArtworkInstanceData; shape: OutlineShape | null }>());

    useEffect(() => {
        const next = new Map<number, { instance: ArtworkInstanceData; shape: OutlineShape | null }>();
        for (const instance of instances) {
            const known = shapes.current.get(instance.id);
            next.set(instance.id, known && known.instance === instance ? known : { instance, shape: null });
        }
        shapes.current = next;
        if (!active || instances.length === 0) setPath('');
    }, [instances, active]);
    useEffect(() => () => setPath(''), []);

    const hoveredBookId = useBookViewerStore((s) => s.hoveredBookId);
    // Outline of the hovered book; rebuilt when the hovered id changes, retried until it has bounds.
    const hoverShape = useRef<{ id: number; shape: OutlineShape | null } | null>(null);
    useEffect(() => {
        hoverShape.current = hoveredBookId === null ? null : { id: hoveredBookId, shape: null };
        if (hoveredBookId === null) setHoverPath('');
    }, [hoveredBookId]);
    useEffect(() => () => setHoverPath(''), []);

    useFrame(({ camera, size }) => {
        if (!active) {
            setHoverPath('');
            return;
        }
        const hover = hoverShape.current;
        let hoverD = '';
        if (hover && !useEditorStore.getState().selectedInstanceIds.includes(hover.id)) {
            const group = instanceRefMap.get(hover.id);
            const instance = group ? useEditorStore.getState().localInstances.find((i) => i.id === hover.id) : undefined;
            if (group && instance) {
                if (!hover.shape) hover.shape = outlineShape(instance, group);
                if (hover.shape) hoverD = projectShape(hover.shape, group, camera, size);
            }
        }
        setHoverPath(hoverD);

        if (shapes.current.size === 0) return;
        let d = '';
        for (const entry of shapes.current.values()) {
            const group = instanceRefMap.get(entry.instance.id);
            if (!group) continue;
            // Models and splats load asynchronously: retry until they have bounds.
            if (!entry.shape) entry.shape = outlineShape(entry.instance, group);
            if (entry.shape) d += projectShape(entry.shape, group, camera, size);
        }
        setPath(d);
    });

    return null;
};
