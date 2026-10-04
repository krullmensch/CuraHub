import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClaimSync } from './claimSync';

describe('ClaimSync', () => {
  let sent: string[][][];
  let saving: boolean;
  let sync: ClaimSync;

  beforeEach(() => {
    vi.useFakeTimers();
    sent = [];
    saving = false;
    sync = new ClaimSync({ send: (g) => sent.push(g), isSaving: () => saving });
  });
  afterEach(() => {
    sync.dispose();
    vi.useRealTimers();
  });

  it('sends nothing for an empty start and new keys at once', () => {
    sync.update([]);
    expect(sent).toEqual([]);
    sync.update([['instance:1']]);
    expect(sent).toEqual([[['instance:1']]]);
    sync.update([['instance:1']]);
    expect(sent).toHaveLength(1);
  });

  it('holds dropped keys a moment longer, then releases them', () => {
    sync.update([['instance:1']]);
    sync.update([['instance:2']]);
    expect(sent.at(-1)).toEqual([['instance:2'], ['instance:1']]);
    vi.advanceTimersByTime(799);
    expect(sent).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(sent.at(-1)).toEqual([['instance:2']]);
    expect(sync.sent).toEqual([['instance:2']]);
  });

  it('waits for auto-sync before letting go', () => {
    sync.update([['wall:3', 'instance:4']]);
    sync.update([]);
    saving = true;
    vi.advanceTimersByTime(2000);
    expect(sent.at(-1)).toEqual([['instance:4'], ['wall:3']]);
    saving = false;
    vi.advanceTimersByTime(300);
    expect(sent.at(-1)).toEqual([]);
  });

  it('takes a key back without a gap when it is selected again', () => {
    sync.update([['instance:1']]);
    sync.update([]);
    sync.update([['instance:1']]);
    expect(sent.at(-1)).toEqual([['instance:1']]);
    vi.advanceTimersByTime(1000);
    expect(sent.at(-1)).toEqual([['instance:1']]);
  });

  it('forgets everything on reset', () => {
    sync.update([['instance:1']]);
    sync.update([]); // lingers: the request does not change yet
    sync.reset();
    vi.advanceTimersByTime(1000);
    expect(sent).toEqual([[['instance:1']]]);
    expect(sync.sent).toEqual([]);
    sync.update([]);
    expect(sent).toHaveLength(1);
    sync.update([['instance:2']]);
    expect(sent.at(-1)).toEqual([['instance:2']]);
  });
});
