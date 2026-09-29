import { create } from 'zustand';
import type { Rect } from '../lib/wallEditor/layout';
import type { RoomFace } from '../lib/wallEditor/roomFaces';
import { browserStorage, readMeasureToggles, writeMeasureToggles } from '../lib/wallEditor/measureToggles';
import {
    DEFAULT_HANGING_HEIGHT,
    MAX_GUIDES_PER_FACE,
    MAX_HANGING_HEIGHT,
    MIN_HANGING_HEIGHT,
    dropWallKeys,
    limitGuideValue,
    renameWallKeys,
    type GuideAxis,
    type StoredGuide,
    type WallLayout,
} from '../lib/wallEditor/guides';

/**
 * View + tool state of the 2D wall editor (editorStore holds which wall is open and the selection).
 * Changes here are frequent (pan/zoom) and only concern the 2D view, so they live in their own store.
 */

export type WallEditorTool = 'select' | 'hand' | 'measure';

export type WallEditorPanelTab = 'arrange' | 'artwork' | 'guides';

/**
 * idle      — 3D editor
 * entering  — camera flies to the wall (perspective)
 * active    — orthographic 2D view, overlay shown
 * leaving   — camera flies back to the orbit view
 */
export type WallEditorPhase = 'idle' | 'entering' | 'active' | 'leaving';

