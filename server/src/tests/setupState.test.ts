import jwt from 'jsonwebtoken';
import {
    codesMatch, ensureSetupSecrets, formatSetupBanner, generateSetupCode, getSetupCode,
    issueSetupToken, loadSetupState, resetSetupStateForTests, setSetupState, verifySetupToken,
} from '../lib/setupState';
import { JWT_SECRET } from '../lib/jwtSecret';

afterEach(() => resetSetupStateForTests());

describe('setup code', () => {
    it('has the XXXX-XXXX-XXXX format from the unambiguous alphabet', () => {
        expect(generateSetupCode()).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}(-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}){2}$/);
    });
    it('matches case-insensitively, ignoring dashes and spaces', () => {
        expect(codesMatch('7f3k 9qxm2bta', '7F3K-9QXM-2BTA')).toBe(true);
        expect(codesMatch('7F3K-9QXM-2BTB', '7F3K-9QXM-2BTA')).toBe(false);
        expect(codesMatch('', '7F3K-9QXM-2BTA')).toBe(false);
    });
    it('is created once and dropped when the setup completes', () => {
        const { code } = ensureSetupSecrets();
        expect(ensureSetupSecrets().code).toBe(code);
        setSetupState({ complete: true, publicUrl: 'https://x.de' });
        expect(getSetupCode()).toBeNull();
    });
    it('banner shows the code', () => {
        expect(formatSetupBanner('AAAA-BBBB-CCCC')).toContain('Setup-Code: AAAA-BBBB-CCCC');
    });
});

describe('setup token', () => {
    it('verifies while setup is open and is signed with its own secret', () => {
        ensureSetupSecrets();
        const token = issueSetupToken();
        expect(verifySetupToken(token)).toBe(true);
        expect(() => jwt.verify(token, JWT_SECRET)).toThrow();
    });
    it('is invalid after a restart (new secret)', () => {
        ensureSetupSecrets();
        const token = issueSetupToken();
        resetSetupStateForTests();
        ensureSetupSecrets();
        expect(verifySetupToken(token)).toBe(false);
    });
});

describe('loadSetupState', () => {
    it('reads completion and public URL from the settings rows', async () => {
        const db = { systemSetting: { findMany: jest.fn().mockResolvedValue([
            { key: 'setup_completed_at', value: '2026-10-01T00:00:00.000Z' },
            { key: 'public_url', value: 'https://curahub.example.de' },
        ]) } };
        await expect(loadSetupState(db)).resolves.toEqual({ complete: true, publicUrl: 'https://curahub.example.de' });
    });
    it('is incomplete on an empty table', async () => {
        const db = { systemSetting: { findMany: jest.fn().mockResolvedValue([]) } };
        await expect(loadSetupState(db)).resolves.toEqual({ complete: false, publicUrl: null });
    });
});
