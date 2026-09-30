import { describe, expect, it } from 'vitest';
import { stopRenderLoop, type RafHost, type RenderLoopOwner } from './flipRenderLoop';

/** Fake window + a page-flip-shaped Render whose loop is exactly `render(e); raf(t)`. */
function setup() {
  const queue: FrameRequestCallback[] = [];
  const win: RafHost = {
    requestAnimationFrame: (cb) => {
      queue.push(cb);
      return queue.length;
    },
  };
  const originalRaf = win.requestAnimationFrame;
  let renders = 0;
  const owner: RenderLoopOwner = {
    render() {
      renders++;
    },
  };
  const start = () => {
    const t = (e: number) => {
      owner.render(e);
      win.requestAnimationFrame(t);
    };
    win.requestAnimationFrame(t);
  };
  /** Runs one animation frame: every callback queued so far. */
  const frame = () => queue.splice(0).forEach((cb) => cb(0));
  return { win, owner, start, frame, queue, originalRaf, renders: () => renders };
}

describe('stopRenderLoop', () => {
  it('a running loop reschedules itself forever (baseline)', () => {
    const s = setup();
    s.start();
    for (let i = 0; i < 5; i++) s.frame();
    expect(s.renders()).toBe(5);
    expect(s.queue).toHaveLength(1);
  });

  it('ends the loop on its next frame and restores requestAnimationFrame', () => {
    const s = setup();
    s.start();
    s.frame();
    stopRenderLoop(s.owner, s.win);
    s.frame(); // the loop's last frame: render is now a no-op, the reschedule is swallowed
    expect(s.queue).toHaveLength(0);
    expect(s.win.requestAnimationFrame).toBe(s.originalRaf);
    s.frame();
    expect(s.renders()).toBe(1);
  });

  it('does not swallow rAF calls made by others afterwards', () => {
    const s = setup();
    s.start();
    stopRenderLoop(s.owner, s.win);
    s.frame();
    let ran = false;
    s.win.requestAnimationFrame(() => {
      ran = true;
    });
    s.frame();
    expect(ran).toBe(true);
  });
});
