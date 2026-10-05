/**
 * A visitor blob's body in the public viewer: a head that follows the visitor's position and
 * a few segments that each follow the one in front on a soft, slightly underdamped spring. Moving,
 * the body stretches out behind the head; stopping, the tail catches up, overshoots a little and
 * wobbles back — like slime. Pure numbers; VisitorBlobs turns the segments into metaballs.
 */

export type Vec3 = [number, number, number];

export interface BlobSegment {
  position: Vec3;
  velocity: Vec3;
  /** Radius of the metaball in metres. */
  radius: number;
}

export const BLOB_RADII = [0.3, 0.25, 0.21, 0.18, 0.15];
/** Blobs float at chest height above the floor below the visitor's eye. */
export const BLOB_HEIGHT = 1.05;
/** A name label floats this far above the blob's head (editor first person). */
export const BLOB_LABEL_LIFT = 0.55;

/** Spring stiffness (1/s²) and damping (1/s): the head is tight, the tail ever looser. */
const HEAD_STIFFNESS = 60;
const HEAD_DAMPING = 12;
const TAIL_STIFFNESS = 22;
const TAIL_DAMPING = 4.2;
/** Longer steps are split, so a hidden tab coming back doesn't explode the springs. */
const MAX_STEP = 1 / 60;
/** No segment trails further than this behind the one in front (metres). */
export const MAX_LINK = 0.35;

export class BlobChain {
  readonly segments: BlobSegment[];

  constructor(start: Vec3, radii: number[] = BLOB_RADII) {
    this.segments = radii.map((radius) => ({ position: [...start] as Vec3, velocity: [0, 0, 0], radius }));
  }

  /** Advances the springs by `dt` seconds towards `target` (the visitor's blob centre). */
  step(target: Vec3, dt: number): void {
    let left = Math.min(Math.max(dt, 0), 0.5);
    while (left > 1e-6) {
      const h = Math.min(left, MAX_STEP);
      this.substep(target, h);
      left -= h;
    }
  }

  /** Middle of the body (the metaball field is centred here, so a stretched tail stays inside). */
  get centre(): Vec3 {
    const c: Vec3 = [0, 0, 0];
    for (const seg of this.segments) for (let a = 0; a < 3; a++) c[a] += seg.position[a] / this.segments.length;
    return c;
  }

  /** How far the tail is from the head (stretch). */
  get length(): number {
    const head = this.segments[0].position;
    const tail = this.segments[this.segments.length - 1].position;
    return Math.hypot(head[0] - tail[0], head[1] - tail[1], head[2] - tail[2]);
  }

  private substep(target: Vec3, h: number) {
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const goal = i === 0 ? target : this.segments[i - 1].position;
      const k = i === 0 ? HEAD_STIFFNESS : TAIL_STIFFNESS;
      const c = i === 0 ? HEAD_DAMPING : TAIL_DAMPING;
      for (let a = 0; a < 3; a++) {
        const acc = k * (goal[a] - seg.position[a]) - c * seg.velocity[a];
        seg.velocity[a] += acc * h;
        seg.position[a] += seg.velocity[a] * h;
      }
      if (i > 0) {
        // Keep the body together however fast the head moved.
        const d = [0, 1, 2].map((a) => seg.position[a] - goal[a]);
        const len = Math.hypot(d[0], d[1], d[2]);
        if (len > MAX_LINK) {
          for (let a = 0; a < 3; a++) seg.position[a] = goal[a] + (d[a] / len) * MAX_LINK;
        }
      }
    }
  }
}

/** Where a visitor's blob floats, from their eye position. */
export const blobTarget = (eye: Vec3): Vec3 => [eye[0], BLOB_HEIGHT, eye[2]];

/** Pleasant, distinct colour per visitor id (no names in the public viewer). */
export function blobColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 62%)`;
}

/**
 * MarchingCubes `addBall` strength for a ball of `radius` metres in a field cube of
 * `halfSize` metres (the mesh's scale), so that alone it reaches the isolation surface there.
 */
export function ballStrength(radius: number, halfSize: number, isolation: number, subtract: number): number {
  const r = radius / (2 * halfSize);
  return r * r * (isolation + subtract);
}
