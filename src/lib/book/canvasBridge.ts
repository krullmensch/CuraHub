/** The main R3F canvas, registered by MainCanvasRegistrar (pointer re-lock must not guess by selector). */
let mainCanvas: HTMLCanvasElement | null = null;

export const canvasBridge = {
  set(canvas: HTMLCanvasElement | null): void {
    mainCanvas = canvas;
  },
  /** The registered canvas while it is still in the document. */
  get(): HTMLCanvasElement | null {
    return mainCanvas && mainCanvas.isConnected ? mainCanvas : null;
  },
};
