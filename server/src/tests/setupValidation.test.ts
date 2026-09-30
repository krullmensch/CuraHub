import { completeSetupSchema, normalizePublicUrl } from '../lib/setupValidation';

describe('normalizePublicUrl', () => {
    it.each([
        ['https://curahub.hsbi.de', 'https://curahub.hsbi.de'],
        ['https://curahub.hsbi.de/', 'https://curahub.hsbi.de'],
        ['  https://CuraHub.HSBI.de  ', 'https://curahub.hsbi.de'],
        ['https://curahub.hsbi.de:8443', 'https://curahub.hsbi.de:8443'],
        ['http://localhost:3004', 'http://localhost:3004'],
        ['http://127.0.0.1', 'http://127.0.0.1'],
    ])('accepts %s', (input, out) => expect(normalizePublicUrl(input)).toBe(out));

    it.each([
        'http://curahub.hsbi.de', 'https://curahub.hsbi.de/app', 'https://curahub.hsbi.de/?a=1',
        'https://curahub.hsbi.de/#x', 'https://user:pw@curahub.hsbi.de', 'curahub.hsbi.de', 'ftp://x.de', '',
    ])('rejects %s', (input) => expect(normalizePublicUrl(input)).toBeNull());
});

describe('completeSetupSchema', () => {
    const valid = {
        publicUrl: 'https://curahub.hsbi.de',
        localAdmin: { username: 'notfall', password: 'x'.repeat(12) },
    };
    it('accepts a minimal body', () => expect(completeSetupSchema.safeParse(valid).success).toBe(true));
    it('rejects short passwords, bad usernames and @ in names', () => {
        expect(completeSetupSchema.safeParse({ ...valid, localAdmin: { username: 'notfall', password: 'x'.repeat(11) } }).success).toBe(false);
        expect(completeSetupSchema.safeParse({ ...valid, localAdmin: { username: 'Not Fall', password: 'x'.repeat(12) } }).success).toBe(false);
        expect(completeSetupSchema.safeParse({ ...valid, localAdmin: { username: 'a@b', password: 'x'.repeat(12) } }).success).toBe(false);
        expect(completeSetupSchema.safeParse({ ...valid, hsbiAdmin: { username: 'm@hsbi.de', password: 'p' } }).success).toBe(false);
    });
});
