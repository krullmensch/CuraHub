import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
    arDir, arFilePath, deleteArFiles, newArFileName, pruneOrphanArFiles, setArDirForTests, writeArFile,
} from '../lib/arExportFiles';

let dir: string;

beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ar-files-'));
    setArDirForTests(dir);
});

afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
});

describe('arExportFiles', () => {
    it('builds a random file name per export', () => {
        const a = newArFileName(12, 'glb');
        expect(a).toMatch(/^12-[0-9a-f]{12}\.glb$/);
        expect(newArFileName(12, 'glb')).not.toBe(a);
        expect(newArFileName(3, 'usdz')).toMatch(/^3-[0-9a-f]{12}\.usdz$/);
    });

    it('writes atomically and leaves no .tmp behind', async () => {
        const data = Buffer.from([1, 2, 3, 4]);
        await writeArFile('1-abc.glb', data);
        expect(await fs.readFile(path.join(arDir(), '1-abc.glb'))).toEqual(data);
        expect(await fs.readdir(dir)).toEqual(['1-abc.glb']);
    });

    it('creates the directory when it is missing', async () => {
        setArDirForTests(path.join(dir, 'nested', '.ar'));
        await writeArFile('1-abc.glb', Buffer.from('x'));
        expect(await fs.readdir(arDir())).toEqual(['1-abc.glb']);
    });

    it('ignores missing files and empty names on delete', async () => {
        await expect(deleteArFiles(['missing.glb', null, undefined])).resolves.toBeUndefined();
        await writeArFile('a.glb', Buffer.from('x'));
        await deleteArFiles(['a.glb']);
        expect(await fs.readdir(dir)).toEqual([]);
    });

    it('removes files without a row', async () => {
        await writeArFile('a.glb', Buffer.from('x'));
        await writeArFile('b.usdz', Buffer.from('x'));
        await fs.writeFile(path.join(dir, 'c.glb.tmp'), 'x');
        const removed = await pruneOrphanArFiles(new Set(['a.glb']));
        expect(removed).toBe(2);
        expect(await fs.readdir(dir)).toEqual(['a.glb']);
    });

    it('prunes nothing when the directory does not exist', async () => {
        setArDirForTests(path.join(dir, 'none'));
        expect(await pruneOrphanArFiles(new Set())).toBe(0);
    });

    it('rejects names that leave the directory', () => {
        expect(() => arFilePath('../x')).toThrow();
        expect(() => arFilePath('a/b.glb')).toThrow();
        expect(arFilePath('1-abc.glb')).toBe(path.join(dir, '1-abc.glb'));
    });
});
