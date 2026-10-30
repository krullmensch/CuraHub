import type { Response } from 'express';

/**
 * Published versions are read-only. Sends 409 `version_published` and returns false for one.
 * Call it after the access check (nobody learns about versions they cannot see) and before
 * `ensureNotClaimed`.
 */
export function ensureVersionWritable(res: Response, version: { is_published: boolean }): boolean {
    if (!version.is_published) return true;
    res.status(409).json({ code: 'version_published', error: 'Diese Version ist veröffentlicht und schreibgeschützt.' });
    return false;
}
