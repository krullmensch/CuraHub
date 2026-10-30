/** Roles that may start a branch other than main. */
export const BRANCH_CREATOR_ROLES = ['curator', 'prof', 'admin'] as const;

/**
 * True when a new version starts a new branch: a name other than main that differs from the
 * source version's branch. A version on the source's own branch continues it („Version
 * speichern", a working copy of a published version on a branch), so neither the role check nor
 * the duplicate-name check applies to it. Without a known source branch every non-main name
 * counts as new (as before).
 */
export function startsNewBranch(branchName: string, sourceBranch: string | null | undefined): boolean {
    return branchName !== 'main' && branchName !== sourceBranch;
}

export function mayCreateBranch(role: string): boolean {
    return (BRANCH_CREATOR_ROLES as readonly string[]).includes(role);
}
