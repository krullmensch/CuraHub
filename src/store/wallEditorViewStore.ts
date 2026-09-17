import { create } from 'zustand';
import type { Rect } from '../lib/wallEditor/layout';

/**
 * View + tool state of the 2D wall editor (editorStore holds which wall is open and the selection).
 * Changes here are frequent (pan/zoom) and only concern the 2D view, so they live in their own store.
 */

export type WallEditorTool = 'select' | 'hand' | 'measure';

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

export interface RulerGuide {
    id: number;
    /** 'x' = vertical line at u = value, 'y' = horizontal line at v = value. */
    axis: 'x' | 'y';
    value: number;
}

export const MIN_PX_PER_M = 25;
export const MAX_PX_PER_M = 6000;
export const RULER_SIZE = 22;

const HANGING_HEIGHT_KEY = 'curahub-hanging-height';
const DEFAULT_HANGING_HEIGHT = 1.5;

const readHangingHeight = (): number => {
    try {
        const raw = window.localStorage.getItem(HANGING_HEIGHT_KEY);
        const value = raw ? Number(raw) : NaN;
        return Number.isFinite(value) && value > 0 && value < 10 ? value : DEFAULT_HANGING_HEIGHT;
    } catch {
        return DEFAULT_HANGING_HEIGHT;
    }
};

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
    /** Height of the picture centres above the floor (metres). */
    hangingHeight: number;

    measurements: PinnedMeasurement[];
    guides: RulerGuide[];

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

    addGuide: (axis: 'x' | 'y', value: number) => number;
    moveGuide: (id: number, value: number) => void;
    removeGuide: (id: number) => void;
    /** Clears per-wall state (measurements, guides) when another wall/side is opened. */
    resetForWall: () => void;
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
    showFloorDistances: false,
    showGaps: false,
    showHangingLine: true,
    hangingHeight: readHangingHeight(),

    measurements: [],
    guides: [],

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
    toggle: (key) => set((s) => ({ [key]: !s[key] }) as Partial<WallEditorViewState>),
    setHangingHeight: (metres) => {
        const value = Math.min(9.99, Math.max(0.01, metres));
        try {
            window.localStorage.setItem(HANGING_HEIGHT_KEY, String(value));
        } catch {
            // storage unavailable — keep the value for this session only
        }
        set({ hangingHeight: value });
    },

    addMeasurement: (m) => set((s) => ({ measurements: [...s.measurements, { ...m, id: nextId++ }] })),
    removeMeasurement: (id) => set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
    clearMeasurements: () => set({ measurements: [] }),

    addGuide: (axis, value) => {
        const id = nextId++;
        set((s) => ({ guides: [...s.guides, { id, axis, value }] }));
        return id;
    },
    moveGuide: (id, value) => set((s) => ({ guides: s.guides.map((g) => (g.id === id ? { ...g, value } : g)) })),
    removeGuide: (id) => set((s) => ({ guides: s.guides.filter((g) => g.id !== id) })),
    resetForWall: () => set({ measurements: [], guides: [] }),
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
    const insets: ViewportInsets = { left: RULER_SIZE + 24, right: 24, top: RULER_SIZE + 72, bottom: 88 };
    document.querySelectorAll<HTMLElement>('[data-wall-editor-inset]').forEach((el) => {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.right > box.left + 4 && r.left < box.right - 4;
        if (!visible) return;
        const side = el.dataset.wallEditorInset;
        if (side === 'left') insets.left = Math.max(insets.left, r.right - box.left + 24);
        if (side === 'right') insets.right = Math.max(insets.right, box.right - r.left + 24);
    });
    return insets;
}