export interface ViewportInsets {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

export interface PinnedMeasurement {
    id: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface RulerGuide extends StoredGuide {
    id: number;
}

/** Stable empty list for selectors (a fresh [] per call would re-render forever). */
export const EMPTY_GUIDES: RulerGuide[] = [];

export const MIN_PX_PER_M = 25;
export const MAX_PX_PER_M = 6000;
export const RULER_SIZE = 22;

const GUIDES_VIEW_KEY = 'curahub-wall-guides-view';

interface GuidesView {
    hidden: boolean;
    locked: boolean;
}

const readGuidesView = (): GuidesView => {
    try {
        const raw = window.localStorage.getItem(GUIDES_VIEW_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : null;
        if (parsed && typeof parsed === 'object') {
            const { hidden, locked } = parsed as Record<string, unknown>;
            return { hidden: hidden === true, locked: locked === true };
        }
    } catch {
        // storage unavailable or broken — fall back to the defaults
    }
    return { hidden: false, locked: false };
};

const storeGuidesView = (view: GuidesView) => {
    try {
        window.localStorage.setItem(GUIDES_VIEW_KEY, JSON.stringify(view));
    } catch {
        // storage unavailable — keep the setting for this session only
    }
};

const initialGuidesView = readGuidesView();

const clampScale = (s: number) => Math.min(MAX_PX_PER_M, Math.max(MIN_PX_PER_M, s));

let nextId = 1;

interface WallEditorViewState {
    phase: WallEditorPhase;

    /** Wall coordinates (metres) at the centre of the canvas. */
    centerU: number;
    centerV: number;
    /** Screen pixels per metre. */
    pxPerM: number;
    viewportW: number;
    viewportH: number;

    tool: WallEditorTool;
    snapping: boolean;
    showRulers: boolean;
    showFloorDistances: boolean;
    showGaps: boolean;
    showHangingLine: boolean;
    /** Height of the picture centres above the floor (metres), stored per exhibition version. */
    hangingHeight: number;

    measurements: PinnedMeasurement[];
    /** Ruler guides per wall face (key: targetKey of the face), stored per exhibition version. */
    guidesByFace: Record<string, RulerGuide[]>;
    /** Hidden guides are neither drawn nor snapped to (per browser). */
    guidesHidden: boolean;
    /** Locked guides and the hanging line can't be grabbed in the canvas (per browser). */
    guidesLocked: boolean;
    /** Guide highlighted by hovering it in the canvas or in the guides tab. */
    hoverGuideId: number | null;

    panelTab: WallEditorPanelTab;
    /** The user picked a tab in this editor session — selecting artworks no longer switches it. */
    panelTabPinned: boolean;

    /** Wall faces of the room model (published by Satellit in the editor). */
    roomFaces: RoomFace[];
    setRoomFaces: (faces: RoomFace[]) => void;

    setPhase: (phase: WallEditorPhase) => void;
    setViewport: (w: number, h: number) => void;
    setView: (view: { centerU: number; centerV: number; pxPerM: number }) => void;
    panBy: (dxPx: number, dyPx: number) => void;
    /** Zooms by `factor` keeping the wall point under the screen point (x, y) fixed. */
    zoomAt: (x: number, y: number, factor: number) => void;
    /** Frames `rect` (wall coordinates) inside the free part of the viewport. */
    fitRect: (rect: Rect, insets: ViewportInsets, viewport?: { w: number; h: number }) => void;

    setTool: (tool: WallEditorTool) => void;
    toggle: (key: 'snapping' | 'showRulers' | 'showFloorDistances' | 'showGaps' | 'showHangingLine') => void;
    setHangingHeight: (metres: number) => void;

    addMeasurement: (m: Omit<PinnedMeasurement, 'id'>) => void;
    removeMeasurement: (id: number) => void;
    clearMeasurements: () => void;

    /** null when the face already has MAX_GUIDES_PER_FACE guides — nothing is added. */
    addGuide: (faceKey: string, axis: GuideAxis, value: number) => number | null;
    updateGuide: (faceKey: string, id: number, patch: Partial<StoredGuide>) => void;
    removeGuide: (faceKey: string, id: number) => void;
    setFaceGuides: (faceKey: string, guides: RulerGuide[]) => void;
    toggleGuidesHidden: () => void;
    toggleGuidesLocked: () => void;
    setHoverGuide: (id: number | null) => void;
    /** Replaces hanging height and guides with a version's stored layout. */
    loadWallLayout: (layout: WallLayout) => void;
    /** A temporary wall got its database id. */
    renameWallGuides: (fromWallId: number, toWallId: number) => void;
    dropWallGuides: (wallId: number) => void;
    /** Clears per-wall view state (measurements) when another wall/side is opened. */
    resetForWall: () => void;
    setPanelTab: (tab: WallEditorPanelTab, byUser?: boolean) => void;
    /** Back to "Anordnen" when the editor opens. */
    resetPanelTab: () => void;
}

export const useWallEditorView = create<WallEditorViewState>((set, get) => ({
    phase: 'idle',
    centerU: 0,
    centerV: 0,
    pxPerM: 150,
    viewportW: 1,
    viewportH: 1,

    tool: 'select',
    snapping: true,
    showRulers: true,
    ...readMeasureToggles(browserStorage()),
    hangingHeight: DEFAULT_HANGING_HEIGHT,

    measurements: [],
    guidesByFace: {},
    guidesHidden: initialGuidesView.hidden,
    guidesLocked: initialGuidesView.locked,
    hoverGuideId: null,

    panelTab: 'arrange',
    panelTabPinned: false,

    roomFaces: [],
    setRoomFaces: (roomFaces) => set({ roomFaces }),

    setPhase: (phase) => set({ phase }),
    setViewport: (w, h) => {
        const state = get();
        if (state.viewportW === w && state.viewportH === h) return;
        set({ viewportW: Math.max(1, w), viewportH: Math.max(1, h) });
    },
    setView: (view) => set({ ...view, pxPerM: clampScale(view.pxPerM) }),
    panBy: (dxPx, dyPx) => set((s) => ({
        centerU: s.centerU - dxPx / s.pxPerM,
        centerV: s.centerV + dyPx / s.pxPerM,
    })),
    zoomAt: (x, y, factor) => set((s) => {
        const pxPerM = clampScale(s.pxPerM * factor);
        // Wall point under the cursor before zooming …
        const u = (x - s.viewportW / 2) / s.pxPerM + s.centerU;
        const v = (s.viewportH / 2 - y) / s.pxPerM + s.centerV;
        // … stays under the cursor afterwards.
        return {
            pxPerM,
            centerU: u - (x - s.viewportW / 2) / pxPerM,
            centerV: v - (s.viewportH / 2 - y) / pxPerM,
        };
    }),
    fitRect: (rect, insets, viewport) => set((s) => {
        const w = viewport?.w ?? s.viewportW;
        const h = viewport?.h ?? s.viewportH;
        const availW = Math.max(80, w - insets.left - insets.right);
        const availH = Math.max(80, h - insets.top - insets.bottom);
        const pxPerM = clampScale(Math.min(availW / rect.w, availH / rect.h));
        // Centre of the free area, relative to the canvas centre, in pixels
        const offsetX = insets.left + availW / 2 - w / 2;
        const offsetY = insets.top + availH / 2 - h / 2;
        return {
            viewportW: w,
            viewportH: h,
            pxPerM,
            centerU: rect.x + rect.w / 2 - offsetX / pxPerM,
            centerV: rect.y + rect.h / 2 + offsetY / pxPerM,
        };
    }),

    setTool: (tool) => set({ tool }),
    toggle: (key) => set((s) => {
        const next = { [key]: !s[key] } as Partial<WallEditorViewState>;
        // The measure toggles also drive the 3D view and survive a reload.
        if (key === 'showHangingLine' || key === 'showFloorDistances' || key === 'showGaps') {
            writeMeasureToggles(browserStorage(), {
                showHangingLine: s.showHangingLine,
                showFloorDistances: s.showFloorDistances,
                showGaps: s.showGaps,
                [key]: !s[key],
            });
        }
        return next;
    }),
    setHangingHeight: (metres) => set({ hangingHeight: Math.min(MAX_HANGING_HEIGHT, Math.max(MIN_HANGING_HEIGHT, metres)) }),

    addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, { ...m, id: nextId++ }] })),
    removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
    clearMeasurements: () => set({ measurements: [] }),

