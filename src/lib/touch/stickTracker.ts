import { stickVector, type StickValue } from './stick';

/**
 * One joystick: owns exactly one pointer from its down until its up, so two thumbs on two sticks
 * never steal each other's input and a finger that slides off the stick keeps steering.
 */
export class StickTracker {
  private pointerId: number | null = null;
  private centre = { x: 0, y: 0 };
  private current: StickValue = { x: 0, y: 0 };
  private readonly radius: number;

  constructor(radius: number) {
    this.radius = radius;
  }

  /** Returns false when the stick is already held by another pointer. */
  pointerDown(id: number, x: number, y: number, centre: { x: number; y: number }): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = id;
    this.centre = centre;
    this.current = stickVector(x - centre.x, y - centre.y, this.radius);
    return true;
  }

  pointerMove(id: number, x: number, y: number): void {
    if (id !== this.pointerId) return;
    this.current = stickVector(x - this.centre.x, y - this.centre.y, this.radius);
  }

  /** Also for pointercancel. */
  pointerUp(id: number): void {
    if (id !== this.pointerId) return;
    this.pointerId = null;
    this.current = { x: 0, y: 0 };
  }

  release(): void {
    this.pointerId = null;
    this.current = { x: 0, y: 0 };
  }

  owns(id: number): boolean {
    return id === this.pointerId;
  }

  value(): StickValue {
    return this.current;
  }

  /** Finger offset for drawing the knob, clamped to the rim (screen px). */
  knobOffset(x: number, y: number): { x: number; y: number } {
    const dx = x - this.centre.x;
    const dy = y - this.centre.y;
    const length = Math.hypot(dx, dy);
    if (length <= this.radius) return { x: dx, y: dy };
    return { x: (dx / length) * this.radius, y: (dy / length) * this.radius };
  }
}
