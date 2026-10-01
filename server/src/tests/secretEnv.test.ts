import { applySecretFiles } from '../lib/secretEnv';
import { resolveJwtSecret } from '../lib/jwtSecret';

const files: Record<string, string> = {
    '/s/db_password': 'abc123\n',
    '/s/jwt_secret': 'jwtjwt\n',
};
const read = (p: string) => {
    if (!(p in files)) throw new Error('ENOENT');
    return files[p];
};

describe('applySecretFiles', () => {
    it('builds DATABASE_URL and JWT_SECRET from the secret files', () => {
        const env: Record<string, string | undefined> = {};
        applySecretFiles(env, '/s', read);
        expect(env.DATABASE_URL).toBe('mysql://curahub:abc123@db:3306/curahub');
        expect(env.JWT_SECRET).toBe('jwtjwt');
    });
    it('keeps values that are already set (env wins)', () => {
        const env: Record<string, string | undefined> = { DATABASE_URL: 'mysql://x', JWT_SECRET: 'mine' };
        applySecretFiles(env, '/s', read);
        expect(env.DATABASE_URL).toBe('mysql://x');
        expect(env.JWT_SECRET).toBe('mine');
    });
    it('treats empty strings from compose as unset', () => {
        const env: Record<string, string | undefined> = { DATABASE_URL: '', JWT_SECRET: '' };
        applySecretFiles(env, '/s', read);
        expect(env.JWT_SECRET).toBe('jwtjwt');
    });
    it('does nothing when the files are missing (local dev)', () => {
        const env: Record<string, string | undefined> = {};
        applySecretFiles(env, '/nope', read);
        expect(env.DATABASE_URL).toBeUndefined();
        expect(env.JWT_SECRET).toBeUndefined();
    });
    it('url-encodes the password', () => {
        const env: Record<string, string | undefined> = {};
        applySecretFiles(env, '/s', (p) => (p.endsWith('db_password') ? 'a@b/c' : read(p)));
        expect(env.DATABASE_URL).toBe('mysql://curahub:a%40b%2Fc@db:3306/curahub');
    });
});

describe('resolveJwtSecret', () => {
    it('uses the env value', () => expect(resolveJwtSecret({ JWT_SECRET: 'x' })).toBe('x'));
    it('falls back to the dev key outside production', () =>
        expect(resolveJwtSecret({ NODE_ENV: 'development' })).toBe('supersecret_dev_key'));
    it('refuses to start in production without a secret', () =>
        expect(() => resolveJwtSecret({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/));
});
