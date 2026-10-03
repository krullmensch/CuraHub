import { claimGroupsSignature } from './claims';

/**
 * Turns the selection's claim groups into `claim` requests. New keys go out at once; keys the
 * selection dropped are held a little longer (LINGER_MS, and while auto-sync is still saving),
 * so the last change to an artwork reaches the server before somebody else can claim it.
 */

const LINGER_MS = 800;
const SAVING_RECHECK_MS = 300;

export interface ClaimSyncDeps {
  send(groups: string[][]): void;
  /** True while auto-sync has requests in flight. */
  isSaving(): boolean;
  now?: () => number;
}

export class ClaimSync {
  private desired: string[][] = [];
  private readonly lingering = new Map<string, number>();
  private lastSignature: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly deps: ClaimSyncDeps;

  constructor(deps: ClaimSyncDeps) {
    this.deps = deps;
  }

  /** The groups the selection needs now. */
  update(desired: string[][]): void {
    const until = this.now() + LINGER_MS;
    const next = new Set(desired.flat());
    for (const key of this.desired.flat()) {
      if (!next.has(key)) this.lingering.set(key, until);
    }
    for (const key of next) this.lingering.delete(key);
    this.desired = desired;
    this.flush();
  }

  /** Forget everything without lingering (version switch: the server released it all). */
  reset(): void {
    this.desired = [];
    this.lingering.clear();
    this.lastSignature = null;
    this.clearTimer();
  }

  dispose(): void {
    this.clearTimer();
  }

  /** Groups of the last request. */
  get sent(): string[][] {
    return this.lastSignature ? (JSON.parse(this.lastSignature) as string[][]) : [];
  }

  private flush() {
    this.clearTimer();
    const now = this.now();
    const saving = this.deps.isSaving();
    for (const [key, until] of this.lingering) {
      if (until <= now && !saving) this.lingering.delete(key);
    }
    const groups = [...this.desired, ...[...this.lingering.keys()].sort().map((key) => [key])];
    const signature = claimGroupsSignature(groups);
    // Nothing held and nothing wanted: no request needed after a reset either.
    if (signature !== this.lastSignature && !(this.lastSignature === null && groups.length === 0)) {
      this.lastSignature = signature;
      this.deps.send(groups);
    }
    if (this.lingering.size > 0) {
      const due = Math.min(...this.lingering.values()) - now;
      this.timer = setTimeout(() => this.flush(), due > 0 ? due : SAVING_RECHECK_MS);
    }
  }

  private clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private now() {
    return (this.deps.now ?? Date.now)();
  }
}
