export interface VersionSummary {
  id: number;
  comment?: string | null;
  branch_name: string;
  parent_version_id: number | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
  creator: { id: number; email: string };
}

/** The open working copy of a published version: its newest unpublished child on the
 *  same branch that was created after publishing. */
export function openWorkingCopyOf(
  versions: VersionSummary[],
  publishedId: number,
): VersionSummary | null {
  const published = versions.find((v) => v.id === publishedId);
  if (!published || !published.is_published || !published.published_at) return null;
  const publishedAt = Date.parse(published.published_at);
  let best: VersionSummary | null = null;
  let bestTime = -Infinity;
  for (const v of versions) {
    if (
      v.parent_version_id !== publishedId ||
      v.is_published ||
      v.branch_name !== published.branch_name
    ) {
      continue;
    }
    const t = Date.parse(v.created_at);
    if (t < publishedAt) continue;
    if (t > bestTime) {
      best = v;
      bestTime = t;
    }
  }
  return best;
}

/** The published version this one is the open working copy of, or null. */
export function workingCopyParent(
  versions: VersionSummary[],
  versionId: number,
): VersionSummary | null {
  const self = versions.find((v) => v.id === versionId);
  if (!self || self.is_published || self.parent_version_id == null) return null;
  const parent = versions.find((v) => v.id === self.parent_version_id);
  if (!parent) return null;
  return openWorkingCopyOf(versions, parent.id)?.id === versionId ? parent : null;
}

/** Version comments are at most this long (server: `comment` max 500). */
const MAX_COMMENT_LENGTH = 500;

/** Comment of a new working copy: „Arbeitskopie von „<comment>"“, or „Arbeitskopie“ without one. */
export function workingCopyComment(publishedComment: string | null | undefined): string {
  const source = publishedComment?.trim();
  if (!source) return 'Arbeitskopie';
  const wrap = (text: string) => `Arbeitskopie von „${text}“`;
  const room = MAX_COMMENT_LENGTH - wrap('').length;
  return wrap(source.length > room ? `${source.slice(0, room - 1)}…` : source);
}
