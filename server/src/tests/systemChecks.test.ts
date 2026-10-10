import fs from 'fs';
import os from 'os';
import path from 'path';
import { readBackupState, runSystemChecks, type CheckDeps } from '../lib/systemChecks';

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 9, 11, 6, 0, 0);

function deps(over: Partial<CheckDeps> = {}): CheckDeps {
    return {
        pingDb: async () => {},
        migrationRows: async () => ({ finished: 9, failed: 0 }),
        migrationFolderCount: () => 9,
        uploadsDir: '/uploads',
        writeProbe: async () => {},
        run: async () => {},
        freeBytes: async () => 50 * 1024 ** 3,
        reachHsbi: async () => {},
        backups: async () => ({ count: 3, newest: { name: 'curahub-20261011-030000.sql.gz', mtimeMs: NOW - 3 * HOUR, size: 2 * 1024 ** 2 }, lastError: null }),
        now: () => NOW,
        timeoutMs: 50,
        ...over,
    };
}
const viaProxy = { forwarded: true, protocol: 'https' };
const byId = (checks: { id: string; status: string }[]) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

describe('runSystemChecks', () => {
    it('is all green on a healthy instance behind the proxy', async () => {
        const checks = await runSystemChecks(deps(), viaProxy);
        expect(checks.map((c) => c.id)).toEqual(['database', 'migrations', 'uploads', 'ffmpeg', 'poppler', 'disk', 'hsbi', 'backup', 'proxy']);
        expect(checks.every((c) => c.status === 'ok')).toBe(true);
        expect(checks.every((c) => c.label && c.detail)).toBe(true);
    });
    it('fails the database and migrations when the DB is down', async () => {
        const down = async () => { throw new Error('ECONNREFUSED'); };
        const s = byId(await runSystemChecks(deps({ pingDb: down, migrationRows: down }), viaProxy));
        expect(s.database).toBe('fail');
        expect(s.migrations).toBe('fail');
    });
    it('fails migrations with a failed row or missing ones', async () => {
        expect(byId(await runSystemChecks(deps({ migrationRows: async () => ({ finished: 9, failed: 1 }) }), viaProxy)).migrations).toBe('fail');
        expect(byId(await runSystemChecks(deps({ migrationRows: async () => ({ finished: 8, failed: 0 }) }), viaProxy)).migrations).toBe('fail');
    });
    it('fails when a tool is missing', async () => {
        const run = async (cmd: string) => { if (cmd === 'pdftoppm') throw new Error('ENOENT'); };
        const s = byId(await runSystemChecks(deps({ run }), viaProxy));
        expect(s.poppler).toBe('fail');
        expect(s.ffmpeg).toBe('ok');
    });
    it('fails uploads when the probe cannot write', async () => {
        expect(byId(await runSystemChecks(deps({ writeProbe: async () => { throw new Error('EACCES'); } }), viaProxy)).uploads).toBe('fail');
    });
    it('warns on little disk space, unreachable hsbi.de and no proxy', async () => {
        const s = byId(await runSystemChecks(
            deps({ freeBytes: async () => 5 * 1024 ** 3, reachHsbi: async () => { throw new Error('timeout'); } }),
            { forwarded: false, protocol: 'http' },
        ));
        expect(s.disk).toBe('warn');
        expect(s.hsbi).toBe('warn');
        expect(s.proxy).toBe('warn');
    });
    it('warns when forwarded but not https', async () => {
        expect(byId(await runSystemChecks(deps(), { forwarded: true, protocol: 'http' })).proxy).toBe('warn');
    });
    it('turns a hanging check into a failure after the timeout', async () => {
        const checks = await runSystemChecks(deps({ pingDb: () => new Promise(() => {}) }), viaProxy);
        const db = checks.find((c) => c.id === 'database')!;
        expect(db.status).toBe('fail');
        expect(db.detail).toMatch(/Zeitüberschreitung/);
    });
    it('reports an aborted fetch (AbortSignal.timeout) in German', async () => {
        const reachHsbi = async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); };
        const hsbi = (await runSystemChecks(deps({ reachHsbi }), viaProxy)).find((c) => c.id === 'hsbi')!;
        expect(hsbi.status).toBe('warn');
        expect(hsbi.detail).toBe('Zeitüberschreitung');
    });
    describe('backup', () => {
        const backup = async (over: Partial<CheckDeps>) =>
            (await runSystemChecks(deps(over), viaProxy)).find((c) => c.id === 'backup')!;

        it('names the newest dump and how many are kept', async () => {
            const c = await backup({});
            expect(c.status).toBe('ok');
            expect(c.detail).toMatch(/vor 3 Std\./);
            expect(c.detail).toMatch(/3 Dumps/);
        });
        it('warns when the backup folder is not mounted', async () => {
            const c = await backup({ backups: async () => null });
            expect(c.status).toBe('warn');
            expect(c.detail).toMatch(/backup/);
        });
        it('warns when there is no dump yet', async () => {
            expect((await backup({ backups: async () => ({ count: 0, newest: null, lastError: null }) })).status).toBe('warn');
        });
        it('warns when the newest dump is older than a day and a bit', async () => {
            const old = { count: 1, newest: { name: 'a.sql.gz', mtimeMs: NOW - 30 * HOUR, size: 1 }, lastError: null };
            const c = await backup({ backups: async () => old });
            expect(c.status).toBe('warn');
            expect(c.detail).toMatch(/30 Std\./);
        });
        it('shows the error of the last failed run', async () => {
            const failed = { count: 2, newest: { name: 'a.sql.gz', mtimeMs: NOW - 2 * HOUR, size: 1 }, lastError: 'Access denied for user root' };
            const c = await backup({ backups: async () => failed });
            expect(c.status).toBe('warn');
            expect(c.detail).toMatch(/Access denied/);
        });
    });
});

describe('readBackupState', () => {
    let dir: string;
    beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'curahub-backups-')); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('is null for a missing folder', async () => {
        expect(await readBackupState(path.join(dir, 'nope'))).toBeNull();
    });
    it('counts finished dumps only and picks the newest', async () => {
        fs.writeFileSync(path.join(dir, 'curahub-20261009-030000.sql.gz'), 'a');
        fs.writeFileSync(path.join(dir, 'curahub-20261010-030000.sql.gz'), 'bb');
        fs.writeFileSync(path.join(dir, '.curahub-20261011-030000.sql.gz.part'), 'ccc');
        fs.utimesSync(path.join(dir, 'curahub-20261009-030000.sql.gz'), new Date(1_000_000), new Date(1_000_000));
        const state = await readBackupState(dir);
        expect(state?.count).toBe(2);
        expect(state?.newest?.name).toBe('curahub-20261010-030000.sql.gz');
        expect(state?.newest?.size).toBe(2);
        expect(state?.lastError).toBeNull();
    });
    it('reads the error file of the last failed run', async () => {
        fs.writeFileSync(path.join(dir, '.last-error'), '2026-10-11T03:00:00Z Dump fehlgeschlagen: Access denied\n');
        expect((await readBackupState(dir))?.lastError).toMatch(/Access denied$/);
    });
});
