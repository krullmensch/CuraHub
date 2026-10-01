import { statSync } from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';

const REPO_BLOB = 'https://github.com/krullmensch/CuraHub/blob/main/';

/**
 * @param {string} value     text of an inline code span
 * @param {string} repoRoot  absolute path of the repository root
 * @returns {string | null}  the path if it names an existing file inside the repo
 */
export function repoPathOf(value, repoRoot) {
    // Relative, at least one directory, no spaces or shell syntax.
    if (!/^[\w.-]+(\/[\w.-]+)+$/.test(value)) return null;
    // The value goes into the GitHub URL as is, so it must already be normalised ("../repo/x" would
    // resolve back into the repo here but is no valid blob path).
    if (value.split('/').some((segment) => segment === '.' || segment === '..')) return null;
    const absolute = path.resolve(repoRoot, value);
    if (!absolute.startsWith(path.resolve(repoRoot) + path.sep)) return null;
    try {
        return statSync(absolute).isFile() ? value : null;
    } catch {
        return null;
    }
}

/** Remark plugin: inline code that is a path to a file in this repo becomes a link to it on GitHub. */
export function remarkRepoLinks({ repoRoot }) {
    return (tree) => {
        visit(tree, 'inlineCode', (node, index, parent) => {
            if (!parent || index === undefined || parent.type === 'link') return;
            const repoPath = repoPathOf(node.value, repoRoot);
            if (!repoPath) return;
            parent.children[index] = { type: 'link', url: REPO_BLOB + repoPath, children: [node] };
        });
    };
}
