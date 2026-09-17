import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { gooeyToast } from 'goey-toast';
import { useEditorStore, instanceRefMap } from '@/store/editorStore';
import {
    makeViewTransform,
    RULER_SIZE,
    useWallEditorView,
    type WallEditorTool,
} from '@/store/wallEditorViewStore';
import { wallToWorld } from '@/lib/wallEditor/geometry';
import { wallEditorBridge } from '@/lib/wallEditor/bridge';
import {
    centerX,
    centerY,
    clampOffsetToBounds,
    containsPoint,
    distancesBetween,
    gapsAlong,
    neighbourDistances,
    orderAlong,
    rectsIntersect,
    right,
    rowGaps,
    snapPoint,
    snapRect,
    spacingOffsets,
    top,
    translate,
    unionRect,
    type Axis,
    type LayoutItem,
    type Measurement,
    type Offset,
    type Rect,
    type SnapResult,
} from '@/lib/wallEditor/layout';
import { formatCm, roundMm } from '@/lib/wallEditor/format';
import { fitWallEditorView } from '@/lib/wallEditor/view';
import { commitWallOffsets, removeInstances, type WallArtwork, type WallFace } from '@/lib/wallEditor/wallArtworks';
import { FloorChain, MeasureLine, Pill } from './OverlayPrimitives';
import { textWidth } from './textMetrics';
import { WallEditorRulers } from './WallEditorRulers';
import { GUIDE_HIT_PX, SNAP_PX, WE_COLORS, WE_FONT } from './theme';

type Draft = Map<number, Offset>;

type Interaction =
    | {
        kind: 'move';
        pointerId: number;
        startX: number;
        startY: number;
        ids: number[];
        bbox: Rect;
        moved: boolean;
        /** Plain click on an item of a multi-selection selects only that item. */
        selectOnClick: number | null;
        offsets: Draft;
        snap: SnapResult | null;
    }
    | { kind: 'marquee'; pointerId: number; startU: number; startV: number; u: number; v: number; base: number[] }
    | { kind: 'pan'; pointerId: number; lastX: number; lastY: number }
    | { kind: 'measure'; pointerId: number; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'guide'; pointerId: number; id: number; axis: Axis; overRuler: boolean }
    | {
        kind: 'spacing';
        pointerId: number;
        axis: Axis;
        startX: number;
        startY: number;
        order: LayoutItem[];
        startGap: number;
        gap: number;
        offsets: Draft;
    };

const ZERO: Offset = { dx: 0, dy: 0 };
const NUDGE_M = 0.01;
const NUDGE_BIG_M = 0.1;
const NUDGE_FINE_M = 0.001;

const isTypingTarget = (target: EventTarget | null) =>
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
    || (target instanceof HTMLElement && target.isContentEditable);

/** Layout direction of a multi-selection for Figma-style spacing handles. */
function spacingAxis(items: LayoutItem[]): Axis | null {
    if (items.length < 2) return null;
    if (gapsAlong(items, 'x').every((g) => g > -1e-6)) return 'x';
    if (gapsAlong(items, 'y').every((g) => g > -1e-6)) return 'y';
    return null;
}

/** Moves the artworks' Three.js groups to their draft positions (no store update). */
function applyDraft(face: WallFace, ids: Iterable<number>, offsets: Draft) {
    const byId = new Map(face.items.map((item) => [item.id, item]));
    for (const id of ids) {
        const item = byId.get(id);
        const group = instanceRefMap.get(id);
        if (!item || !group) continue;
        const o = offsets.get(id) ?? ZERO;
        wallToWorld(face.frame, item.anchor.u + o.dx, item.anchor.v + o.dy, item.anchor.d, group.position);
    }
    wallEditorBridge.invalidate();
}

interface WallEditorOverlayProps {
    face: WallFace;
}

/**
 * Interaction layer of the 2D wall editor: an SVG over the canvas that shows selection, guides,
 * rulers and measurements and handles all pointer and keyboard input. The artworks themselves are
 * rendered by the 3D scene through the orthographic WallEditorCamera, which uses the same
 * wall ↔ screen mapping (useWallEditorView).
 */
