import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { useEditorStore } from '@/store/editorStore';
import { useLiveStore } from '@/store/liveStore';
import { boxShape, outlineShape, projectShape, type OutlineShape } from '@/lib/selectionOutlineShape';
import { objectForKey } from '@/lib/live/sceneObjects';
import { outlineGroups, pathBounds } from '@/lib/live/remoteOutlines';

/**
 * What other people have selected (their claims), outlined in their colour with their name —
 * like the own selection outline (SelectionOutline), one SVG path per person. The tracker sits
 * in the Canvas and rewrites the overlay's elements every frame without React renders.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';
let svgElement: SVGSVGElement | null = null;

interface PersonElements { path: SVGPathElement; label: SVGTextElement }
const elements = new Map<string, PersonElements>();

function elementsFor(session: string, color: string, name: string): PersonElements | null {
    if (!svgElement) return null;
    let el = elements.get(session);
    if (!el) {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linejoin', 'round');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-dasharray', '6 4');
        const label = document.createElementNS(SVG_NS, 'text');
        label.setAttribute('font-size', '11');
        label.setAttribute('font-weight', '600');
        label.setAttribute('font-family', '"Albert Sans", system-ui, sans-serif');
        label.setAttribute('stroke', '#09090b');
        label.setAttribute('stroke-width', '3');
        label.setAttribute('paint-order', 'stroke');
        svgElement.append(path, label);
        el = { path, label };
        elements.set(session, el);
    }
    if (el.path.getAttribute('stroke') !== color) {
        el.path.setAttribute('stroke', color);
        el.label.setAttribute('fill', color);
    }
    if (el.label.textContent !== name) el.label.textContent = name;
    return el;
}

function clearElements(keep: Set<string> = new Set()) {
    for (const [session, el] of elements) {
        if (keep.has(session)) continue;
        el.path.remove();
        el.label.remove();
        elements.delete(session);
    }
}

export const RemoteSelectionSvg = () => (
    <svg
        ref={(el) => {
            svgElement = el;
            if (!el) clearElements();
        }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5 }}
    />
);

export const RemoteSelectionTracker = () => {
    const active = useEditorStore((s) => s.plannerViewMode !== 'firstPerson' && !s.wallEditor);
    // Shape per key, rebuilt when the object or its data changes (models load late: retried).
    const shapes = useRef(new Map<string, { object: THREE.Object3D; data: unknown; shape: OutlineShape | null }>());
    useEffect(() => () => clearElements(), []);
    // The editor renders on demand: a new or released claim needs a frame.
    const invalidate = useThree((s) => s.invalidate);
    useEffect(() => useLiveStore.subscribe((s, prev) => {
        if (s.claims !== prev.claims) invalidate();
    }), [invalidate]);

    useFrame(({ camera, size }) => {
        const live = useLiveStore.getState();
        const groups = active ? outlineGroups(live.claims, live.self?.session ?? null) : [];
        const editor = useEditorStore.getState();
        const seen = new Set<string>();
        for (const group of groups) {
            let d = '';
            for (const key of group.keys) {
                const object = objectForKey(key);
                if (!object) continue;
                const data = key.startsWith('instance:') ? editor.localInstances.find((i) => `instance:${i.id}` === key) : undefined;
                let entry = shapes.current.get(key);
                if (!entry || entry.object !== object || entry.data !== data) {
                    entry = { object, data, shape: null };
                    shapes.current.set(key, entry);
                }
                if (!entry.shape) entry.shape = data ? outlineShape(data as Parameters<typeof outlineShape>[0], object) : boxShape(object);
                if (entry.shape) d += projectShape(entry.shape, object, camera, size);
            }
            const el = elementsFor(group.session, group.color, group.name);
            if (!el) continue;
            seen.add(group.session);
            if (el.path.getAttribute('d') !== d) el.path.setAttribute('d', d);
            const bounds = pathBounds(d);
            el.label.style.display = bounds ? '' : 'none';
            if (bounds) {
                el.label.setAttribute('x', bounds.minX.toFixed(1));
                el.label.setAttribute('y', Math.max(12, bounds.minY - 6).toFixed(1));
            }
        }
        clearElements(seen);
        for (const key of [...shapes.current.keys()]) {
            if (!groups.some((g) => g.keys.includes(key))) shapes.current.delete(key);
        }
    });

    return null;
};
