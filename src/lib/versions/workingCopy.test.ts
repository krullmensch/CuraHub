import { describe, expect, it } from 'vitest';
import { openWorkingCopyOf, workingCopyComment, workingCopyParent, type VersionSummary } from './workingCopy';

let nextId = 1;
function v(over: Partial<VersionSummary>): VersionSummary {
  return {
    id: nextId++,
    branch_name: 'main',
    parent_version_id: null,
    is_published: false,
    published_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    creator: { id: 1, email: 'a@b.de' },
    ...over,
  };
}

const published = (over: Partial<VersionSummary> = {}) =>
  v({ is_published: true, published_at: '2026-02-01T00:00:00.000Z', ...over });

describe('openWorkingCopyOf', () => {
  it('finds the child on the same branch created after publishing', () => {
    const p = published({ id: 100 });
    const c = v({ id: 101, parent_version_id: 100, created_at: '2026-02-02T00:00:00.000Z' });
    expect(openWorkingCopyOf([p, c], 100)?.id).toBe(101);
  });

  it('ignores children on other branches, published children, and children created before published_at', () => {
    const p = published({ id: 100 });
    const otherBranch = v({ id: 101, parent_version_id: 100, branch_name: 'x', created_at: '2026-02-02T00:00:00.000Z' });
    const pubChild = published({ id: 102, parent_version_id: 100, created_at: '2026-02-02T00:00:00.000Z' });
    const early = v({ id: 103, parent_version_id: 100, created_at: '2026-01-15T00:00:00.000Z' });
    expect(openWorkingCopyOf([p, otherBranch, pubChild, early], 100)).toBeNull();
  });

  it('returns the newest when several match', () => {
    const p = published({ id: 100 });
    const a = v({ id: 101, parent_version_id: 100, created_at: '2026-02-02T00:00:00.000Z' });
    const b = v({ id: 102, parent_version_id: 100, created_at: '2026-02-05T00:00:00.000Z' });
    expect(openWorkingCopyOf([p, b, a], 100)?.id).toBe(102);
  });

  it('returns null without a match / when publishedId is not published', () => {
    const p = published({ id: 100 });
    const u = v({ id: 200 });
    const c = v({ id: 201, parent_version_id: 200, created_at: '2026-02-02T00:00:00.000Z' });
    expect(openWorkingCopyOf([p], 100)).toBeNull();
    expect(openWorkingCopyOf([u, c], 200)).toBeNull();
    expect(openWorkingCopyOf([p], 999)).toBeNull();
  });
});

describe('workingCopyParent', () => {
  it('returns the published parent for a working copy and null otherwise', () => {
    const p = published({ id: 100 });
    const c = v({ id: 101, parent_version_id: 100, created_at: '2026-02-02T00:00:00.000Z' });
    const older = v({ id: 102, parent_version_id: 100, created_at: '2026-02-01T12:00:00.000Z' });
    expect(workingCopyParent([p, c, older], 101)?.id).toBe(100);
    expect(workingCopyParent([p, c, older], 102)).toBeNull();
    expect(workingCopyParent([p, c], 100)).toBeNull();
    expect(workingCopyParent([p, c], 555)).toBeNull();
  });
});

describe('workingCopyComment', () => {
  it('names the published version', () => {
    expect(workingCopyComment('Eröffnung')).toBe('Arbeitskopie von „Eröffnung“');
  });
  it('falls back without a comment', () => {
    expect(workingCopyComment(null)).toBe('Arbeitskopie');
    expect(workingCopyComment('  ')).toBe('Arbeitskopie');
  });
  it('stays within the server limit of 500 characters', () => {
    const comment = workingCopyComment('x'.repeat(500));
    expect(comment.length).toBe(500);
    expect(comment.endsWith('…“')).toBe(true);
  });
});
