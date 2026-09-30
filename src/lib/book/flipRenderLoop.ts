/**
 * page-flip 2.0.7 starts its render loop as
 *   const t = e => { this.render(e); requestAnimationFrame(t) }
 * and never stops it (`destroy()` does not touch it). react-pageflip 2.0.3 does not call
 * destroy on unmount either. So after tearing a book down the loop has to be ended by hand.
 *
 * The loop calls the *global* `requestAnimationFrame` synchronously right after `this.render(e)`.
 * We replace `render` on the instance with a function that swaps in a one-shot
 * `requestAnimationFrame` that schedules nothing and puts the original back: the loop's next
 * call is swallowed and the loop ends, without errors and without touching other rAF users
 * (nothing else runs between `this.render(e)` and that call).
 */

export interface RafHost {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
}

export interface RenderLoopOwner {
  render: (timer: number) => void;
}

export function stopRenderLoop(owner: RenderLoopOwner, win: RafHost = window): void {
  owner.render = () => {
    const original = win.requestAnimationFrame;
    win.requestAnimationFrame = () => {
      win.requestAnimationFrame = original;
      return 0;
    };
  };
}