export const WallEditorOverlay = ({ face }: WallEditorOverlayProps) => {
    const rootRef = useRef<HTMLDivElement>(null);
    const view = useWallEditorView(useShallow((s) => ({
        centerU: s.centerU,
        centerV: s.centerV,
        pxPerM: s.pxPerM,
        viewportW: s.viewportW,
        viewportH: s.viewportH,
        tool: s.tool,
        snapping: s.snapping,
        showRulers: s.showRulers,
        showFloorDistances: s.showFloorDistances,
        showGaps: s.showGaps,
        showHangingLine: s.showHangingLine,
        hangingHeight: s.hangingHeight,
        measurements: s.measurements,
        guides: s.guides,
    })));
    const selection = useEditorStore((s) => s.wallEditorSelection);
    const setSelection = useEditorStore((s) => s.setWallEditorSelection);

    const [interaction, setInteraction] = useState<Interaction | null>(null);
    const interactionRef = useRef<Interaction | null>(null);
    const [hoverId, setHoverId] = useState<number | null>(null);
    const [hoverGuide, setHoverGuide] = useState<number | null>(null);
    const [pointer, setPointer] = useState<{ u: number; v: number } | null>(null);
    const [altDown, setAltDown] = useState(false);
    const [spaceDown, setSpaceDown] = useState(false);
    // The vertical ruler sits right of the floating asset sidebar (if open).
    const [rulerLeft, setRulerLeft] = useState(0);

    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        const measure = () => {
            const box = root.getBoundingClientRect();
            let left = 0;
            document.querySelectorAll<HTMLElement>('[data-wall-editor-inset="left"]').forEach((el) => {
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.right > box.left + 4) left = Math.max(left, r.right - box.left + 8);
            });
            setRulerLeft(Math.round(left));
        };
        measure();
        // Panels slide with a CSS transition — measure again once it has finished.
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new MutationObserver(() => {
            measure();
            clearTimeout(timer);
            timer = setTimeout(measure, 350);
        });
        const panels = Array.from(document.querySelectorAll('[data-wall-editor-inset]'));
        panels.forEach((el) => {
            observer.observe(el, { attributes: true, attributeFilter: ['class'] });
            el.addEventListener('transitionend', measure);
        });
        window.addEventListener('resize', measure);
        return () => {
            observer.disconnect();
            clearTimeout(timer);
            panels.forEach((el) => el.removeEventListener('transitionend', measure));
            window.removeEventListener('resize', measure);
        };
    }, []);

    const vt = useMemo(
        () => makeViewTransform(view),
        [view.centerU, view.centerV, view.pxPerM, view.viewportW, view.viewportH], // eslint-disable-line react-hooks/exhaustive-deps
    );
    const { items, wallRect } = face;
    const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
    const selectedIds = useMemo(() => selection.filter((id) => itemsById.has(id)), [selection, itemsById]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

    const setInter = useCallback((next: Interaction | null) => {
        interactionRef.current = next;
        setInteraction(next);
    }, []);

    // Selections of other faces/walls, or of removed artworks, don't survive.
    useEffect(() => {
        if (selectedIds.length !== selection.length) setSelection(selectedIds);
    }, [selectedIds, selection, setSelection]);

    const draft: Draft | null = interaction?.kind === 'move' || interaction?.kind === 'spacing' ? interaction.offsets : null;
    const rectOf = useCallback((item: WallArtwork): Rect => {
        const o = draft?.get(item.id);
        return o ? translate(item.rect, o.dx, o.dy) : item.rect;
    }, [draft]);

    const guidesX = view.guides.filter((g) => g.axis === 'x').map((g) => g.value);
    const guidesY = view.guides.filter((g) => g.axis === 'y').map((g) => g.value);
    const hangY = wallRect.y + view.hangingHeight;
    if (view.showHangingLine) guidesY.push(hangY);

    const toLocal = (e: { clientX: number; clientY: number }) => {
        const r = rootRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const hitItem = (u: number, v: number): WallArtwork | null => {
        for (let i = items.length - 1; i >= 0; i--) {
            if (containsPoint(items[i].rect, u, v)) return items[i];
        }
        return null;
    };

    const hitGuide = (x: number, y: number) => view.guides.find((g) => (
        g.axis === 'x'
            ? Math.abs(vt.toScreenX(g.value) - x) <= GUIDE_HIT_PX && y > RULER_SIZE
            : Math.abs(vt.toScreenY(g.value) - y) <= GUIDE_HIT_PX && x > rulerLeft + RULER_SIZE
    )) ?? null;
    const isOverRuler = (axis: Axis, x: number, y: number) => (axis === 'x'
        ? y < RULER_SIZE
        : x > rulerLeft - 8 && x < rulerLeft + RULER_SIZE);

    const snapGuideValue = (axis: Axis, value: number) => {
        if (!view.snapping) return roundMm(value);
        const threshold = SNAP_PX / vt.pxPerM;
        const candidates = axis === 'x'
            ? [wallRect.x, centerX(wallRect), right(wallRect), ...items.flatMap((i) => [i.rect.x, centerX(i.rect), right(i.rect)])]
            : [wallRect.y, top(wallRect), ...items.flatMap((i) => [i.rect.y, centerY(i.rect), top(i.rect)])];
        let best: number | null = null;
        for (const c of candidates) {
            if (Math.abs(c - value) <= threshold && (best === null || Math.abs(c - value) < Math.abs(best - value))) best = c;
        }
        return best ?? roundMm(value);
    };

    const cancelInteraction = useCallback((it: Interaction) => {
        if (it.kind === 'move') applyDraft(face, it.ids, new Map());
        if (it.kind === 'spacing') applyDraft(face, it.order.map((o) => o.id), new Map());
        setInter(null);
    }, [face, setInter]);

    // ── Pointer input ───────────────────────────────────────────────────────

    const effectiveTool: WallEditorTool = spaceDown ? 'hand' : view.tool;

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (interactionRef.current) return;
        const { x, y } = toLocal(e);
        const u = vt.toWallU(x);
        const v = vt.toWallV(y);
        rootRef.current?.setPointerCapture(e.pointerId);

        if (e.button === 1 || e.button === 2 || effectiveTool === 'hand') {
            e.preventDefault();
            setInter({ kind: 'pan', pointerId: e.pointerId, lastX: x, lastY: y });
            return;
        }
        if (e.button !== 0) return;

        if (effectiveTool === 'measure') {
            const p = view.snapping
                ? snapPoint(u, v, items.map((i) => i.rect), wallRect, SNAP_PX / vt.pxPerM)
                : { x: u, y: v };
            setInter({ kind: 'measure', pointerId: e.pointerId, x1: p.x, y1: p.y, x2: p.x, y2: p.y });
            return;
        }

        const hit = hitItem(u, v);
        if (hit) {
            let ids: number[];
            let selectOnClick: number | null = null;
            if (e.shiftKey) {
                if (selectedSet.has(hit.id)) {
                    setSelection(selectedIds.filter((id) => id !== hit.id));
                    return;
                }
                ids = [...selectedIds, hit.id];
                setSelection(ids);
            } else if (selectedSet.has(hit.id)) {
                ids = selectedIds;
                selectOnClick = selectedIds.length > 1 ? hit.id : null;
            } else {
                ids = [hit.id];
                setSelection(ids);
            }
            const bbox = unionRect(ids.map((id) => itemsById.get(id)!.rect))!;
            setInter({
                kind: 'move', pointerId: e.pointerId, startX: x, startY: y, ids, bbox,
                moved: false, selectOnClick, offsets: new Map(), snap: null,
            });
            return;
        }

        const guide = hitGuide(x, y);
        if (guide) {
            setInter({ kind: 'guide', pointerId: e.pointerId, id: guide.id, axis: guide.axis, overRuler: false });
            return;
        }

        const base = e.shiftKey ? selectedIds : [];
        if (!e.shiftKey && selectedIds.length > 0) setSelection([]);
        setInter({ kind: 'marquee', pointerId: e.pointerId, startU: u, startV: v, u, v, base });
    };

    const handleRulerPointerDown = (axis: Axis, e: React.PointerEvent) => {
        if (e.button !== 0 || interactionRef.current) return;
        e.stopPropagation();
        rootRef.current?.setPointerCapture(e.pointerId);
        const { x, y } = toLocal(e);
        const value = axis === 'x' ? vt.toWallU(x) : vt.toWallV(y);
        const id = useWallEditorView.getState().addGuide(axis, roundMm(value));
        setInter({ kind: 'guide', pointerId: e.pointerId, id, axis, overRuler: true });
    };

    const handleSpacingPointerDown = (axis: Axis, order: LayoutItem[], gapIndex: number, e: React.PointerEvent) => {
        if (e.button !== 0 || interactionRef.current) return;
        e.stopPropagation();
        rootRef.current?.setPointerCapture(e.pointerId);
        const { x, y } = toLocal(e);
        const gaps = gapsAlong(order, axis);
        setInter({
            kind: 'spacing', pointerId: e.pointerId, axis, startX: x, startY: y, order,
            startGap: gaps[gapIndex], gap: gaps[gapIndex], offsets: new Map(),
        });
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const { x, y } = toLocal(e);
        const u = vt.toWallU(x);
        const v = vt.toWallV(y);
        setPointer({ u, v });
        const it = interactionRef.current;

        if (!it) {
            const hit = effectiveTool === 'hand' ? null : hitItem(u, v);
            if ((hit?.id ?? null) !== hoverId) setHoverId(hit?.id ?? null);
            const guide = effectiveTool === 'select' && !hit ? hitGuide(x, y) : null;
            if ((guide?.id ?? null) !== hoverGuide) setHoverGuide(guide?.id ?? null);
            return;
        }
        if (e.pointerId !== it.pointerId) return;

        switch (it.kind) {
            case 'pan': {
                useWallEditorView.getState().panBy(x - it.lastX, y - it.lastY);
                setInter({ ...it, lastX: x, lastY: y });
                return;
            }
            case 'measure': {
                const p = view.snapping !== (e.metaKey || e.ctrlKey)
                    ? snapPoint(u, v, items.map((i) => i.rect), wallRect, SNAP_PX / vt.pxPerM)
                    : { x: u, y: v };
                let x2 = p.x;
                let y2 = p.y;
                if (e.shiftKey) {
                    if (Math.abs(x2 - it.x1) >= Math.abs(y2 - it.y1)) y2 = it.y1;
                    else x2 = it.x1;
                }
                setInter({ ...it, x2, y2 });
                return;
            }
            case 'marquee': {
                const marquee: Rect = {
                    x: Math.min(it.startU, u), y: Math.min(it.startV, v),
                    w: Math.abs(u - it.startU), h: Math.abs(v - it.startV),
                };
                const hits = items.filter((i) => rectsIntersect(i.rect, marquee)).map((i) => i.id);
                const next = Array.from(new Set([...it.base, ...hits]));
                const current = useEditorStore.getState().wallEditorSelection;
                if (next.length !== current.length || next.some((id, i) => id !== current[i])) setSelection(next);
                setInter({ ...it, u, v });
                return;
            }
            case 'guide': {
                const overRuler = isOverRuler(it.axis, x, y);
                const value = snapGuideValue(it.axis, it.axis === 'x' ? u : v);
                useWallEditorView.getState().moveGuide(it.id, value);
                if (overRuler !== it.overRuler) setInter({ ...it, overRuler });
                return;
            }
            case 'move': {
                if (!it.moved && Math.hypot(x - it.startX, y - it.startY) < 3) return;
                let dx = (x - it.startX) / vt.pxPerM;
                let dy = -(y - it.startY) / vt.pxPerM;
                const lockAxis: Axis | null = e.shiftKey ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : null;
                if (lockAxis === 'x') dy = 0;
                if (lockAxis === 'y') dx = 0;
                let snap: SnapResult | null = null;
                if (view.snapping !== (e.metaKey || e.ctrlKey)) {
                    const moving = new Set(it.ids);
                    snap = snapRect(translate(it.bbox, dx, dy), {
                        statics: items.filter((i) => !moving.has(i.id)).map((i) => i.rect),
                        wall: wallRect,
                        guidesX,
                        guidesY,
                    }, SNAP_PX / vt.pxPerM);
                    if (lockAxis) {
                        snap = {
                            dx: lockAxis === 'x' ? snap.dx : 0,
                            dy: lockAxis === 'y' ? snap.dy : 0,
                            lines: snap.lines.filter((l) => l.axis === lockAxis),
                            spacings: snap.spacings.filter((s) => s.axis === lockAxis),
                        };
                    }
                    dx += snap.dx;
                    dy += snap.dy;
                } else {
                    dx = roundMm(dx);
                    dy = roundMm(dy);
                }
                const clamped = clampOffsetToBounds(it.bbox, dx, dy, wallRect);
                if (snap && (Math.abs(clamped.dx - dx) > 1e-9 || Math.abs(clamped.dy - dy) > 1e-9)) {
                    const keepX = Math.abs(clamped.dx - dx) <= 1e-9;
                    const keepY = Math.abs(clamped.dy - dy) <= 1e-9;
                    snap = {
                        ...snap,
                        lines: snap.lines.filter((l) => (l.axis === 'x' ? keepX : keepY)),
                        spacings: snap.spacings.filter((s) => (s.axis === 'x' ? keepX : keepY)),
                    };
                }
                const offsets: Draft = new Map(it.ids.map((id) => [id, clamped]));
                applyDraft(face, it.ids, offsets);
                setInter({ ...it, moved: true, offsets, snap });
                return;
            }
            case 'spacing': {
                const delta = it.axis === 'x' ? (x - it.startX) / vt.pxPerM : (y - it.startY) / vt.pxPerM;
                const gap = Math.max(0, roundMm(it.startGap + delta));
                const offsets = spacingOffsets(it.order, it.axis, gap);
                applyDraft(face, it.order.map((o) => o.id), offsets);
                setInter({ ...it, gap, offsets });
                return;
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        const it = interactionRef.current;
        if (!it || e.pointerId !== it.pointerId) return;
        if (rootRef.current?.hasPointerCapture(e.pointerId)) rootRef.current.releasePointerCapture(e.pointerId);
        switch (it.kind) {
            case 'move':
                if (it.moved) commitWallOffsets(face, it.offsets);
                else if (it.selectOnClick !== null) setSelection([it.selectOnClick]);
                break;
            case 'spacing':
                commitWallOffsets(face, it.offsets);
                break;
            case 'measure':
                if (Math.hypot(it.x2 - it.x1, it.y2 - it.y1) * vt.pxPerM > 3) {
                    useWallEditorView.getState().addMeasurement({ x1: it.x1, y1: it.y1, x2: it.x2, y2: it.y2 });
                }
                break;
            case 'guide':
                if (it.overRuler) useWallEditorView.getState().removeGuide(it.id);
                break;
            default:
                break;
        }
        setInter(null);
    };

    const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
        const it = interactionRef.current;
        if (it && e.pointerId === it.pointerId) cancelInteraction(it);
    };

    // ── Wheel: pan, Ctrl/⌘ or pinch = zoom (Figma) ─────────────────────────
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const r = el.getBoundingClientRect();
            let dx = e.deltaX;
            let dy = e.deltaY;
            if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
            const view = useWallEditorView.getState();
            if (e.ctrlKey || e.metaKey) {
                const clamped = Math.max(-60, Math.min(60, dy));
                view.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-clamped * 0.01));
            } else if (e.shiftKey && dx === 0) {
                view.panBy(-dy, 0);
            } else {
                view.panBy(-dx, -dy);
            }
        };
        // Safari pinch-zoom arrives as gesture events instead of Ctrl + wheel.
        type GestureLike = Event & { scale: number; clientX: number; clientY: number };
        let lastScale = 1;
        const onGestureStart = (e: Event) => {
            e.preventDefault();
            lastScale = (e as GestureLike).scale || 1;
        };
        const onGestureChange = (e: Event) => {
            e.preventDefault();
            const g = e as GestureLike;
            if (!g.scale) return;
            const r = el.getBoundingClientRect();
            useWallEditorView.getState().zoomAt(g.clientX - r.left, g.clientY - r.top, g.scale / lastScale);
            lastScale = g.scale;
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        el.addEventListener('gesturestart', onGestureStart);
        el.addEventListener('gesturechange', onGestureChange);
        return () => {
            el.removeEventListener('wheel', onWheel);
            el.removeEventListener('gesturestart', onGestureStart);
            el.removeEventListener('gesturechange', onGestureChange);
        };
    }, []);

    // ── Keyboard ───────────────────────────────────────────────────────────
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            const view = useWallEditorView.getState();
            const store = useEditorStore.getState();
            const cmd = e.metaKey || e.ctrlKey;
            const key = e.key;
            const lower = key.toLowerCase();
            const ids = store.wallEditorSelection.filter((id) => itemsById.has(id));

            if (key === 'Alt') { setAltDown(true); e.preventDefault(); return; }
            if (key === ' ') { setSpaceDown(true); e.preventDefault(); return; }

            if (key === 'Escape') {
                e.preventDefault();
                const it = interactionRef.current;
                if (it) { cancelInteraction(it); return; }
                if (view.tool !== 'select') { view.setTool('select'); return; }
                if (ids.length > 0) { store.setWallEditorSelection([]); return; }
                store.closeWallEditor();
                return;
            }
            if (cmd && lower === 'a') {
                e.preventDefault();
                store.setWallEditorSelection(items.map((i) => i.id));
                return;
            }
            if (cmd) return; // leave ⌘Z / ⌘⇧Z etc. to EditorPage

            if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); fitWallEditorView(wallRect); return; }
            if (e.shiftKey && e.code === 'Digit2') {
                e.preventDefault();
                const sel = unionRect(ids.map((id) => itemsById.get(id)!.rect));
                if (sel) fitWallEditorView(sel, 0.25);
                return;
            }
            if (lower === 'v') { view.setTool('select'); return; }
            if (lower === 'h') { view.setTool('hand'); return; }
            if (lower === 'm') { view.setTool('measure'); return; }
            if (key === '+' || key === '=') { view.zoomAt(view.viewportW / 2, view.viewportH / 2, 1.25); return; }
            if (key === '-' || key === '_') { view.zoomAt(view.viewportW / 2, view.viewportH / 2, 0.8); return; }

            if (key === 'Delete' || key === 'Backspace') {
                e.preventDefault();
                if (view.tool === 'measure' && view.measurements.length > 0) {
                    view.removeMeasurement(view.measurements[view.measurements.length - 1].id);
                    return;
                }
                if (ids.length > 0) {
                    removeInstances(ids);
                    gooeyToast.success(ids.length === 1 ? 'Werk entfernt' : `${ids.length} Werke entfernt`, {
                        description: 'Mit ⌘/Strg + Z rückgängig machen.',
                    });
                }
                return;
            }

            const arrows: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1],
            };
            if (arrows[key] && ids.length > 0 && !interactionRef.current) {
                e.preventDefault();
                const step = e.shiftKey ? NUDGE_BIG_M : e.altKey ? NUDGE_FINE_M : NUDGE_M;
                const bbox = unionRect(ids.map((id) => itemsById.get(id)!.rect))!;
                const offset = clampOffsetToBounds(bbox, arrows[key][0] * step, arrows[key][1] * step, wallRect);
                commitWallOffsets(face, new Map(ids.map((id) => [id, offset])));
            }
        };
        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Alt') setAltDown(false);
            if (e.key === ' ') setSpaceDown(false);
        };
        const onBlur = () => { setAltDown(false); setSpaceDown(false); };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', onBlur);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
        };
    }, [face, items, itemsById, wallRect, cancelInteraction]);

    // Leaving the editor mid-drag: put the artworks back.
    useEffect(() => () => {
        const it = interactionRef.current;
        if (it?.kind === 'move') applyDraft(face, it.ids, new Map());
        if (it?.kind === 'spacing') applyDraft(face, it.order.map((o) => o.id), new Map());
    }, [face]);

    // ── Derived drawing data ─────────────────────────────────────────────
    const W = view.viewportW;
    const H = view.viewportH;
    const sx = vt.toScreenX;
    const sy = vt.toScreenY;
    const screenRect = (r: Rect) => ({ x: sx(r.x), y: sy(top(r)), width: r.w * vt.pxPerM, height: r.h * vt.pxPerM });

    const selectionRects = selectedIds.map((id) => rectOf(itemsById.get(id)!));
    const selectionBox = unionRect(selectionRects);
    const hovered = hoverId !== null ? itemsById.get(hoverId) ?? null : null;
    const staticsForSelection = items.filter((i) => !selectedSet.has(i.id)).map((i) => rectOf(i));

    const warnings = useMemo(() => {
        const outside = new Set<number>();
        const overlapping = new Set<number>();
        const eps = 0.0005;
        for (const a of items) {
            const r = a.rect;
            if (r.x < wallRect.x - eps || right(r) > right(wallRect) + eps || r.y < wallRect.y - eps || top(r) > top(wallRect) + eps) outside.add(a.id);
            for (const b of items) {
                if (a.id >= b.id) continue;
                const shrink = (q: Rect): Rect => ({ x: q.x + eps, y: q.y + eps, w: q.w - 2 * eps, h: q.h - 2 * eps });
                if (rectsIntersect(shrink(r), shrink(b.rect))) { overlapping.add(a.id); overlapping.add(b.id); }
            }
        }
        return { outside, overlapping };
    }, [items, wallRect]);

    const annotations: ReactNode[] = [];
    const measureColor = WE_COLORS.measure;

    // Gaps between all artworks in a row
    if (view.showGaps && !draft) {
        rowGaps(items.map((i) => i.rect)).forEach((m, i) => {
            annotations.push(<MeasureLine key={`gap${i}`} m={m} vt={vt} color={WE_COLORS.spacing} />);
        });
    }
    // Centre heights of all artworks
    if (view.showFloorDistances) {
        for (const item of items) {
            if (selectedSet.has(item.id)) continue;
            const r = rectOf(item);
            annotations.push(
                <Pill key={`fh${item.id}`} x={sx(centerX(r))} y={sy(centerY(r))} text={`Mitte ${formatCm(centerY(r) - wallRect.y)}`} color="rgba(24,24,27,0.85)" />,
            );
        }
        if (selectionBox) annotations.push(<FloorChain key="fsel" rect={selectionBox} vt={vt} viewportW={W} floorY={wallRect.y} />);
    }

    let liveMeasurements: Measurement[] = [];
    if (interaction?.kind === 'move' && interaction.moved && selectionBox) {
        liveMeasurements = neighbourDistances(selectionBox, staticsForSelection, wallRect);
    } else if (!interaction && effectiveTool === 'select' && altDown && selectionBox) {
        liveMeasurements = hovered && !selectedSet.has(hovered.id)
            ? distancesBetween(selectionBox, hovered.rect)
            : neighbourDistances(selectionBox, staticsForSelection, wallRect);
    } else if (!interaction && effectiveTool === 'measure' && hovered) {
        if (selectionBox && !selectedSet.has(hovered.id)) {
            liveMeasurements = distancesBetween(selectionBox, hovered.rect);
        } else {
            // Horizontal distances above the centre so they don't cross the floor chain's labels.
            liveMeasurements = neighbourDistances(hovered.rect, items.filter((i) => i.id !== hovered.id).map((i) => i.rect), wallRect, { y: 0.78 })
                .filter((m) => m.kind !== 'floor');
            annotations.push(<FloorChain key="fhover" rect={hovered.rect} vt={vt} viewportW={W} floorY={wallRect.y} />);
        }
    }
    liveMeasurements.forEach((m, i) => annotations.push(<MeasureLine key={`live${i}`} m={m} vt={vt} color={measureColor} />));

    // Pinned and in-progress free measurements
    const freeMeasure = (m: { x1: number; y1: number; x2: number; y2: number }, key: string, onRemove?: () => void) => {
        const dxm = Math.abs(m.x2 - m.x1);
        const dym = Math.abs(m.y2 - m.y1);
        const len = Math.hypot(dxm, dym);
        const diagonal = dxm > 0.005 && dym > 0.005;
        const label = diagonal ? `${formatCm(len)}  ↔ ${formatCm(dxm, false)}  ↕ ${formatCm(dym, false)}` : formatCm(len);
        return (
            <MeasureLine
                key={key}
                m={{ ...m, value: len }}
                vt={vt}
                color={measureColor}
                label={label}
                dots
                onLabelPointerDown={onRemove ? (e) => { e.stopPropagation(); onRemove(); } : undefined}
                labelTitle={onRemove ? 'Klicken zum Entfernen' : undefined}
            />
        );
    };
    view.measurements.forEach((m) => annotations.push(freeMeasure(m, `pin${m.id}`, view.tool === 'measure'
        ? () => useWallEditorView.getState().removeMeasurement(m.id)
        : undefined)));
    if (interaction?.kind === 'measure') annotations.push(freeMeasure(interaction, 'measuring'));

    // Snap feedback
    const snapLines = interaction?.kind === 'move' ? interaction.snap : null;

    // Figma-style spacing handles for a multi-selection laid out in a row or column
    const selectionItems: LayoutItem[] = selectedIds.map((id) => ({ id, rect: rectOf(itemsById.get(id)!) }));
    const handleAxis = interaction?.kind === 'spacing' ? interaction.axis : spacingAxis(selectionItems);
    const spacingHandles: ReactNode[] = [];
    if (handleAxis && effectiveTool === 'select' && (!interaction || interaction.kind === 'spacing') && selectionItems.length >= 2) {
        const order = orderAlong(selectionItems, handleAxis);
        const baseOrder = interaction?.kind === 'spacing'
            ? interaction.order
            : orderAlong(selectedIds.map((id) => ({ id, rect: itemsById.get(id)!.rect })), handleAxis);
        for (let i = 1; i < order.length; i++) {
            const a = order[i - 1].rect;
            const b = order[i].rect;
            const gap = handleAxis === 'x' ? b.x - right(a) : a.y - top(b);
            let m: Measurement;
            if (handleAxis === 'x') {
                const lo = Math.max(a.y, b.y);
                const hi = Math.min(top(a), top(b));
                const yy = hi > lo ? (lo + hi) / 2 : (centerY(a) + centerY(b)) / 2;
                m = { x1: right(a), y1: yy, x2: b.x, y2: yy, value: gap };
            } else {
                const lo = Math.max(a.x, b.x);
                const hi = Math.min(right(a), right(b));
                const xx = hi > lo ? (lo + hi) / 2 : (centerX(a) + centerX(b)) / 2;
                m = { x1: xx, y1: top(b), x2: xx, y2: a.y, value: gap };
            }
            spacingHandles.push(
                <MeasureLine
                    key={`sp${i}`}
                    m={m}
                    vt={vt}
                    color={WE_COLORS.spacing}
                    onLabelPointerDown={(e) => handleSpacingPointerDown(handleAxis, baseOrder, i - 1, e)}
                    labelTitle={handleAxis === 'x' ? 'Ziehen: Abstände horizontal ändern' : 'Ziehen: Abstände vertikal ändern'}
                />,
            );
        }
    }

    let cursor = 'default';
    if (interaction?.kind === 'pan') cursor = 'grabbing';
    else if (interaction?.kind === 'spacing') cursor = interaction.axis === 'x' ? 'ew-resize' : 'ns-resize';
    else if (interaction?.kind === 'guide') cursor = interaction.axis === 'x' ? 'col-resize' : 'row-resize';
    else if (effectiveTool === 'hand') cursor = 'grab';
    else if (effectiveTool === 'measure') cursor = 'crosshair';
    else if (interaction?.kind === 'move') cursor = 'move';
    else if (hoverId !== null) cursor = 'move';
    else if (hoverGuide !== null) {
        const g = view.guides.find((gg) => gg.id === hoverGuide);
        cursor = g?.axis === 'x' ? 'col-resize' : 'row-resize';
    }

    const floorY = sy(wallRect.y);
    // Hanging height label left of the wall when there is room, otherwise just inside it.
    const hangingLabel = `Hängehöhe ${formatCm(view.hangingHeight)}`;
    const hangingLabelOutside = sx(wallRect.x) - (rulerLeft + RULER_SIZE) > textWidth(hangingLabel) + 30;
    const wallScreen = screenRect(wallRect);
    const marquee = interaction?.kind === 'marquee' ? {
        x: sx(Math.min(interaction.startU, interaction.u)),
        y: sy(Math.max(interaction.startV, interaction.v)),
        width: Math.abs(interaction.u - interaction.startU) * vt.pxPerM,
        height: Math.abs(interaction.v - interaction.startV) * vt.pxPerM,
    } : null;
    const draggedGuide = interaction?.kind === 'guide' ? view.guides.find((g) => g.id === interaction.id) : null;

    return (
        <div
            ref={rootRef}
            data-wall-editor-root=""
            className="absolute inset-0 z-[5] animate-in fade-in duration-200"
            style={{ cursor, touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onPointerLeave={() => { if (!interactionRef.current) { setPointer(null); setHoverId(null); } }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <svg width={W} height={H} className="absolute inset-0 select-none" style={{ overflow: 'hidden' }}>
                <defs>
                    <pattern id="we-floor-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                    </pattern>
                </defs>

                {/* Floor */}
                {floorY < H && <rect x={0} y={floorY} width={W} height={H - floorY} fill="url(#we-floor-hatch)" pointerEvents="none" />}
                <line x1={0} x2={W} y1={floorY} y2={floorY} stroke={WE_COLORS.floor} strokeWidth={1} pointerEvents="none" />

                {/* Wall outline + overall dimensions */}
                <rect {...wallScreen} fill="none" stroke={WE_COLORS.wallEdge} strokeWidth={1} pointerEvents="none" />
                <MeasureLine
                    m={{ x1: wallRect.x, y1: top(wallRect), x2: right(wallRect), y2: top(wallRect), value: wallRect.w }}
                    vt={{ ...vt, toScreenY: (v) => sy(v) - 14 }}
                    color="rgba(113,113,122,0.95)"
                />
                <MeasureLine
                    m={{ x1: right(wallRect), y1: wallRect.y, x2: right(wallRect), y2: top(wallRect), value: wallRect.h }}
                    vt={{ ...vt, toScreenX: (u) => sx(u) + 14 }}
                    color="rgba(113,113,122,0.95)"
                />

                {/* Hanging height */}
                {view.showHangingLine && (
                    <g pointerEvents="none">
                        <line
                            x1={sx(wallRect.x) - 12} x2={sx(right(wallRect)) + 12}
                            y1={sy(hangY)} y2={sy(hangY)}
                            stroke={WE_COLORS.hanging} strokeWidth={1} strokeDasharray="6 4" opacity={0.9}
                        />
                        {hangingLabelOutside ? (
                            <Pill
                                x={sx(wallRect.x) - 16}
                                y={sy(hangY)}
                                text={hangingLabel}
                                color={WE_COLORS.hanging}
                                textColor="#1c1917"
                                align="end"
                            />
                        ) : (
                            <Pill
                                x={Math.max(sx(wallRect.x), rulerLeft + RULER_SIZE) + 6}
                                y={sy(hangY) - 11}
                                text={hangingLabel}
                                color={WE_COLORS.hanging}
                                textColor="#1c1917"
                                align="start"
                            />
                        )}
                    </g>
                )}

                {/* Ruler guides */}
                {view.guides.map((g) => {
                    const active = g.id === hoverGuide || g.id === draggedGuide?.id;
                    return g.axis === 'x' ? (
                        <line key={g.id} x1={sx(g.value)} x2={sx(g.value)} y1={0} y2={H} stroke={WE_COLORS.guide} strokeWidth={active ? 1.5 : 1} opacity={active ? 1 : 0.75} pointerEvents="none" />
                    ) : (
                        <line key={g.id} x1={0} x2={W} y1={sy(g.value)} y2={sy(g.value)} stroke={WE_COLORS.guide} strokeWidth={active ? 1.5 : 1} opacity={active ? 1 : 0.75} pointerEvents="none" />
                    );
                })}

                {/* Artwork states */}
                {items.map((item) => {
                    const r = screenRect(rectOf(item));
                    const selected = selectedSet.has(item.id);
                    const warn = warnings.overlapping.has(item.id) ? WE_COLORS.overlap : warnings.outside.has(item.id) ? WE_COLORS.warning : null;
                    return (
                        <g key={item.id} pointerEvents="none">
                            {warn && !selected && (
                                <rect {...r} fill="none" stroke={warn} strokeWidth={1.5} strokeDasharray="5 3" />
                            )}
                            {selected && <rect {...r} fill="none" stroke={WE_COLORS.select} strokeWidth={1.5} />}
                            {!selected && item.id === hoverId && !interaction && (
                                <rect {...r} fill="none" stroke={WE_COLORS.hover} strokeWidth={1.5} />
                            )}
                        </g>
                    );
                })}

                {annotations}

                {/* Snap lines and equal-spacing marks */}
                {snapLines?.lines.map((l, i) => (
                    l.axis === 'x'
                        ? <line key={`sl${i}`} x1={sx(l.value)} x2={sx(l.value)} y1={sy(l.from)} y2={sy(l.to)} stroke={WE_COLORS.measure} strokeWidth={1} pointerEvents="none" />
                        : <line key={`sl${i}`} x1={sx(l.from)} x2={sx(l.to)} y1={sy(l.value)} y2={sy(l.value)} stroke={WE_COLORS.measure} strokeWidth={1} pointerEvents="none" />
                ))}
                {snapLines?.spacings.map((s, i) => (
                    <MeasureLine
                        key={`ss${i}`}
                        m={s.axis === 'x'
                            ? { x1: s.start, y1: s.at, x2: s.end, y2: s.at, value: s.end - s.start }
                            : { x1: s.at, y1: s.start, x2: s.at, y2: s.end, value: s.end - s.start }}
                        vt={vt}
                        color={WE_COLORS.spacing}
                    />
                ))}

                {/* Selection box + size */}
                {selectionBox && (
                    <g pointerEvents="none">
                        {selectedIds.length > 1 && (
                            <rect {...screenRect(selectionBox)} fill="none" stroke={WE_COLORS.select} strokeWidth={1} strokeDasharray="4 3" />
                        )}
                        <Pill
                            x={sx(centerX(selectionBox))}
                            y={sy(selectionBox.y) + 14}
                            text={`${formatCm(selectionBox.w, false)} × ${formatCm(selectionBox.h)}`}
                            color={WE_COLORS.select}
                        />
                        {selectedIds.length === 1 && (
                            <text
                                x={sx(selectionBox.x)}
                                y={sy(top(selectionBox)) - 6}
                                fill="#93c5fd"
                                fontSize={11}
                                fontWeight={600}
                                fontFamily={WE_FONT}
                            >
                                {itemsById.get(selectedIds[0])!.label.slice(0, 48)}
                            </text>
                        )}
                        {selectedIds.length > 1 && (
                            <text x={sx(selectionBox.x)} y={sy(top(selectionBox)) - 6} fill="#93c5fd" fontSize={11} fontWeight={600} fontFamily={WE_FONT}>
                                {selectedIds.length} Werke
                            </text>
                        )}
                    </g>
                )}

                {spacingHandles}

                {marquee && (
                    <rect {...marquee} fill="rgba(59,130,246,0.08)" stroke={WE_COLORS.select} strokeWidth={1} pointerEvents="none" />
                )}

                {view.showRulers && (
                    <WallEditorRulers
                        vt={vt}
                        width={W}
                        height={H}
                        selection={selectionBox}
                        pointer={pointer}
                        guides={view.guides}
                        left={rulerLeft}
                        onRulerPointerDown={handleRulerPointerDown}
                    />
                )}

                {/* Value of the guide being dragged */}
                {draggedGuide && (
                    draggedGuide.axis === 'x'
                        ? <Pill x={sx(draggedGuide.value)} y={RULER_SIZE + 14} text={interaction?.kind === 'guide' && interaction.overRuler ? 'Entfernen' : formatCm(draggedGuide.value)} color={WE_COLORS.guide} textColor="#083344" />
                        : <Pill x={rulerLeft + RULER_SIZE + 8} y={sy(draggedGuide.value)} align="start" text={interaction?.kind === 'guide' && interaction.overRuler ? 'Entfernen' : formatCm(draggedGuide.value - wallRect.y)} color={WE_COLORS.guide} textColor="#083344" />
                )}
            </svg>

            {/* Tooltip for hovered artwork */}
            {hovered && !interaction && effectiveTool !== 'hand' && !selectedSet.has(hovered.id) && (
                <div
                    className="absolute pointer-events-none px-1.5 py-0.5 rounded bg-black/75 text-[11px] text-white whitespace-nowrap"
                    style={{ left: sx(hovered.rect.x), top: sy(top(hovered.rect)) - 22, fontFamily: WE_FONT }}
                >
                    {hovered.label}
                    {hovered.inst.artwork.artist ? <span className="text-white/60"> · {hovered.inst.artwork.artist}</span> : null}
                </div>
            )}
        </div>
    );
};