    addGuide: (faceKey, axis, value) => {
        const { guidesHidden, guidesLocked, guidesByFace } = get();
        if ((guidesByFace[faceKey]?.length ?? 0) >= MAX_GUIDES_PER_FACE) return null;
        const id = nextId++;
        const clamped = limitGuideValue(value);
        // A new guide is always visible, also when the guides were hidden.
        if (guidesHidden) storeGuidesView({ hidden: false, locked: guidesLocked });
        set((s) => ({
            guidesByFace: { ...s.guidesByFace, [faceKey]: [...(s.guidesByFace[faceKey] ?? []), { id, axis, value: clamped }] },
            guidesHidden: false,
        }));
        return id;
    },
    updateGuide: (faceKey, id, patch) => set((s) => {
        const list = s.guidesByFace[faceKey];
        if (!list) return s;
        const clampedPatch = patch.value !== undefined ? { ...patch, value: limitGuideValue(patch.value) } : patch;
        return { guidesByFace: { ...s.guidesByFace, [faceKey]: list.map((g) => (g.id === id ? { ...g, ...clampedPatch } : g)) } };
    }),
    removeGuide: (faceKey, id) => set((s) => {
        const list = s.guidesByFace[faceKey];
        if (!list) return s;
        return {
            guidesByFace: { ...s.guidesByFace, [faceKey]: list.filter((g) => g.id !== id) },
            hoverGuideId: s.hoverGuideId === id ? null : s.hoverGuideId,
        };
    }),
    setFaceGuides: (faceKey, guides) => set((s) => ({ guidesByFace: { ...s.guidesByFace, [faceKey]: guides } })),
    toggleGuidesHidden: () => set((s) => {
        storeGuidesView({ hidden: !s.guidesHidden, locked: s.guidesLocked });
        return { guidesHidden: !s.guidesHidden };
    }),
    toggleGuidesLocked: () => set((s) => {
        storeGuidesView({ hidden: s.guidesHidden, locked: !s.guidesLocked });
        return { guidesLocked: !s.guidesLocked };
    }),
    setHoverGuide: (id) => {
        if (get().hoverGuideId !== id) set({ hoverGuideId: id });
    },
    loadWallLayout: (layout) => set({
        hangingHeight: layout.hangingHeight,
        guidesByFace: Object.fromEntries(Object.entries(layout.guides).map(([key, list]) => [
            key,
            list.map((g) => ({ id: nextId++, axis: g.axis, value: g.value })),
        ])),
        hoverGuideId: null,
    }),
    renameWallGuides: (fromWallId, toWallId) => set((s) => {
        const guidesByFace = renameWallKeys(s.guidesByFace, fromWallId, toWallId);
        return guidesByFace === s.guidesByFace ? s : { guidesByFace };
    }),
    dropWallGuides: (wallId) => set((s) => {
        const guidesByFace = dropWallKeys(s.guidesByFace, wallId);
        return guidesByFace === s.guidesByFace ? s : { guidesByFace };
    }),
    resetForWall: () => set({ measurements: [], hoverGuideId: null }),
    setPanelTab: (tab, byUser = true) => set((s) => ({ panelTab: tab, panelTabPinned: s.panelTabPinned || byUser })),
    resetPanelTab: () => set({ panelTab: 'arrange', panelTabPinned: false }),
}));

/** Screen ↔ wall coordinate mapping for a view snapshot. */
export interface ViewTransform {
    toScreenX: (u: number) => number;
    toScreenY: (v: number) => number;
    toWallU: (x: number) => number;
    toWallV: (y: number) => number;
    pxPerM: number;
}

export function makeViewTransform(view: Pick<WallEditorViewState, 'centerU' | 'centerV' | 'pxPerM' | 'viewportW' | 'viewportH'>): ViewTransform {
    const { centerU, centerV, pxPerM, viewportW, viewportH } = view;
    return {
        toScreenX: (u) => (u - centerU) * pxPerM + viewportW / 2,
        toScreenY: (v) => viewportH / 2 - (v - centerV) * pxPerM,
        toWallU: (x) => (x - viewportW / 2) / pxPerM + centerU,
        toWallV: (y) => (viewportH / 2 - y) / pxPerM + centerV,
        pxPerM,
    };
}

/**
 * Free canvas area around the panels that float above it (asset sidebar, properties panel),
 * the wall editor's own bars and the rulers.
 */
export function measureViewportInsets(container: HTMLElement): ViewportInsets {
    const box = container.getBoundingClientRect();
    // Room for the rulers, the top/tool bars and the wall's dimension labels (right of the wall).
    const insets: ViewportInsets = { left: RULER_SIZE + 24, right: 64, top: RULER_SIZE + 72, bottom: 88 };
    document.querySelectorAll<HTMLElement>('[data-wall-editor-inset]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.right > box.left + 4 && r.left < box.right - 4;
        if (!visible) return;
        const side = el.dataset.wallEditorInset;
        // The vertical ruler sits right of a left panel (WallEditorOverlay).
        if (side === 'left') insets.left = Math.max(insets.left, r.right - box.left + 8 + RULER_SIZE + 24);
        if (side === 'right') insets.right = Math.max(insets.right, box.right - r.left + 64);
    });
    return insets;
}
