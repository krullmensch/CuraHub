import { isTap, type PointerSample } from './stick';

/**
 * Decides which canvas touches are taps (show artwork info / open a book): a single finger, short
 * and still. A pointer that started on a stick, or any pointer while another one is down
 * (pinch, two thumbs), never yields a tap.
 */
export class TapTracker {
  private readonly pointers = new Map<number, { start: PointerSample; valid: boolean }>();

  down(id: number, sample: PointerSample, onStick = false): void {
    const multi = this.pointers.size > 0;
    if (multi) for (const p of this.pointers.values()) p.valid = false;
    this.pointers.set(id, { start: sample, valid: !onStick && !multi });
  }

  /** Returns the tap position, or null. */
  up(id: number, sample: PointerSample): { x: number; y: number } | null {
    const p = this.pointers.get(id);
    this.pointers.delete(id);
    if (!p || !p.valid || !isTap(p.start, sample)) return null;
    return { x: sample.x, y: sample.y };
  }

  cancel(id: number): void {
    this.pointers.delete(id);
  }
}
