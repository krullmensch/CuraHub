import { runSystemChecks, type CheckDeps } from '../lib/systemChecks';

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
        timeoutMs: 50,
        ...over,
    };
}
const viaProxy = { forwarded: true, protocol: 'https' };
const byId = (checks: { id: string; status: string }[]) => Object.fromEntries(checks.map((c) => [c.id, c.status]));

describe('runSystemChecks', () => {
    it('is all green on a healthy instance behind the proxy', async () => {
        const checks = await runSystemChecks(deps(), viaProxy);
        expect(checks.map((c) => c.id)).toEqual(['database', 'migrations', 'uploads', 'ffmpeg', 'poppler', 'disk', 'hsbi', 'proxy']);
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
});
