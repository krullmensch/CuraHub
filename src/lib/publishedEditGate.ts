export type GatePhase = 'idle' | 'asking' | 'resolving';
export type GateChoice = 'workingCopy' | { branch: string } | 'discard' | { join: number };

interface GateState {
  phase: GatePhase;
  undoDepth: number;
}

let state: GateState = { phase: 'idle', undoDepth: 0 };
const listeners = new Set<() => void>();

function set(next: GateState) {
  state = next;
  listeners.forEach((fn) => fn());
}

/** Opens the "version is published" dialog exactly once per edit attempt. */
export const publishedEditGate = {
  request(undoDepth: number): void {
    if (state.phase !== 'idle') return;
    set({ phase: 'asking', undoDepth });
  },
  beginResolve(): void {
    if (state.phase !== 'asking') return;
    set({ ...state, phase: 'resolving' });
  },
  finish(): void {
    if (state.phase === 'idle') return;
    set({ phase: 'idle', undoDepth: 0 });
  },
  reset(): void {
    if (state.phase === 'idle') return;
    set({ phase: 'idle', undoDepth: 0 });
  },
  getState(): GateState {
    return state;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
