import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

// AR export files live in <uploads>/.ar/ (dot-directory, never served by express.static, like .books/).
// Every export gets a new random name, so public files can be cached immutably.
const uploadDir = path.join(__dirname, '../../uploads');
let dir = path.join(uploadDir, '.ar');

export const arDir = () => dir;

/** Tests only: point the helpers at a temporary directory. */
export const setArDirForTests = (next: string) => { dir = next; };

export const newArFileName = (versionId: number, format: 'glb' | 'usdz') =>
    `${versionId}-${crypto.randomBytes(6).toString('hex')}.${format}`;

/** Resolves a stored file name inside the AR directory; names that could leave it throw. */
export function arFilePath(name: string): string {
    if (!name || name !== path.basename(name) || name.includes('..')) {
        throw new Error(`Invalid AR file name: ${name}`);
    }
    return path.join(dir, name);
}

/** Writes to `<name>.tmp` and renames, so a reader never sees a half-written file. */
export async function writeArFile(name: string, data: Buffer): Promise<void> {
    const target = arFilePath(name);
    const tmp = `${target}.tmp`;
    await fs.mkdir(dir, { recursive: true });
    try {
        await fs.writeFile(tmp, data);
        await fs.rename(tmp, target);
    } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
    }
}

export async function deleteArFiles(names: (string | null | undefined)[]): Promise<void> {
    for (const name of names) {
        if (!name) continue;
        try {
            await fs.unlink(arFilePath(name));
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
        }
    }
}

/** Deletes every file in the AR directory that no row references (incl. leftover `.tmp`). Returns the count. */
export async function pruneOrphanArFiles(knownNames: Set<string>): Promise<number> {
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw err;
    }
    let removed = 0;
    for (const name of entries) {
        if (knownNames.has(name)) continue;
        await fs.rm(path.join(dir, name), { recursive: true, force: true });
        removed++;
    }
    return removed;
}
