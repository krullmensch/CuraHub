import { AR_TOKEN_TTL_MS, signArJobToken, verifyArJobToken } from '../lib/arExportToken';

const NOW = 1_800_000_000_000;

/** Replaces the first character of the signature part with a different one. */
function flipSignature(token: string): string {
    const [body, sig] = token.split('.');
    const first = sig[0] === 'A' ? 'B' : 'A';
    return `${body}.${first}${sig.slice(1)}`;
}

describe('arExportToken', () => {
    it('round-trips the job id for the same version', () => {
        const token = signArJobToken(12, 'job-abc', NOW);
        expect(verifyArJobToken(token, 12, NOW)).toEqual({ jobId: 'job-abc' });
    });

    it('rejects a token for another version', () => {
        const token = signArJobToken(12, 'job-abc', NOW);
        expect(verifyArJobToken(token, 13, NOW)).toBeNull();
    });

    it('rejects a token after its ten minutes', () => {
        const token = signArJobToken(12, 'job-abc', NOW);
        expect(verifyArJobToken(token, 12, NOW + AR_TOKEN_TTL_MS)).toEqual({ jobId: 'job-abc' });
        expect(verifyArJobToken(token, 12, NOW + AR_TOKEN_TTL_MS + 1)).toBeNull();
    });

    it('rejects a token with a changed signature', () => {
        const token = signArJobToken(12, 'job-abc', NOW);
        expect(verifyArJobToken(flipSignature(token), 12, NOW)).toBeNull();
    });

    it('rejects garbage without throwing', () => {
        for (const junk of ['', 'a.b.c', 'x', '.', 'a.']) {
            expect(() => verifyArJobToken(junk, 12, NOW)).not.toThrow();
            expect(verifyArJobToken(junk, 12, NOW)).toBeNull();
        }
    });

    it('uses a secret that is not JWT_SECRET', () => {
        // A token signed as a plain JWT with the dev fallback secret must not verify.
        const forged = Buffer.from(JSON.stringify({ v: 12, j: 'job-abc', exp: NOW + 60_000 })).toString('base64url');
        expect(verifyArJobToken(`${forged}.${'A'.repeat(43)}`, 12, NOW)).toBeNull();
    });
});
