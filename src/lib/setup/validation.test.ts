import { describe, expect, it } from 'vitest';
import { normalizePublicUrl, passwordProblem, usernameProblem } from './validation';

describe('normalizePublicUrl (mirror of the server rule)', () => {
    it.each([
        ['https://curahub.hsbi.de/', 'https://curahub.hsbi.de'],
        ['  https://CuraHub.HSBI.de  ', 'https://curahub.hsbi.de'],
        ['http://localhost:3004', 'http://localhost:3004'],
    ])('accepts %s', (input, out) => expect(normalizePublicUrl(input)).toBe(out));
    it.each(['http://curahub.hsbi.de', 'https://curahub.hsbi.de/app', 'https://a.de/?x=1', 'curahub.hsbi.de', ''])(
        'rejects %s', (input) => expect(normalizePublicUrl(input)).toBeNull());
});

describe('usernameProblem', () => {
    it('accepts a-z 0-9 . _ - with 3–32 chars', () => expect(usernameProblem('notfall.admin')).toBeNull());
    it('explains bad names', () => {
        expect(usernameProblem('ab')).toMatch(/3–32/);
        expect(usernameProblem('Not Fall')).toMatch(/a–z/);
        expect(usernameProblem('a@b')).toMatch(/a–z/);
    });
});

describe('passwordProblem', () => {
    it('needs 12 chars and a matching repeat', () => {
        expect(passwordProblem('kurz', 'kurz')).toMatch(/12/);
        expect(passwordProblem('sehr-geheim-123', 'sehr-geheim-124')).toMatch(/überein/);
        expect(passwordProblem('sehr-geheim-123', 'sehr-geheim-123')).toBeNull();
    });
});
