/**
 * Follows the server's change numbers for the active version (`version` and `changed`
 * messages) and says when a change can be applied, was seen already, or when changes were
 * missed and the whole version has to be merged again.
 */

export type EnterResult = 'entered' | 'resumed' | 'missed';
export type AcceptResult = 'apply' | 'seen' | 'missed';

export class ChangeSequence {
  private known: { versionId: number; seq: number } | null = null;

  /** `version` message: entering a version, or resuming it after a reconnect. */
  enter(versionId: number, seq: number): EnterResult {
    const prev = this.known;
    this.known = { versionId, seq };
    if (prev?.versionId !== versionId) return 'entered';
    return prev.seq === seq ? 'resumed' : 'missed';
  }

  /** `changed` message of the active version. */
  accept(versionId: number, seq: number): AcceptResult {
    const known = this.known;
    if (known?.versionId !== versionId) {
      this.known = { versionId, seq };
      return 'apply';
    }
    if (seq <= known.seq) return 'seen';
    const gap = seq > known.seq + 1;
    known.seq = seq;
    return gap ? 'missed' : 'apply';
  }
}
