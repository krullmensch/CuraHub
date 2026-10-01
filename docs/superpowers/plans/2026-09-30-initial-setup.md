# Fresh Install + Web Setup Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CuraHub installs on a new server from an empty database with one `docker compose up -d`, and a first-run web wizard sets up and secures the instance (setup code, system check, public URL, emergency admin, HSBI admin).

**Architecture:** An `init` container writes random secrets into a volume; the server reads them itself (`lib/loadSecretEnv`) when `DATABASE_URL`/`JWT_SECRET` are not set. A new `SystemSetting` table holds `setup_completed_at` + `public_url`; a gate middleware answers 503 on all API namespaces until the wizard (`/api/setup/*`, protected by a one-time code from the log and a short-lived token signed with an in-memory secret) completes. Local password accounts (`User.email` without `@`) give an emergency login next to the HSBI login.

**Tech Stack:** Express 5 + Prisma 5 (MariaDB 10.6), Jest + supertest (server, DB-free tests only), React 19 + React Router 7 + Vitest (client), Docker Compose, Apache on the host.

**Spec:** `docs/superpowers/specs/2026-09-30-initial-setup-design.md`

## Global Constraints

- All user-facing strings German (UI, API error messages, log banner, docs/deployment.md).
- Never run the app, DB or a browser against a local stack. Local: `npm run test`, `npm run lint`, `npm run build` (root) and `npx jest`, `npm run build` (server) only. Anything that needs a running app is verified on `Prohosting-18GB-Server` (Task 9).
- Server tests must not need a database: the existing `auth.test.ts` and `scaleFigures.test.ts` already fail locally for that reason (baseline: 2 failed / 11 passed suites) — that baseline must not get worse.
- Secrets: 48 hex chars from `/dev/urandom`, files `db_root_password`, `db_password`, `jwt_secret` in volume `secrets`, mounted at `/run/curahub-secrets`.
- DB name `curahub`, DB user `curahub` for fresh installs.
- Local username rule `/^[a-z0-9._-]{3,32}$/`, password 12–200 chars, bcrypt cost 12.
- Public URL: `https://…` or `http://localhost[:port]` / `http://127.0.0.1[:port]`; no path, query, hash or credentials; stored as `URL.origin`.
- Setup code alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, format `XXXX-XXXX-XXXX`; setup token lifetime 30 min.
- Env overrides always win over secret files and settings (`DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGINS`).
- Compose keeps `APP_EXTERNAL_PORT` (host port, default 3000) and `APP_BIND_ADDRESS` (default `127.0.0.1`) — production's `.env` uses `APP_EXTERNAL_PORT=3001`, `APP_BIND_ADDRESS=172.17.0.1`.
- Spec deviation (deliberate): the setup API is mounted at both `/setup` and `/api/setup` (Vite's dev proxy strips `/api`), but `setup` is **not** an API namespace for the SPA fallback, so `GET /setup` still serves the page. Health is `/health` + `/api/health`.

## Review Focus

- A setup token sent to any normal API route must be rejected (it is signed with a different, in-memory secret) — otherwise `req.user.userId` is `undefined` and Prisma filters vanish. Test in Task 4.
- An existing database with users must never show the wizard (migration INSERT) — verified in Task 9 step 5 on the prod-copy test stack.
- App restart mid-wizard: new code, old token → every setup call answers 401; the wizard must drop back to the code step instead of hanging. Implemented in Task 7 (`onExpired`), checked in Task 9.
- Public URL input with trailing slash, uppercase host, a path or `http://` on a real domain — normalised or rejected identically on client and server. Tests in Task 4 and Task 7.
- Shell scripts run with `docker compose exec` (no entrypoint, no `DATABASE_URL` in env) must still reach the DB via the secret files. Test of `applySecretFiles` in Task 1; real run in Task 9.

---

## File Structure

Server (`server/src/`):
- `lib/secretEnv.ts` — `applySecretFiles(env, dir, read)`: fills `DATABASE_URL`/`JWT_SECRET` from secret files.
- `lib/loadSecretEnv.ts` — side-effect import: `applySecretFiles(process.env)`.
- `lib/jwtSecret.ts` — the one `JWT_SECRET` (throws in production when missing).
- `lib/rateLimit.ts` — `createRateLimit`, `clientIp` (honours `cf-connecting-ip` only with `BEHIND_CLOUDFLARE=true`), `normalizedUsername`.
- `lib/loginRateLimit.ts` — rebuilt on `rateLimit.ts`, same exports.
- `lib/apiNamespaces.ts` — `API_NAMESPACE_SEGMENTS`, exhibition/noindex route patterns (moved out of `index.ts`).
- `lib/setupState.ts` — cached setup state, setup code, setup token.
- `lib/setupGate.ts` — 503 gate.
- `lib/systemChecks.ts` — checks with injectable deps.
- `lib/setupValidation.ts` — URL/username/password rules + zod schema.
- `lib/setupStore.ts` — DB transaction that completes the setup.
- `lib/corsOrigins.ts` — allowed origins from env/public URL.
- `lib/localLogin.ts` — `verifyLocalLogin`.
- `routes/health.ts`, `routes/setup.ts` (new), `routes/auth.ts`, `routes/admin.ts`, `index.ts` (modified).
- `scripts/reset-local-admin.ts`, `scripts/reset-setup.ts` (new); `scripts/*.ts` get the secret-env import.
- `tests/jestSetup.ts` + tests per lib.

Client (`src/`):
- `lib/setup/validation.ts` (+ test), `lib/setup/setupApi.ts`.
- `components/AuthBackdrop.tsx` (extracted from LoginPage), `components/setup/SetupGate.tsx`, `components/setup/SystemCheckList.tsx`, `components/setup/SetupSteps.tsx`.
- `pages/SetupPage.tsx` (new), `pages/LoginPage.tsx`, `pages/UsersPage.tsx`, `App.tsx` (modified).

Deploy: `docker-compose.yml`, `deploy/init-secrets.sh`, `deploy/apache/curahub.conf`, `.env.example`, `docs/deployment.md`, `CLAUDE.md`.

---

### Task 1: Secret env, single JWT secret, proxy-safe rate limiter

**Files:**
- Create: `server/src/lib/secretEnv.ts`, `server/src/lib/loadSecretEnv.ts`, `server/src/lib/jwtSecret.ts`, `server/src/lib/rateLimit.ts`
- Modify: `server/src/lib/loginRateLimit.ts` (whole file), `server/src/lib/middleware.ts:5`, `server/src/routes/auth.ts:11`, `server/src/index.ts:1-2`, `server/src/scripts/*.ts` (first import)
- Test: `server/src/tests/secretEnv.test.ts`, `server/src/tests/rateLimit.test.ts`

**Interfaces:**
- Produces: `applySecretFiles(env: Record<string, string | undefined>, dir?: string, read?: (p: string) => string): void`; `JWT_SECRET: string`, `resolveJwtSecret(env): string`; `createRateLimit(rules: RateRule[], message: string): RateLimiter` with `RateLimiter = { middleware: RequestHandler; clear(key: string): void }`; `clientIp(req: Request, env?: NodeJS.ProcessEnv): string`; `normalizedUsername(req: Request): string`; `RateRule = { windowMs: number; max: number; key: (ip: string, username: string) => string | null }`.

- [ ] **Step 1: Write the failing tests**

`server/src/tests/secretEnv.test.ts`:
```ts
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
```

`server/src/tests/rateLimit.test.ts`:
```ts
import type { Request, Response } from 'express';
import { clientIp, createRateLimit } from '../lib/rateLimit';

function fakeReq(ip: string, headers: Record<string, string> = {}, body: unknown = {}): Request {
    return { ip, headers, body, socket: {} } as unknown as Request;
}
function fakeRes() {
    const res = { statusCode: 200, body: undefined as unknown, headers: {} as Record<string, string> };
    return Object.assign(res, {
        status(code: number) { res.statusCode = code; return this; },
        json(b: unknown) { res.body = b; return this; },
        setHeader(k: string, v: string) { res.headers[k] = v; },
    }) as unknown as Response & typeof res;
}

describe('clientIp', () => {
    it('ignores cf-connecting-ip unless BEHIND_CLOUDFLARE=true', () => {
        const req = fakeReq('10.0.0.1', { 'cf-connecting-ip': '1.2.3.4' });
        expect(clientIp(req, {})).toBe('10.0.0.1');
        expect(clientIp(req, { BEHIND_CLOUDFLARE: 'true' })).toBe('1.2.3.4');
    });
});

describe('createRateLimit', () => {
    it('answers 429 with Retry-After once the rule is exhausted', () => {
        const limiter = createRateLimit([{ windowMs: 60_000, max: 2, key: (ip) => `t:${ip}` }], 'Zu viele.');
        const next = jest.fn();
        for (let i = 0; i < 2; i++) limiter.middleware(fakeReq('9.9.9.9'), fakeRes(), next);
        const res = fakeRes();
        limiter.middleware(fakeReq('9.9.9.9'), res, next);
        expect(next).toHaveBeenCalledTimes(2);
        expect(res.statusCode).toBe(429);
        expect(res.body).toEqual({ error: 'Zu viele.' });
        expect(Number(res.headers['Retry-After'])).toBeGreaterThan(0);
    });
    it('clear() resets one bucket', () => {
        const limiter = createRateLimit([{ windowMs: 60_000, max: 1, key: (ip) => `c:${ip}` }], 'x');
        const next = jest.fn();
        limiter.middleware(fakeReq('8.8.8.8'), fakeRes(), next);
        limiter.clear('c:8.8.8.8');
        limiter.middleware(fakeReq('8.8.8.8'), fakeRes(), next);
        expect(next).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/secretEnv.test.ts src/tests/rateLimit.test.ts`
Expected: FAIL — `Cannot find module '../lib/secretEnv'` / `'../lib/rateLimit'`.

- [ ] **Step 3: Implement**

`server/src/lib/secretEnv.ts`:
```ts
import fs from 'fs';
import path from 'path';

/**
 * Fresh installs: the compose `init` service writes random secrets into a volume mounted here.
 * The server (and every script run with `docker compose exec`) reads them itself when
 * DATABASE_URL / JWT_SECRET are not set, so no .env is needed. Values set in the
 * environment always win (existing installations keep their .env).
 */
export const DEFAULT_SECRETS_DIR = '/run/curahub-secrets';

type Env = Record<string, string | undefined>;

function readSecret(dir: string, name: string, read: (p: string) => string): string | null {
    try {
        const value = read(path.join(dir, name)).trim();
        return value || null;
    } catch {
        return null;
    }
}

export function applySecretFiles(
    env: Env,
    dir: string = env.SECRETS_DIR || DEFAULT_SECRETS_DIR,
    read: (p: string) => string = (p) => fs.readFileSync(p, 'utf8'),
): void {
    if (!env.DATABASE_URL) {
        const password = readSecret(dir, 'db_password', read);
        if (password) env.DATABASE_URL = `mysql://curahub:${encodeURIComponent(password)}@db:3306/curahub`;
    }
    if (!env.JWT_SECRET) {
        const secret = readSecret(dir, 'jwt_secret', read);
        if (secret) env.JWT_SECRET = secret;
    }
}
```

`server/src/lib/loadSecretEnv.ts`:
```ts
// Import first (right after dotenv) in every entry point: index.ts and all scripts.
import { applySecretFiles } from './secretEnv';

applySecretFiles(process.env);
```

`server/src/lib/jwtSecret.ts`:
```ts
const DEV_FALLBACK = 'supersecret_dev_key';

/** The JWT signing secret. Production refuses to start without one instead of signing with a public key. */
export function resolveJwtSecret(env: Record<string, string | undefined>): string {
    if (env.JWT_SECRET) return env.JWT_SECRET;
    if (env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET fehlt: weder als Umgebungsvariable gesetzt noch in /run/curahub-secrets/jwt_secret gefunden.');
    }
    return DEV_FALLBACK;
}

export const JWT_SECRET = resolveJwtSecret(process.env);
```

`server/src/lib/rateLimit.ts`:
```ts
import type { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * In-memory fixed-window rate limits (single process, like lib/idempotency.ts).
 * With several server instances this needs a shared store.
 */
export interface RateRule {
    windowMs: number;
    max: number;
    /** Returns null when the rule does not apply (e.g. no username in the body). */
    key: (ip: string, username: string) => string | null;
}

export interface RateLimiter {
    middleware: RequestHandler;
    clear(key: string): void;
}

interface Bucket {
    count: number;
    resetAt: number;
}

const allBuckets = new Set<Map<string, Bucket>>();

const pruneTimer = setInterval(() => {
    const now = Date.now();
    for (const buckets of allBuckets) {
        for (const [key, bucket] of buckets) {
            if (bucket.resetAt <= now) buckets.delete(key);
        }
    }
}, 60_000);
pruneTimer.unref();

/**
 * Client address for rate limits. `trust proxy` (index.ts) makes req.ip the address Apache or
 * cloudflared forwarded. cf-connecting-ip is only honoured when the instance really sits behind
 * Cloudflare — otherwise any client could send the header and pick its own bucket.
 */
export function clientIp(req: Request, env: Record<string, string | undefined> = process.env): string {
    if (env.BEHIND_CLOUDFLARE === 'true') {
        const cfIp = req.headers['cf-connecting-ip'];
        if (typeof cfIp === 'string' && cfIp.length > 0) return cfIp;
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function normalizedUsername(req: Request): string {
    const body: unknown = req.body;
    if (typeof body !== 'object' || body === null) return '';
    const username = (body as Record<string, unknown>).username;
    return typeof username === 'string' ? username.trim().toLowerCase().slice(0, 100) : '';
}

export function createRateLimit(rules: RateRule[], message: string): RateLimiter {
    const buckets = new Map<string, Bucket>();
    allBuckets.add(buckets);

    const middleware = (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const ip = clientIp(req);
        const username = normalizedUsername(req);

        const matched: Bucket[] = [];
        for (const rule of rules) {
            const key = rule.key(ip, username);
            if (!key) continue;
            let bucket = buckets.get(key);
            if (!bucket || bucket.resetAt <= now) {
                bucket = { count: 0, resetAt: now + rule.windowMs };
                buckets.set(key, bucket);
            }
            if (bucket.count >= rule.max) {
                res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
                res.status(429).json({ error: message });
                return;
            }
            matched.push(bucket);
        }

        for (const bucket of matched) bucket.count++;
        next();
    };

    return { middleware, clear: (key) => { buckets.delete(key); } };
}
```

`server/src/lib/loginRateLimit.ts` (replace whole file):
```ts
import type { Request } from 'express';
import { clientIp, createRateLimit, normalizedUsername } from './rateLimit';

/**
 * SEC-06: rate limit for POST /auth/login, which forwards credentials to the HSBI SSO.
 * Without a limit CuraHub could be used as a brute-force proxy against HSBI accounts.
 */
const loginLimiter = createRateLimit([
    // Typos are fine, scripted guessing is not.
    { windowMs: 60_000, max: 5, key: (ip, username) => (username ? `ip-user:${ip}:${username}` : null) },
    // Caps guessing on one account from rotating IPs.
    { windowMs: 15 * 60_000, max: 20, key: (_ip, username) => (username ? `user:${username}` : null) },
    // Caps one IP spraying many accounts (a whole lecture hall behind one NAT stays well below).
    { windowMs: 15 * 60_000, max: 100, key: (ip) => `ip:${ip}` },
], 'Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen.');

export const loginRateLimit = loginLimiter.middleware;

/** A successful login clears the short per-IP/user window so a few typos don't linger. */
export function resetLoginAttempts(req: Request): void {
    const username = normalizedUsername(req);
    if (username) loginLimiter.clear(`ip-user:${clientIp(req)}:${username}`);
}
```

`server/src/lib/middleware.ts` line 5 → `import { JWT_SECRET } from './jwtSecret';` (delete the `const JWT_SECRET = …` line).
`server/src/routes/auth.ts` line 11 → delete `const JWT_SECRET = …`, add `import { JWT_SECRET } from '../lib/jwtSecret';` to the imports.
`server/src/index.ts`: after `import 'dotenv/config';` add `import './lib/loadSecretEnv';` as the second line.
Every file in `server/src/scripts/` (`prepare-db.ts`, `backfill-*.ts`): add `import '../lib/loadSecretEnv';` as the first import (after `import 'dotenv/config'` if the file has it).

- [ ] **Step 4: Run tests**

Run: `cd server && npx jest src/tests/secretEnv.test.ts src/tests/rateLimit.test.ts && npx tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 5: Full suite against baseline**

Run: `cd server && npx jest 2>&1 | grep -E "^(PASS|FAIL)|Suites:"`
Expected: only `auth.test.ts` and `scaleFigures.test.ts` fail (DB), everything else passes.

- [ ] **Step 6: Commit**

```bash
git add server/src/lib/secretEnv.ts server/src/lib/loadSecretEnv.ts server/src/lib/jwtSecret.ts server/src/lib/rateLimit.ts server/src/lib/loginRateLimit.ts server/src/lib/middleware.ts server/src/routes/auth.ts server/src/index.ts server/src/scripts server/src/tests/secretEnv.test.ts server/src/tests/rateLimit.test.ts
git commit -m "feat(server): read secrets from the compose volume, one JWT secret, proxy-safe rate limit"
```

---

### Task 2: SystemSetting, setup state, gate, health

**Files:**
- Modify: `server/prisma/schema.prisma` (append model), `server/src/index.ts`, `server/jest.config.js`
- Create: `server/prisma/migrations/20261001120000_system_settings/migration.sql`, `server/src/lib/apiNamespaces.ts`, `server/src/lib/setupState.ts`, `server/src/lib/setupGate.ts`, `server/src/routes/health.ts`, `server/src/tests/jestSetup.ts`
- Test: `server/src/tests/setupState.test.ts`, `server/src/tests/setupGate.test.ts`

**Interfaces:**
- Consumes: `JWT_SECRET` not needed here (setup tokens use their own secret).
- Produces: `SetupState = { complete: boolean; publicUrl: string | null }`; `SETTING_COMPLETED = 'setup_completed_at'`, `SETTING_PUBLIC_URL = 'public_url'`; `loadSetupState(db: SettingsReader): Promise<SetupState>`; `getSetupState(): SetupState | null`; `setSetupState(s: SetupState): void`; `ensureSetupSecrets(): { code: string }`; `getSetupCode(): string | null`; `codesMatch(input: string, expected: string): boolean`; `generateSetupCode(pick?: (n: number) => number): string`; `issueSetupToken(): string`; `verifySetupToken(token: string): boolean`; `formatSetupBanner(code: string): string`; `resetSetupStateForTests(): void`; `setupGate: RequestHandler`; `API_NAMESPACE_SEGMENTS: Set<string>`, `EXHIBITION_FRONTEND_ROUTE_PATTERNS: RegExp[]`, `NOINDEX_ROUTE_PATTERNS: RegExp[]`, `isFrontendExhibitionPath(p: string): boolean`; `createHealthRouter(ping: () => Promise<unknown>): Router`.

- [ ] **Step 1: Schema + migration**

Append to `server/prisma/schema.prisma`:
```prisma
/// Instance-wide settings written by the setup wizard (keys: setup_completed_at, public_url).
model SystemSetting {
  key       String   @id @db.VarChar(64)
  value     String   @db.Text
  updatedAt DateTime @updatedAt
}
```

`server/prisma/migrations/20261001120000_system_settings/migration.sql`:
```sql
-- SETUP: instance settings written by the first-run wizard.
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(64) NOT NULL,
    `value` TEXT NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Databases that already have users (every installation before this migration) count as set up,
-- so the wizard only ever appears on a fresh install.
INSERT INTO `SystemSetting` (`key`, `value`, `updatedAt`)
SELECT 'setup_completed_at', DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ'), NOW(3)
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `User`);
```

Cross-check the DDL without a database (write the old schema into the session scratchpad, not `/tmp`):
```bash
cd server
git show HEAD:server/prisma/schema.prisma > "$SCRATCH/old.prisma"
npx prisma migrate diff --from-schema-datamodel "$SCRATCH/old.prisma" --to-schema-datamodel prisma/schema.prisma --script
npx prisma generate
```
Expected: the printed `CREATE TABLE` equals the one in the migration file above.

- [ ] **Step 2: Write the failing tests**

`server/src/tests/setupState.test.ts`:
```ts
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
```

`server/src/tests/setupGate.test.ts`:
```ts
import express from 'express';
import request from 'supertest';
import { setupGate } from '../lib/setupGate';
import { resetSetupStateForTests, setSetupState } from '../lib/setupState';

function app() {
    const a = express();
    a.use(setupGate);
    a.use((_req, res) => res.status(200).send('through'));
    return a;
}

afterEach(() => resetSetupStateForTests());

describe('setupGate while setup is open', () => {
    beforeEach(() => setSetupState({ complete: false, publicUrl: null }));

    it.each(['/auth/login', '/api/projects', '/public/x', '/uploads/a.webp', '/api/uploads/a.webp', '/admin/users', '/exhibitions/3/versions'])(
        'blocks %s with 503', async (p) => {
            const res = await request(app()).get(p);
            expect(res.status).toBe(503);
            expect(res.body).toEqual({ error: 'setup_required' });
        });

    it.each(['/setup', '/setup/status', '/api/setup/status', '/health', '/api/health', '/', '/assets/index-abc.js', '/exhibition/yol', '/login'])(
        'lets %s through', async (p) => {
            expect((await request(app()).get(p)).status).toBe(200);
        });

    it('blocks writes to frontend-looking exhibition paths', async () => {
        expect((await request(app()).post('/exhibition/yol')).status).toBe(503);
    });
});

describe('setupGate after setup', () => {
    it('lets everything through', async () => {
        setSetupState({ complete: true, publicUrl: 'https://x.de' });
        expect((await request(app()).get('/api/projects')).status).toBe(200);
    });
});
```

Note: `/assets/index-abc.js` — `assets` is an API namespace, but the Vite build output lives there too. The gate must let paths containing a `.` through (static files), exactly like the SPA fallback does.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/setupState.test.ts src/tests/setupGate.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`server/src/lib/apiNamespaces.ts` — move the three constants out of `index.ts` unchanged, add `health`, plus the helper:
```ts
/** First path segments that belong to the API (mounted with and without the /api prefix). */
export const API_NAMESPACE_SEGMENTS = new Set([
    'api', 'auth', 'upload', 'uploads', 'public', 'assets',
    'folders', 'artworks', 'instances', 'projects', 'walls', 'scale-figures', 'books', 'admin',
    'health',
]);

// Frontend route patterns, mirroring src/App.tsx <Route path="..."> entries
// that live under /exhibition or /exhibitions.
export const EXHIBITION_FRONTEND_ROUTE_PATTERNS = [
    /^\/exhibitions$/,
    /^\/exhibition$/,
    /^\/exhibition\/[^/]+$/,           // /exhibition/:slug (public viewer)
    /^\/exhibition\/[^/]+\/assets$/,   // /exhibition/:projectSlug/assets
    /^\/exhibition\/[^/]+\/edit$/,     // /exhibition/:projectSlug/edit
];

// Editor/admin-only frontend routes — excluded from search indexing.
export const NOINDEX_ROUTE_PATTERNS = [
    /^\/exhibition\/[^/]+\/edit$/,
    /^\/exhibition\/[^/]+\/assets$/,
    /^\/project$/,
    /^\/users$/,
    /^\/setup$/,
];

export function isFrontendExhibitionPath(p: string): boolean {
    return EXHIBITION_FRONTEND_ROUTE_PATTERNS.some((re) => re.test(p));
}
```
In `index.ts` delete the three local constants in the production block and import them from `./lib/apiNamespaces` (the SPA fallback code stays otherwise unchanged; use `isFrontendExhibitionPath(req.path)` in place of the inline `.some(...)`).

`server/src/lib/setupState.ts`:
```ts
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

/**
 * Setup state of this instance. Loaded once at start (index.ts), then kept in memory:
 * it only ever changes through the wizard (setSetupState) or a restart after reset-setup.
 */
export interface SetupState {
    complete: boolean;
    publicUrl: string | null;
}

export interface SettingsReader {
    systemSetting: {
        findMany(args: { where: { key: { in: string[] } } }): Promise<{ key: string; value: string }[]>;
    };
}

export const SETTING_COMPLETED = 'setup_completed_at';
export const SETTING_PUBLIC_URL = 'public_url';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const TOKEN_TTL = '30m';

let state: SetupState | null = null;
// Memory only: a restart makes a new code and invalidates every setup token.
let setupCode: string | null = null;
let tokenSecret: Buffer | null = null;

export async function loadSetupState(db: SettingsReader): Promise<SetupState> {
    const rows = await db.systemSetting.findMany({ where: { key: { in: [SETTING_COMPLETED, SETTING_PUBLIC_URL] } } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    state = { complete: byKey.has(SETTING_COMPLETED), publicUrl: byKey.get(SETTING_PUBLIC_URL) ?? null };
    return state;
}

export function getSetupState(): SetupState | null {
    return state;
}

export function setSetupState(next: SetupState): void {
    state = next;
    if (next.complete) {
        setupCode = null;
        tokenSecret = null;
    }
}

export function generateSetupCode(pick: (n: number) => number = (n) => crypto.randomInt(n)): string {
    const chars = Array.from({ length: 12 }, () => CODE_ALPHABET[pick(CODE_ALPHABET.length)]);
    return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-');
}

function normalizeCode(input: string): string {
    return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function codesMatch(input: string, expected: string): boolean {
    const a = Buffer.from(normalizeCode(input));
    const b = Buffer.from(normalizeCode(expected));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function ensureSetupSecrets(): { code: string } {
    if (!setupCode || !tokenSecret) {
        setupCode = generateSetupCode();
        tokenSecret = crypto.randomBytes(32);
    }
    return { code: setupCode };
}

export function getSetupCode(): string | null {
    return setupCode;
}

/** Signed with an in-memory secret, never with JWT_SECRET: a setup token must not pass `authenticate`. */
export function issueSetupToken(): string {
    if (!tokenSecret) throw new Error('Setup ist nicht offen');
    return jwt.sign({ purpose: 'setup' }, tokenSecret, { expiresIn: TOKEN_TTL });
}

export function verifySetupToken(token: string): boolean {
    if (!tokenSecret) return false;
    try {
        const payload = jwt.verify(token, tokenSecret) as { purpose?: string };
        return payload.purpose === 'setup';
    } catch {
        return false;
    }
}

export function formatSetupBanner(code: string): string {
    const line = '='.repeat(52);
    return [
        line,
        ' CuraHub ist noch nicht eingerichtet.',
        ` Setup-Code: ${code}`,
        ' Öffne https://<deine-domain>/setup im Browser.',
        ' Nach einem Neustart gilt ein neuer Code.',
        line,
    ].join('\n');
}

export function resetSetupStateForTests(): void {
    state = null;
    setupCode = null;
    tokenSecret = null;
}
```

`server/src/lib/setupGate.ts`:
```ts
import type { Request, Response, NextFunction } from 'express';
import { API_NAMESPACE_SEGMENTS, isFrontendExhibitionPath } from './apiNamespaces';
import { getSetupState } from './setupState';

/**
 * Until the first-run wizard is done, every API namespace answers 503 so nothing can be read
 * or written on an unsecured instance. The setup API, the health check and the frontend
 * (pages + static build files) stay reachable so /setup can render.
 */
export function setupGate(req: Request, res: Response, next: NextFunction): void {
    if (getSetupState()?.complete) return next();

    const segments = req.path.split('/').filter(Boolean);
    const first = (segments[0] === 'api' ? segments[1] : segments[0]) ?? '';
    if (first === 'setup' || first === 'health') return next();

    const blocked = () => {
        res.status(503).json({ error: 'setup_required' });
    };
    const isRead = req.method === 'GET' || req.method === 'HEAD';

    if (segments[0] === 'api') return blocked();
    // Static build output (e.g. /assets/index-abc.js) — but never uploaded files.
    if (isRead && req.path.includes('.') && first !== 'uploads') return next();
    if (API_NAMESPACE_SEGMENTS.has(first)) return blocked();
    if (first === 'exhibition' || first === 'exhibitions') {
        return isRead && isFrontendExhibitionPath(req.path) ? next() : blocked();
    }
    return isRead ? next() : blocked();
}
```

`server/src/routes/health.ts`:
```ts
import { Router } from 'express';

/** Unauthenticated liveness + DB check for the compose healthcheck. */
export function createHealthRouter(ping: () => Promise<unknown>): Router {
    const router = Router();
    router.get('/', async (_req, res) => {
        try {
            await ping();
            res.json({ ok: true });
        } catch {
            res.status(503).json({ ok: false });
        }
    });
    return router;
}
```

`server/src/tests/jestSetup.ts`:
```ts
// Route tests import `app` without a database: treat the instance as set up.
// Tests of the gate and the wizard reset this themselves.
import { setSetupState } from '../lib/setupState';

setSetupState({ complete: true, publicUrl: null });
```
`server/jest.config.js`: add `setupFiles: ['<rootDir>/src/tests/jestSetup.ts'],`.

`server/src/index.ts`:
- imports: `import { PrismaClient } from '@prisma/client';`, `import { setupGate } from './lib/setupGate';`, `import { ensureSetupSecrets, formatSetupBanner, loadSetupState } from './lib/setupState';`, `import { createHealthRouter } from './routes/health';`.
- after `const app = express();`: `const prisma = new PrismaClient();`
- after the two body-parser `app.use` blocks, before the uploads static handlers:
```ts
// SETUP: nothing but the wizard, health and the frontend answers until the instance is set up.
app.use(setupGate);

const healthRouter = createHealthRouter(() => prisma.$queryRaw`SELECT 1`);
app.use('/health', healthRouter);
app.use('/api/health', healthRouter);
```
- replace the `if (process.env.NODE_ENV !== 'test') { app.listen(…) }` block:
```ts
async function start() {
    // SETUP: the gate needs the state before the first request.
    const setup = await loadSetupState(prisma);
    if (!setup.complete) console.log(formatSetupBanner(ensureSetupSecrets().code));
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        // VID-03: continue video jobs interrupted by a restart.
        resumeVideoJobs().catch((err) => console.error('[VideoJobs] Resume failed:', err));
        resumeBookJobs().catch((err) => console.error('[BookJobs] Resume failed:', err));
    });
}

if (process.env.NODE_ENV !== 'test') {
    start().catch((err) => {
        console.error('[Startup] Failed:', err);
        process.exit(1);
    });
}
```

- [ ] **Step 5: Run tests**

Run: `cd server && npx jest src/tests/setupState.test.ts src/tests/setupGate.test.ts src/tests/booksRoute.test.ts && npx tsc --noEmit`
Expected: PASS (booksRoute proves the jest setup keeps existing route tests working).

- [ ] **Step 6: Commit**

```bash
git add server/prisma server/src/lib/apiNamespaces.ts server/src/lib/setupState.ts server/src/lib/setupGate.ts server/src/routes/health.ts server/src/index.ts server/jest.config.js server/src/tests/jestSetup.ts server/src/tests/setupState.test.ts server/src/tests/setupGate.test.ts
git commit -m "feat(server): setup state, one-time setup code and 503 gate until the instance is set up"
```

---

### Task 3: System checks

**Files:**
- Create: `server/src/lib/systemChecks.ts`
- Test: `server/src/tests/systemChecks.test.ts`

**Interfaces:**
- Produces: `CheckStatus = 'ok' | 'warn' | 'fail'`; `Check = { id: string; label: string; status: CheckStatus; detail: string }`; `CheckRequestInfo = { forwarded: boolean; protocol: string }`; `CheckDeps` (below); `runSystemChecks(deps: CheckDeps, info: CheckRequestInfo): Promise<Check[]>`; `requestInfo(req: Request): CheckRequestInfo`; `defaultCheckDeps(prisma: PrismaClient, uploadsDir: string): CheckDeps`; `MIN_FREE_BYTES = 10 * 1024 ** 3`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/systemChecks.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/tests/systemChecks.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/src/lib/systemChecks.ts`:
```ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { Request } from 'express';
import type { PrismaClient } from '@prisma/client';

export type CheckStatus = 'ok' | 'warn' | 'fail';
export interface Check { id: string; label: string; status: CheckStatus; detail: string }
export interface CheckRequestInfo { forwarded: boolean; protocol: string }

export interface CheckDeps {
    pingDb(): Promise<void>;
    migrationRows(): Promise<{ finished: number; failed: number }>;
    migrationFolderCount(): number;
    uploadsDir: string;
    writeProbe(dir: string): Promise<void>;
    run(cmd: string, args: string[]): Promise<void>;
    freeBytes(dir: string): Promise<number>;
    reachHsbi(): Promise<void>;
    timeoutMs?: number;
}

export const MIN_FREE_BYTES = 10 * 1024 ** 3;
const DEFAULT_TIMEOUT_MS = 6_000;

class TimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new TimeoutError()), ms);
        p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
    });
}

function reason(err: unknown): string {
    if (err instanceof TimeoutError) return 'Zeitüberschreitung';
    return err instanceof Error ? err.message : String(err);
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;

export async function runSystemChecks(deps: CheckDeps, info: CheckRequestInfo): Promise<Check[]> {
    const ms = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const attempt = async (
        id: string, label: string, onError: CheckStatus,
        body: () => Promise<{ status: CheckStatus; detail: string }>,
    ): Promise<Check> => {
        try {
            return { id, label, ...(await withTimeout(body(), ms)) };
        } catch (err) {
            return { id, label, status: onError, detail: reason(err) };
        }
    };

    const proxy: Check = !info.forwarded
        ? { id: 'proxy', label: 'Reverse Proxy (Apache)', status: 'warn', detail: 'Anfrage kam direkt an die App, nicht über Apache.' }
        : info.protocol !== 'https'
            ? { id: 'proxy', label: 'Reverse Proxy (Apache)', status: 'warn', detail: 'Apache leitet weiter, aber nicht per HTTPS (X-Forwarded-Proto fehlt).' }
            : { id: 'proxy', label: 'Reverse Proxy (Apache)', status: 'ok', detail: 'Über Apache per HTTPS erreicht.' };

    const checks = await Promise.all([
        attempt('database', 'Datenbank', 'fail', async () => {
            await deps.pingDb();
            return { status: 'ok', detail: 'Verbindung steht.' };
        }),
        attempt('migrations', 'Datenbank-Migrationen', 'fail', async () => {
            const { finished, failed } = await deps.migrationRows();
            const expected = deps.migrationFolderCount();
            if (failed > 0) return { status: 'fail', detail: `${failed} Migration(en) fehlgeschlagen.` };
            if (finished < expected) return { status: 'fail', detail: `${finished} von ${expected} Migrationen angewendet.` };
            return { status: 'ok', detail: `${finished} Migrationen angewendet.` };
        }),
        attempt('uploads', 'Upload-Ordner beschreibbar', 'fail', async () => {
            await deps.writeProbe(deps.uploadsDir);
            return { status: 'ok', detail: deps.uploadsDir };
        }),
        attempt('ffmpeg', 'ffmpeg (Videos)', 'fail', async () => {
            await deps.run('ffmpeg', ['-version']);
            return { status: 'ok', detail: 'Vorhanden.' };
        }),
        attempt('poppler', 'poppler (PDF-Bücher)', 'fail', async () => {
            await deps.run('pdfinfo', ['-v']);
            await deps.run('pdftoppm', ['-v']);
            return { status: 'ok', detail: 'pdfinfo und pdftoppm vorhanden.' };
        }),
        attempt('disk', 'Freier Speicher', 'warn', async () => {
            const free = await deps.freeBytes(deps.uploadsDir);
            return free < MIN_FREE_BYTES
                ? { status: 'warn', detail: `Nur ${gb(free)} frei (empfohlen: mindestens 10 GB).` }
                : { status: 'ok', detail: `${gb(free)} frei.` };
        }),
        attempt('hsbi', 'HSBI-Login erreichbar', 'warn', async () => {
            await deps.reachHsbi();
            return { status: 'ok', detail: 'www.hsbi.de antwortet.' };
        }),
    ]);

    return [...checks, proxy];
}

export function requestInfo(req: Request): CheckRequestInfo {
    return { forwarded: typeof req.headers['x-forwarded-for'] === 'string', protocol: req.protocol };
}

export function defaultCheckDeps(prisma: PrismaClient, uploadsDir: string): CheckDeps {
    const migrationsDir = path.join(__dirname, '../../prisma/migrations');
    return {
        pingDb: async () => { await prisma.$queryRaw`SELECT 1`; },
        migrationRows: async () => {
            const rows = await prisma.$queryRaw<{ finished: bigint; failed: bigint }[]>`
                SELECT
                    SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL) AS finished,
                    SUM(finished_at IS NULL AND rolled_back_at IS NULL) AS failed
                FROM _prisma_migrations`;
            return { finished: Number(rows[0]?.finished ?? 0), failed: Number(rows[0]?.failed ?? 0) };
        },
        migrationFolderCount: () =>
            fs.readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).length,
        uploadsDir,
        writeProbe: async (dir) => {
            const probe = path.join(dir, `.write-probe-${crypto.randomUUID()}`);
            await fs.promises.writeFile(probe, 'ok');
            await fs.promises.rm(probe);
        },
        run: (cmd, args) => new Promise<void>((resolve, reject) => {
            execFile(cmd, args, { timeout: 5_000 }, (err) => (err ? reject(err) : resolve()));
        }),
        freeBytes: async (dir) => {
            const s = await fs.promises.statfs(dir);
            return s.bavail * s.bsize;
        },
        reachHsbi: async () => {
            await fetch('https://www.hsbi.de/login', { method: 'HEAD', signal: AbortSignal.timeout(5_000) });
        },
    };
}
```

Note: MariaDB `SUM` over booleans returns a DECIMAL — Prisma maps it to `Prisma.Decimal`; `Number(decimal)` works via `valueOf`. If `tsc` complains about the `bigint` type, type the row as `{ finished: unknown; failed: unknown }` and keep `Number(...)`.

- [ ] **Step 4: Run test**

Run: `cd server && npx jest src/tests/systemChecks.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/systemChecks.ts server/src/tests/systemChecks.test.ts
git commit -m "feat(server): system checks for the setup wizard and the admin page"
```

---

### Task 4: Setup API, validation, completion, CORS, trust proxy

**Files:**
- Create: `server/src/lib/setupValidation.ts`, `server/src/lib/setupStore.ts`, `server/src/lib/corsOrigins.ts`, `server/src/routes/setup.ts`
- Modify: `server/src/index.ts` (CORS block lines ~27-34, trust proxy, mount router), `server/package.json` (dependency `bcryptjs`)
- Test: `server/src/tests/setupValidation.test.ts`, `server/src/tests/setupRoute.test.ts`, `server/src/tests/corsOrigins.test.ts`

**Interfaces:**
- Consumes: Task 2 `getSetupState`, `setSetupState`, `getSetupCode`, `codesMatch`, `issueSetupToken`, `verifySetupToken`, `SETTING_COMPLETED`, `SETTING_PUBLIC_URL`; Task 3 `Check`, `runSystemChecks`, `defaultCheckDeps`, `requestInfo`; Task 1 `createRateLimit`, `loginRateLimit`; `validateHSBI` from `routes/auth.ts`.
- Produces: `normalizePublicUrl(input: string): string | null`; `LOCAL_USERNAME_RE`; `MIN_PASSWORD_LENGTH = 12`; `MAX_PASSWORD_LENGTH = 200`; `completeSetupSchema` (zod); `CompleteSetupInput = { publicUrl: string; localAdmin: { username: string; passwordHash: string }; hsbiEmail: string | null }`; `completeSetupInDb(prisma: PrismaClient, input: CompleteSetupInput): Promise<void>`; `allowedOrigins(env, publicUrl: string | null): string[]`; `SetupRouterDeps`; `createSetupRouter(deps: SetupRouterDeps): Router`; `hashPassword(pw: string): Promise<string>` (bcrypt cost 12, in `setupStore.ts`).

- [ ] **Step 1: Add bcryptjs**

Run: `cd server && npm install bcryptjs@^3`
(bcryptjs 3 ships its own types; pure JS, no native build on Alpine.)

- [ ] **Step 2: Write the failing tests**

`server/src/tests/setupValidation.test.ts`:
```ts
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
```

`server/src/tests/corsOrigins.test.ts`:
```ts
import { allowedOrigins } from '../lib/corsOrigins';

describe('allowedOrigins', () => {
    it('prefers CORS_ORIGINS from the env', () =>
        expect(allowedOrigins({ CORS_ORIGINS: 'https://a.de, https://b.de' }, 'https://c.de')).toEqual(['https://a.de', 'https://b.de']));
    it('falls back to the public URL', () => expect(allowedOrigins({}, 'https://c.de')).toEqual(['https://c.de']));
    it('is empty without either (same-origin only)', () => expect(allowedOrigins({}, null)).toEqual([]));
});
```

`server/src/tests/setupRoute.test.ts`:
```ts
import express from 'express';
import request from 'supertest';
import { createSetupRouter, type SetupRouterDeps } from '../routes/setup';
import { authenticate } from '../lib/middleware';
import { ensureSetupSecrets, getSetupState, resetSetupStateForTests, setSetupState } from '../lib/setupState';
import type { Check } from '../lib/systemChecks';

const okChecks: Check[] = [{ id: 'database', label: 'Datenbank', status: 'ok', detail: 'ok' }];

function makeDeps(over: Partial<SetupRouterDeps> = {}): SetupRouterDeps & { completeSetup: jest.Mock } {
    return {
        runChecks: async () => okChecks,
        validateHSBI: async () => true,
        hashPassword: async (pw) => `hashed:${pw}`,
        completeSetup: jest.fn(async () => {}),
        ...over,
    } as SetupRouterDeps & { completeSetup: jest.Mock };
}

function makeApp(deps: SetupRouterDeps) {
    const app = express();
    app.use(express.json());
    app.use('/api/setup', createSetupRouter(deps));
    app.get('/api/protected', authenticate, (_req, res) => res.json({ ok: true }));
    return app;
}

const body = {
    publicUrl: 'https://curahub.hsbi.de/',
    localAdmin: { username: 'notfall', password: 'sehr-geheim-123' },
};

let code: string;
beforeEach(() => {
    resetSetupStateForTests();
    setSetupState({ complete: false, publicUrl: null });
    code = ensureSetupSecrets().code;
});
afterAll(() => setSetupState({ complete: true, publicUrl: null }));

async function token(app: express.Express): Promise<string> {
    const res = await request(app).post('/api/setup/verify-code').send({ code: code.toLowerCase() });
    expect(res.status).toBe(200);
    return res.body.token;
}

describe('setup API', () => {
    it('reports the status', async () => {
        const res = await request(makeApp(makeDeps())).get('/api/setup/status');
        expect(res.body).toEqual({ complete: false });
    });

    it('rejects a wrong code', async () => {
        const res = await request(makeApp(makeDeps())).post('/api/setup/verify-code').send({ code: 'AAAA-AAAA-AAAA' });
        expect(res.status).toBe(401);
    });

    it('requires the setup token', async () => {
        expect((await request(makeApp(makeDeps())).get('/api/setup/checks')).status).toBe(401);
    });

    it('never lets a setup token through authenticate', async () => {
        const app = makeApp(makeDeps());
        const t = await token(app);
        const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${t}`);
        expect(res.status).toBe(401);
    });

    it('returns checks and a suggested URL', async () => {
        const app = makeApp(makeDeps());
        const res = await request(app).get('/api/setup/checks').set('Authorization', `Bearer ${await token(app)}`).set('Host', 'x.de');
        expect(res.status).toBe(200);
        expect(res.body.checks).toEqual(okChecks);
        expect(res.body.suggestedPublicUrl).toBe('http://x.de');
    });

    it('reports an HSBI check result without storing anything', async () => {
        const deps = makeDeps({ validateHSBI: async () => false });
        const app = makeApp(deps);
        const res = await request(app).post('/api/setup/hsbi-check').set('Authorization', `Bearer ${await token(app)}`)
            .send({ username: 'mmuster', password: 'x' });
        expect(res.body).toEqual({ ok: false, reason: 'HSBI hat die Anmeldedaten abgelehnt.' });
        expect(deps.completeSetup).not.toHaveBeenCalled();
    });

    it('reports an unreachable hsbi.de', async () => {
        const app = makeApp(makeDeps({ validateHSBI: async () => { throw new Error('fetch failed'); } }));
        const res = await request(app).post('/api/setup/hsbi-check').set('Authorization', `Bearer ${await token(app)}`)
            .send({ username: 'mmuster', password: 'x' });
        expect(res.body).toEqual({ ok: false, reason: 'www.hsbi.de ist vom Server aus nicht erreichbar.' });
    });

    it('rejects an invalid body with 400', async () => {
        const app = makeApp(makeDeps());
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${await token(app)}`)
            .send({ ...body, publicUrl: 'http://curahub.hsbi.de' });
        expect(res.status).toBe(400);
    });

    it('refuses to complete while a check fails', async () => {
        const deps = makeDeps({ runChecks: async () => [{ id: 'ffmpeg', label: 'ffmpeg', status: 'fail', detail: 'fehlt' }] });
        const app = makeApp(deps);
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${await token(app)}`).send(body);
        expect(res.status).toBe(409);
        expect(deps.completeSetup).not.toHaveBeenCalled();
    });

    it('writes nothing when the HSBI admin is rejected', async () => {
        const deps = makeDeps({ validateHSBI: async () => false });
        const app = makeApp(deps);
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${await token(app)}`)
            .send({ ...body, hsbiAdmin: { username: 'mmuster', password: 'x' } });
        expect(res.status).toBe(422);
        expect(deps.completeSetup).not.toHaveBeenCalled();
        expect(getSetupState()?.complete).toBe(false);
    });

    it('completes, then locks every setup route but status', async () => {
        const deps = makeDeps();
        const app = makeApp(deps);
        const t = await token(app);
        const res = await request(app).post('/api/setup/complete').set('Authorization', `Bearer ${t}`)
            .send({ ...body, hsbiAdmin: { username: 'MMuster', password: 'x' } });
        expect(res.status).toBe(200);
        expect(deps.completeSetup).toHaveBeenCalledWith({
            publicUrl: 'https://curahub.hsbi.de',
            localAdmin: { username: 'notfall', passwordHash: 'hashed:sehr-geheim-123' },
            hsbiEmail: 'mmuster@hsbi.de',
        });
        expect(getSetupState()).toEqual({ complete: true, publicUrl: 'https://curahub.hsbi.de' });
        expect((await request(app).get('/api/setup/status')).body).toEqual({ complete: true });
        expect((await request(app).get('/api/setup/checks').set('Authorization', `Bearer ${t}`)).status).toBe(404);
        expect((await request(app).post('/api/setup/verify-code').send({ code })).status).toBe(404);
    });

    // Keep last: exhausts the per-IP code limit for this process.
    it('rate-limits code guessing', async () => {
        const app = makeApp(makeDeps());
        let last = 0;
        for (let i = 0; i < 6; i++) {
            last = (await request(app).post('/api/setup/verify-code').send({ code: 'BBBB-BBBB-BBBB' })).status;
        }
        expect(last).toBe(429);
    });
});
```

Note: the earlier tests in this file already call `verify-code` a few times from the same IP. The limiter must count only **failed** attempts (clear the bucket on success) so the happy-path tests stay under 5 failures; the rule is 5 failures per minute per IP.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && npx jest src/tests/setupValidation.test.ts src/tests/corsOrigins.test.ts src/tests/setupRoute.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`server/src/lib/setupValidation.ts`:
```ts
import { z } from 'zod';

// Mirrored in src/lib/setup/validation.ts (client) — keep both in sync.
export const LOCAL_USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

/** The instance's public origin: https, or plain http only for localhost tests. */
export function normalizePublicUrl(input: string): string | null {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return null;
    }
    const isHttps = url.protocol === 'https:';
    const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
    if (!isHttps && !isLocalHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
}

export const completeSetupSchema = z.object({
    publicUrl: z.string().refine((v) => normalizePublicUrl(v) !== null, 'Ungültige öffentliche Adresse'),
    localAdmin: z.object({
        username: z.string().regex(LOCAL_USERNAME_RE, 'Ungültiger Benutzername'),
        password: z.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH),
    }),
    hsbiAdmin: z.object({
        username: z.string().trim().min(1).max(100).refine((u) => !u.includes('@'), 'Nur die HSBI-Kennung, ohne @hsbi.de'),
        password: z.string().min(1).max(MAX_PASSWORD_LENGTH),
    }).optional(),
});

export type CompleteSetupBody = z.infer<typeof completeSetupSchema>;
```

`server/src/lib/setupStore.ts`:
```ts
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';
import { SETTING_COMPLETED, SETTING_PUBLIC_URL } from './setupState';

export interface CompleteSetupInput {
    publicUrl: string;
    localAdmin: { username: string; passwordHash: string };
    hsbiEmail: string | null;
}

export const PASSWORD_COST = 12;

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, PASSWORD_COST);
}

/** Everything the wizard writes, in one transaction — an aborted setup leaves nothing behind. */
export async function completeSetupInDb(prisma: PrismaClient, input: CompleteSetupInput): Promise<void> {
    const setting = (key: string, value: string) =>
        prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    const { username, passwordHash } = input.localAdmin;

    await prisma.$transaction([
        prisma.user.upsert({
            where: { email: username },
            create: { email: username, password_hash: passwordHash, role: 'admin' },
            update: { password_hash: passwordHash, role: 'admin' },
        }),
        ...(input.hsbiEmail
            ? [prisma.user.upsert({
                where: { email: input.hsbiEmail },
                create: { email: input.hsbiEmail, role: 'admin' },
                update: { role: 'admin' },
            })]
            : []),
        setting(SETTING_PUBLIC_URL, input.publicUrl),
        setting(SETTING_COMPLETED, new Date().toISOString()),
    ]);
}
```

`server/src/lib/corsOrigins.ts`:
```ts
/**
 * SEC-07: origins allowed to call the API cross-origin. CORS_ORIGINS (comma-separated) wins;
 * otherwise the public URL from the setup. Without either no CORS headers are sent — the SPA
 * is served from the same origin as the API and needs none.
 */
export function allowedOrigins(env: Record<string, string | undefined>, publicUrl: string | null): string[] {
    const fromEnv = (env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
    if (fromEnv.length > 0) return fromEnv;
    return publicUrl ? [publicUrl] : [];
}
```

`server/src/routes/setup.ts`:
```ts
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import type { Check } from '../lib/systemChecks';
import { completeSetupSchema } from '../lib/setupValidation';
import { normalizePublicUrl } from '../lib/setupValidation';
import type { CompleteSetupInput } from '../lib/setupStore';
import { createRateLimit, clientIp } from '../lib/rateLimit';
import { loginRateLimit } from '../lib/loginRateLimit';
import {
    codesMatch, getSetupCode, getSetupState, issueSetupToken, setSetupState, verifySetupToken,
} from '../lib/setupState';

export interface SetupRouterDeps {
    runChecks(req: Request): Promise<Check[]>;
    validateHSBI(username: string, password: string): Promise<boolean>;
    hashPassword(password: string): Promise<string>;
    completeSetup(input: CompleteSetupInput): Promise<void>;
}

const HSBI_REJECTED = 'HSBI hat die Anmeldedaten abgelehnt.';
const HSBI_UNREACHABLE = 'www.hsbi.de ist vom Server aus nicht erreichbar.';

const hsbiSchema = z.object({
    username: z.string().trim().min(1).max(100).refine((u) => !u.includes('@')),
    password: z.string().min(1).max(200),
});

async function checkHsbi(deps: SetupRouterDeps, username: string, password: string): Promise<string | null> {
    try {
        return (await deps.validateHSBI(username, password)) ? null : HSBI_REJECTED;
    } catch {
        return HSBI_UNREACHABLE;
    }
}

export function createSetupRouter(deps: SetupRouterDeps): Router {
    const router = Router();
    // 5 wrong codes per minute per IP; a correct code clears the bucket.
    const codeLimiter = createRateLimit(
        [{ windowMs: 60_000, max: 5, key: (ip) => `setup-code:${ip}` }],
        'Zu viele Versuche. Bitte eine Minute warten.',
    );

    router.get('/status', (_req, res) => {
        res.json({ complete: getSetupState()?.complete === true });
    });

    // Everything below exists only while the instance is not set up.
    router.use((_req, res, next) => {
        if (getSetupState()?.complete) {
            res.status(404).json({ error: 'Endpoint not found' });
            return;
        }
        next();
    });

    router.post('/verify-code', codeLimiter.middleware, (req, res) => {
        const code = typeof req.body?.code === 'string' ? req.body.code : '';
        const expected = getSetupCode();
        if (!expected || !codesMatch(code, expected)) {
            res.status(401).json({ error: 'Der Setup-Code ist falsch.' });
            return;
        }
        codeLimiter.clear(`setup-code:${clientIp(req)}`);
        res.json({ token: issueSetupToken() });
    });

    const requireSetupToken = (req: Request, res: Response, next: NextFunction) => {
        const token = req.headers.authorization?.split(' ')[1] ?? '';
        if (!verifySetupToken(token)) {
            res.status(401).json({ error: 'Setup-Sitzung abgelaufen. Bitte den Code erneut eingeben.' });
            return;
        }
        next();
    };

    router.get('/checks', requireSetupToken, async (req, res) => {
        const checks = await deps.runChecks(req);
        res.json({ checks, suggestedPublicUrl: `${req.protocol}://${req.get('host')}` });
    });

    router.post('/hsbi-check', requireSetupToken, loginRateLimit, async (req, res) => {
        const parsed = hsbiSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'HSBI-Kennung (ohne @hsbi.de) und Passwort angeben.' });
            return;
        }
        const username = parsed.data.username.toLowerCase();
        const failure = await checkHsbi(deps, username, parsed.data.password);
        res.json(failure ? { ok: false, reason: failure } : { ok: true, email: `${username}@hsbi.de` });
    });

    router.post('/complete', requireSetupToken, async (req, res) => {
        const parsed = completeSetupSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Eingaben ungültig.', issues: parsed.error.issues.map((i) => i.message) });
            return;
        }
        const { localAdmin, hsbiAdmin } = parsed.data;
        const publicUrl = normalizePublicUrl(parsed.data.publicUrl)!;

        const checks = await deps.runChecks(req);
        if (checks.some((c) => c.status === 'fail')) {
            res.status(409).json({ error: 'Der Systemcheck meldet Fehler.', checks });
            return;
        }

        let hsbiEmail: string | null = null;
        if (hsbiAdmin) {
            const username = hsbiAdmin.username.toLowerCase();
            const failure = await checkHsbi(deps, username, hsbiAdmin.password);
            if (failure) {
                res.status(422).json({ error: failure });
                return;
            }
            hsbiEmail = `${username}@hsbi.de`;
        }

        await deps.completeSetup({
            publicUrl,
            localAdmin: { username: localAdmin.username, passwordHash: await deps.hashPassword(localAdmin.password) },
            hsbiEmail,
        });
        setSetupState({ complete: true, publicUrl });
        console.log(`[Setup] Abgeschlossen: ${publicUrl}, Notfall-Admin "${localAdmin.username}"${hsbiEmail ? `, HSBI-Admin ${hsbiEmail}` : ''}`);
        res.json({ ok: true });
    });

    return router;
}
```
(Merge the two `setupValidation` imports into one line when writing the file.)

`server/src/index.ts`:
- Replace the CORS block (the `corsOrigins` const and its `app.use`) with:
```ts
// Apache (host) and cloudflared reach the container through the Docker bridge / loopback;
// trust their X-Forwarded-* so req.ip and req.protocol are the client's.
app.set('trust proxy', 'loopback, uniquelocal');

// --- CORS (SEC-07) --- see lib/corsOrigins.ts
app.use(cors({
    origin: (origin, callback) => {
        const allowed = allowedOrigins(process.env, getSetupState()?.publicUrl ?? null);
        callback(null, origin !== undefined && allowed.includes(origin));
    },
}));
```
- Imports: `allowedOrigins` from `./lib/corsOrigins`, `getSetupState` added to the `./lib/setupState` import, `createSetupRouter` from `./routes/setup`, `validateHSBI` added to the `./routes/auth` import, `defaultCheckDeps, requestInfo, runSystemChecks` from `./lib/systemChecks`, `completeSetupInDb, hashPassword` from `./lib/setupStore`.
- After the health routers:
```ts
const checkDeps = defaultCheckDeps(prisma, uploadsDirPath);
const setupRouter = createSetupRouter({
    runChecks: (req) => runSystemChecks(checkDeps, requestInfo(req)),
    validateHSBI,
    hashPassword,
    completeSetup: (input) => completeSetupInDb(prisma, input),
});
app.use('/setup', setupRouter);
app.use('/api/setup', setupRouter);
```
(`uploadsDirPath` is declared a few lines lower today — move its declaration up above the gate so both use it.)

- [ ] **Step 5: Run tests**

Run: `cd server && npx jest src/tests/setupValidation.test.ts src/tests/corsOrigins.test.ts src/tests/setupRoute.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/src/lib/setupValidation.ts server/src/lib/setupStore.ts server/src/lib/corsOrigins.ts server/src/routes/setup.ts server/src/index.ts server/src/tests/setupValidation.test.ts server/src/tests/corsOrigins.test.ts server/src/tests/setupRoute.test.ts
git commit -m "feat(server): setup API (code, checks, HSBI check, completion), CORS from the public URL, trust proxy"
```

---

### Task 5: Emergency login and shell scripts

**Files:**
- Create: `server/src/lib/localLogin.ts`, `server/src/scripts/reset-local-admin.ts`, `server/src/scripts/reset-setup.ts`
- Modify: `server/src/routes/auth.ts` (new route after `/login`), `server/package.json` (remove `"prisma": { "seed": … }`)
- Delete: `server/prisma/seed.ts`
- Test: `server/src/tests/localLogin.test.ts`

**Interfaces:**
- Consumes: `createRateLimit` (Task 1), `JWT_SECRET` (Task 1), `hashPassword`, `PASSWORD_COST` (Task 4), `LOCAL_USERNAME_RE`, `MIN_PASSWORD_LENGTH` (Task 4), `SETTING_COMPLETED` (Task 2).
- Produces: `LocalUser = { id: number; email: string; role: string; password_hash: string | null }`; `verifyLocalLogin(findUser: (email: string) => Promise<LocalUser | null>, username: string, password: string): Promise<LocalUser | null>`; route `POST /auth/local-login` → `{ token, user: { id, email, role } }` or `401 { error: 'Benutzername oder Passwort falsch.' }`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/localLogin.test.ts`:
```ts
import bcrypt from 'bcryptjs';
import { verifyLocalLogin, type LocalUser } from '../lib/localLogin';

let admin: LocalUser;
beforeAll(async () => {
    admin = { id: 1, email: 'notfall', role: 'admin', password_hash: await bcrypt.hash('sehr-geheim-123', 4) };
});

const finder = (users: LocalUser[]) => jest.fn(async (email: string) => users.find((u) => u.email === email) ?? null);

describe('verifyLocalLogin', () => {
    it('returns the user for the right password', async () => {
        await expect(verifyLocalLogin(finder([admin]), ' Notfall ', 'sehr-geheim-123')).resolves.toBe(admin);
    });
    it('rejects a wrong password', async () => {
        await expect(verifyLocalLogin(finder([admin]), 'notfall', 'falsch')).resolves.toBeNull();
    });
    it('rejects unknown users (still runs a bcrypt compare)', async () => {
        await expect(verifyLocalLogin(finder([]), 'niemand', 'sehr-geheim-123')).resolves.toBeNull();
    });
    it('never looks up names with @ (HSBI accounts)', async () => {
        const find = finder([admin]);
        await expect(verifyLocalLogin(find, 'm@hsbi.de', 'x')).resolves.toBeNull();
        expect(find).not.toHaveBeenCalled();
    });
    it('rejects accounts without a password hash', async () => {
        const hsbiLike = { ...admin, password_hash: null };
        await expect(verifyLocalLogin(finder([hsbiLike]), 'notfall', 'sehr-geheim-123')).resolves.toBeNull();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx jest src/tests/localLogin.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`server/src/lib/localLogin.ts`:
```ts
import bcrypt from 'bcryptjs';

/**
 * Emergency login for local accounts (User.email = a username without "@", set in the setup
 * wizard or by scripts/reset-local-admin). HSBI accounts always have "@hsbi.de" and never
 * log in here.
 */
export interface LocalUser {
    id: number;
    email: string;
    role: string;
    password_hash: string | null;
}

// Compared against for unknown users so the response time does not reveal which names exist.
let dummyHash: string | null = null;
function getDummyHash(): string {
    dummyHash ??= bcrypt.hashSync('curahub-dummy-password', 12);
    return dummyHash;
}

export async function verifyLocalLogin(
    findUser: (email: string) => Promise<LocalUser | null>,
    username: string,
    password: string,
): Promise<LocalUser | null> {
    const name = username.trim().toLowerCase();
    if (!name || name.includes('@')) return null;
    const user = await findUser(name);
    const matches = await bcrypt.compare(password, user?.password_hash ?? getDummyHash());
    return matches && user?.password_hash ? user : null;
}
```

`server/src/routes/auth.ts` — imports `verifyLocalLogin` from `../lib/localLogin` and `createRateLimit` from `../lib/rateLimit`; add after the `/login` handler:
```ts
// ─── Emergency login (local accounts) ─────────────────────────────────────────

const localLoginLimiter = createRateLimit([
    { windowMs: 15 * 60_000, max: 5, key: (ip, username) => (username ? `local-ip-user:${ip}:${username}` : null) },
    { windowMs: 15 * 60_000, max: 20, key: (_ip, username) => (username ? `local-user:${username}` : null) },
], 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.');

authRouter.post('/local-login', localLoginLimiter.middleware, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Benutzername und Passwort sind erforderlich' });
  }
  try {
    const user = await verifyLocalLogin(
      (email) => prisma.user.findUnique({ where: { email } }),
      parsed.data.username,
      parsed.data.password,
    );
    if (!user) return res.status(401).json({ error: 'Benutzername oder Passwort falsch.' });
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: TOKEN_TTL });
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    console.error('[Auth Error] local login:', error);
    res.status(500).json({ error: 'Anmeldung fehlgeschlagen' });
  }
});
```

`server/src/scripts/reset-local-admin.ts`:
```ts
/**
 * Sets (or creates) a local emergency admin — for a lost password.
 * Run: docker compose exec app node dist/scripts/reset-local-admin.js <benutzername>
 */
import 'dotenv/config';
import '../lib/loadSecretEnv';
import readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../lib/setupStore';
import { LOCAL_USERNAME_RE, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '../lib/setupValidation';

function askHidden(question: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        process.stdout.write(question);
        // Suppress the echo of typed characters.
        (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
        rl.question('', (answer) => {
            rl.close();
            process.stdout.write('\n');
            resolve(answer);
        });
    });
}

async function main() {
    const username = (process.argv[2] ?? '').trim().toLowerCase();
    if (!LOCAL_USERNAME_RE.test(username)) {
        console.error('Aufruf: node dist/scripts/reset-local-admin.js <benutzername>  (3–32 Zeichen: a–z, 0–9, . _ -)');
        process.exit(1);
    }
    const password = await askHidden('Neues Passwort: ');
    const repeat = await askHidden('Passwort wiederholen: ');
    if (password !== repeat) throw new Error('Die Passwörter stimmen nicht überein.');
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        throw new Error(`Das Passwort muss ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} Zeichen lang sein.`);
    }

    const prisma = new PrismaClient();
    try {
        const passwordHash = await hashPassword(password);
        await prisma.user.upsert({
            where: { email: username },
            create: { email: username, password_hash: passwordHash, role: 'admin' },
            update: { password_hash: passwordHash, role: 'admin' },
        });
        console.log(`Notfall-Admin "${username}" gesetzt. Anmeldung über „Notfall-Login" auf der Login-Seite.`);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
});
```

`server/src/scripts/reset-setup.ts`:
```ts
/**
 * Re-opens the setup wizard (users and data are kept). Afterwards restart the app;
 * the new setup code appears in `docker compose logs app`.
 * Run: docker compose exec app node dist/scripts/reset-setup.js
 */
import 'dotenv/config';
import '../lib/loadSecretEnv';
import { PrismaClient } from '@prisma/client';
import { SETTING_COMPLETED } from '../lib/setupState';

async function main() {
    const prisma = new PrismaClient();
    try {
        await prisma.systemSetting.deleteMany({ where: { key: SETTING_COMPLETED } });
        console.log('Setup wieder geöffnet. Jetzt neu starten: docker compose restart app');
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
```

Delete `server/prisma/seed.ts`; remove the `"prisma": { "seed": "ts-node prisma/seed.ts" }` block from `server/package.json`.

- [ ] **Step 4: Run tests + build**

Run: `cd server && npx jest src/tests/localLogin.test.ts && npm run build`
Expected: PASS; `dist/scripts/reset-local-admin.js` and `dist/scripts/reset-setup.js` exist.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/localLogin.ts server/src/routes/auth.ts server/src/scripts/reset-local-admin.ts server/src/scripts/reset-setup.ts server/package.json server/src/tests/localLogin.test.ts
git rm server/prisma/seed.ts
git commit -m "feat(auth): emergency login for local admins, reset scripts, drop the password seed"
```

---

### Task 6: Admin „System" endpoint

**Files:**
- Modify: `server/src/routes/admin.ts` (new route), `server/src/index.ts` (pass deps)
- Test: `server/src/tests/adminSystem.test.ts` (`requireAdmin` reads the role from the JWT, so no DB is needed)

**Interfaces:**
- Consumes: `runSystemChecks`, `requestInfo`, `CheckDeps` (Task 3), `getSetupState` (Task 2), `JWT_SECRET` (Task 1).
- Produces: `setAdminSystemDeps(deps: CheckDeps): void`; `GET /admin/system` → `{ checks: Check[]; publicUrl: string | null; version: string }`.

- [ ] **Step 1: Write the failing test**

`server/src/tests/adminSystem.test.ts`:
```ts
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../index';
import { setAdminSystemDeps } from '../routes/admin';
import { JWT_SECRET } from '../lib/jwtSecret';

beforeAll(() => {
    setAdminSystemDeps({
        pingDb: async () => {}, migrationRows: async () => ({ finished: 1, failed: 0 }), migrationFolderCount: () => 1,
        uploadsDir: '/tmp', writeProbe: async () => {}, run: async () => {}, freeBytes: async () => 100 * 1024 ** 3,
        reachHsbi: async () => {},
    });
});

describe('GET /admin/system', () => {
    it('is admin-only', async () => {
        const token = jwt.sign({ userId: 1, role: 'curator' }, JWT_SECRET);
        expect((await request(app).get('/api/admin/system').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    });
    it('returns checks, public URL and version for admins', async () => {
        const token = jwt.sign({ userId: 1, role: 'admin' }, JWT_SECRET);
        const res = await request(app).get('/api/admin/system').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.checks).toHaveLength(8);
        expect(res.body).toHaveProperty('publicUrl');
        expect(typeof res.body.version).toBe('string');
    });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx jest src/tests/adminSystem.test.ts`
Expected: FAIL — `setAdminSystemDeps` is not exported.

- [ ] **Step 3: Implement**

`server/src/routes/admin.ts` — imports `runSystemChecks, requestInfo, type CheckDeps` from `../lib/systemChecks`, `getSetupState` from `../lib/setupState`; add after `adminRouter.use(authenticate, requireAdmin);`:
```ts
// ─── GET /admin/system ────────────────────────────────────────────────────────
// Read-only health of the instance (same checks as the setup wizard).

let systemDeps: CheckDeps | null = null;
export function setAdminSystemDeps(deps: CheckDeps): void {
  systemDeps = deps;
}

adminRouter.get('/system', async (req, res) => {
  if (!systemDeps) return res.status(503).json({ error: 'Systemcheck nicht verfügbar' });
  const checks = await runSystemChecks(systemDeps, requestInfo(req));
  res.json({
    checks,
    publicUrl: getSetupState()?.publicUrl ?? null,
    version: process.env.DEPLOYED_COMMIT || process.env.npm_package_version || 'unbekannt',
  });
});
```
`server/src/index.ts`: import `setAdminSystemDeps` from `./routes/admin`; right after `const checkDeps = …` add `setAdminSystemDeps(checkDeps);`.

- [ ] **Step 4: Run test**

Run: `cd server && npx jest src/tests/adminSystem.test.ts`
Expected: PASS (the test overrides the deps index.ts set).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/admin.ts server/src/index.ts server/src/tests/adminSystem.test.ts
git commit -m "feat(admin): read-only system check endpoint"
```

---

### Task 7: Client — setup wizard, gate, emergency login, admin system block

**Files:**
- Create: `src/lib/setup/validation.ts`, `src/lib/setup/validation.test.ts`, `src/lib/setup/setupApi.ts`, `src/components/AuthBackdrop.tsx`, `src/components/setup/SetupGate.tsx`, `src/components/setup/SystemCheckList.tsx`, `src/components/setup/SetupSteps.tsx`, `src/pages/SetupPage.tsx`
- Modify: `src/App.tsx`, `src/pages/LoginPage.tsx`, `src/pages/UsersPage.tsx`

**Interfaces:**
- Consumes (HTTP): `GET /api/setup/status` → `{complete}`; `POST /api/setup/verify-code {code}` → `{token}` | 401/429 `{error}`; `GET /api/setup/checks` → `{checks, suggestedPublicUrl}`; `POST /api/setup/hsbi-check {username,password}` → `{ok:true,email}|{ok:false,reason}`; `POST /api/setup/complete {publicUrl, localAdmin, hsbiAdmin?}` → `{ok:true}` | 400/409/422 `{error}`; any setup call → 401 when the token expired; `POST /auth/local-login {username,password}` → `{token,user}`; `GET /admin/system` → `{checks, publicUrl, version}`.
- Produces: `normalizePublicUrl(input: string): string | null`; `usernameProblem(name: string): string | null`; `passwordProblem(pw: string, repeat: string): string | null`; `SetupCheck` type; `setupApi` functions; `SetupExpiredError`; `<SetupGate>`; `<SystemCheckList checks={SetupCheck[]} />`; `<AuthBackdrop>{children}</AuthBackdrop>`.

- [ ] **Step 1: Write the failing test**

`src/lib/setup/validation.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/setup/validation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement validation + API client**

`src/lib/setup/validation.ts`:
```ts
// Mirror of server/src/lib/setupValidation.ts — keep both in sync.
export const LOCAL_USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 200;

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function normalizePublicUrl(input: string): string | null {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        return null;
    }
    const isHttps = url.protocol === 'https:';
    const isLocalHttp = url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname);
    if (!isHttps && !isLocalHttp) return null;
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.pathname !== '/' && url.pathname !== '') return null;
    return url.origin;
}

export function usernameProblem(name: string): string | null {
    if (name.length < 3 || name.length > 32) return 'Der Benutzername muss 3–32 Zeichen lang sein.';
    if (!LOCAL_USERNAME_RE.test(name)) return 'Erlaubt sind nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.';
    return null;
}

export function passwordProblem(password: string, repeat: string): string | null {
    if (password.length < MIN_PASSWORD_LENGTH) return `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
    if (password.length > MAX_PASSWORD_LENGTH) return `Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen haben.`;
    if (password !== repeat) return 'Die Passwörter stimmen nicht überein.';
    return null;
}
```

`src/lib/setup/setupApi.ts`:
```ts
export type SetupCheckStatus = 'ok' | 'warn' | 'fail';
export interface SetupCheck { id: string; label: string; status: SetupCheckStatus; detail: string }

export interface CompleteSetupBody {
    publicUrl: string;
    localAdmin: { username: string; password: string };
    hsbiAdmin?: { username: string; password: string };
}

/** The setup token expired or the server restarted (new code) — the wizard starts over. */
export class SetupExpiredError extends Error {}

async function call<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/setup${path}`, { ...init, headers });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && token) throw new SetupExpiredError(data.error ?? 'Setup-Sitzung abgelaufen.');
    if (!res.ok) throw new Error(data.error ?? 'Unerwarteter Fehler.');
    return data as T;
}

export const setupApi = {
    status: () => call<{ complete: boolean }>('/status'),
    verifyCode: (code: string) => call<{ token: string }>('/verify-code', { method: 'POST', body: JSON.stringify({ code }) }),
    checks: (token: string) => call<{ checks: SetupCheck[]; suggestedPublicUrl: string }>('/checks', {}, token),
    hsbiCheck: (token: string, username: string, password: string) =>
        call<{ ok: true; email: string } | { ok: false; reason: string }>(
            '/hsbi-check', { method: 'POST', body: JSON.stringify({ username, password }) }, token),
    complete: (token: string, body: CompleteSetupBody) =>
        call<{ ok: true }>('/complete', { method: 'POST', body: JSON.stringify(body) }, token),
};
```

Run: `npx vitest run src/lib/setup/validation.test.ts` → PASS.

- [ ] **Step 4: Shared backdrop + check list**

`src/components/AuthBackdrop.tsx` — move the outer `<div>` with the radial background, the grid overlay, the central glow and the brand mark (HSBI / CuraHub) and the footer line out of `LoginPage.tsx` unchanged:
```tsx
import type { ReactNode } from 'react';

/** Dark gallery-grid background with the CuraHub mark — shared by login and setup. */
export function AuthBackdrop({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 90% 70% at 50% 45%, #17171f 0%, #0c0c10 55%, #07070a 100%)' }}
    >
      {/* …grid overlay and glow divs exactly as in LoginPage today… */}
      <div className={`relative z-10 w-full ${wide ? 'max-w-lg' : 'max-w-sm'} flex flex-col items-center gap-7`}>
        {/* …brand mark block exactly as in LoginPage today… */}
        {children}
        {/* …footer <p> exactly as in LoginPage today… */}
      </div>
    </div>
  );
}
```
Copy the three marked blocks verbatim from `LoginPage.tsx` lines ~57–99 and ~203–209 (they are the grid `div`, the glow `div`, the brand `div` and the footer `p`). `LoginPage` then renders `<AuthBackdrop><Card …/></AuthBackdrop>`.

Also export the card/input style objects used by LoginPage so the setup steps look identical — add to `AuthBackdrop.tsx`:
```tsx
export const AUTH_CARD_STYLE = {
  background: 'rgba(255,255,255,0.035)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderColor: 'rgba(255,255,255,0.09)',
  boxShadow: '0 32px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset',
} as const;
export const AUTH_INPUT_STYLE = {
  background: 'rgba(255,255,255,0.05)',
  borderColor: 'rgba(255,255,255,0.1)',
  color: 'rgba(255,255,255,0.88)',
} as const;
export const AUTH_INPUT_CLASS = 'placeholder:text-white/25 focus-visible:ring-white/20 focus-visible:border-white/25';
export const AUTH_LABEL_CLASS = 'text-[11px] font-medium uppercase';
export const AUTH_LABEL_STYLE = { letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' } as const;
export const AUTH_ERROR_STYLE = {
  color: 'rgba(248,113,113,0.9)', background: 'rgba(127,29,29,0.2)', border: '1px solid rgba(239,68,68,0.2)',
} as const;
export const AUTH_BUTTON_STYLE = { background: 'rgba(255,255,255,0.92)', color: '#0a0a0c', letterSpacing: '0.02em' } as const;
```
and use them in LoginPage in place of the inline objects.

`src/components/setup/SystemCheckList.tsx`:
```tsx
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import type { SetupCheck } from '@/lib/setup/setupApi';

const ICON = {
  ok: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-label="OK" />,
  warn: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" aria-label="Warnung" />,
  fail: <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-label="Fehler" />,
};

export function SystemCheckList({ checks }: { checks: SetupCheck[] }) {
  return (
    <ul className="grid gap-2.5">
      {checks.map((c) => (
        <li key={c.id} className="flex gap-2.5 text-sm">
          {ICON[c.status]}
          <div>
            <div className="text-white/85">{c.label}</div>
            <div className="text-white/40 text-xs">{c.detail}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Wizard steps and page**

`src/components/setup/SetupSteps.tsx` — one small component per step; each receives its values and callbacks, no fetching:
```tsx
import { useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AUTH_BUTTON_STYLE, AUTH_ERROR_STYLE, AUTH_INPUT_CLASS, AUTH_INPUT_STYLE, AUTH_LABEL_CLASS, AUTH_LABEL_STYLE,
} from '@/components/AuthBackdrop';
import { SystemCheckList } from './SystemCheckList';
import type { SetupCheck } from '@/lib/setup/setupApi';
import { normalizePublicUrl, passwordProblem, usernameProblem } from '@/lib/setup/validation';

export function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="text-sm font-medium rounded-md px-3 py-2" style={AUTH_ERROR_STYLE}>{children}</div>;
}

export function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className={AUTH_LABEL_CLASS} style={AUTH_LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

function TextInput(props: React.ComponentProps<typeof Input>) {
  return <Input {...props} style={AUTH_INPUT_STYLE} className={AUTH_INPUT_CLASS} />;
}

export function PrimaryButton({ busy, children, ...rest }: React.ComponentProps<typeof Button> & { busy?: boolean }) {
  return (
    <Button {...rest} disabled={busy || rest.disabled} className="w-full mt-1 font-medium" style={AUTH_BUTTON_STYLE}>
      {children}
    </Button>
  );
}

export function CodeStep({ onSubmit, error, busy }: { onSubmit: (code: string) => void; error: string | null; busy: boolean }) {
  const [code, setCode] = useState('');
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); onSubmit(code); }}>
      <p className="text-sm text-white/50">
        Den Setup-Code findest du im Log der App: <code className="text-white/75">docker compose logs app</code>
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field id="setup-code" label="Setup-Code">
        <TextInput id="setup-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXX-XXXX-XXXX" autoComplete="off" autoFocus required />
      </Field>
      <PrimaryButton type="submit" busy={busy}>Weiter</PrimaryButton>
    </form>
  );
}

export function ChecksStep({ checks, onRecheck, onNext, busy }: { checks: SetupCheck[]; onRecheck: () => void; onNext: () => void; busy: boolean }) {
  const blocked = checks.some((c) => c.status === 'fail');
  return (
    <div className="grid gap-4">
      <SystemCheckList checks={checks} />
      {blocked && <ErrorBox>Rot markierte Punkte müssen behoben werden, bevor es weitergeht.</ErrorBox>}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onRecheck} disabled={busy}>Erneut prüfen</Button>
        <PrimaryButton type="button" onClick={onNext} disabled={blocked} busy={busy}>Weiter</PrimaryButton>
      </div>
    </div>
  );
}

export function UrlStep({ initial, onNext }: { initial: string; onNext: (url: string) => void }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      const url = normalizePublicUrl(value);
      if (!url) { setError('Bitte eine https-Adresse ohne Pfad angeben, z. B. https://curahub.hsbi.de'); return; }
      onNext(url);
    }}>
      <p className="text-sm text-white/50">Unter dieser Adresse ist CuraHub öffentlich erreichbar. Nur diese Adresse darf die API aus dem Browser aufrufen.</p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field id="public-url" label="Öffentliche Adresse">
        <TextInput id="public-url" value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://curahub.hsbi.de" required />
      </Field>
      <PrimaryButton type="submit">Weiter</PrimaryButton>
    </form>
  );
}

export function LocalAdminStep({ onNext }: { onNext: (username: string, password: string) => void }) {
  const [username, setUsername] = useState('notfall');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => {
      e.preventDefault();
      const problem = usernameProblem(username) ?? passwordProblem(password, repeat);
      if (problem) { setError(problem); return; }
      onNext(username, password);
    }}>
      <p className="text-sm text-white/50">
        Dieses Konto funktioniert auch, wenn der HSBI-Login ausfällt. Bewahre das Passwort sicher auf, z. B. im Passwort-Manager.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      <Field id="local-user" label="Benutzername">
        <TextInput id="local-user" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoComplete="username" required />
      </Field>
      <Field id="local-pw" label="Passwort (mind. 12 Zeichen)">
        <TextInput id="local-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />
      </Field>
      <Field id="local-pw2" label="Passwort wiederholen">
        <TextInput id="local-pw2" type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" required />
      </Field>
      <PrimaryButton type="submit">Weiter</PrimaryButton>
    </form>
  );
}

export function HsbiAdminStep({ onCheck, onSkip, onNext, verifiedEmail, error, busy }: {
  onCheck: (username: string, password: string) => void;
  onSkip: () => void;
  onNext: () => void;
  verifiedEmail: string | null;
  error: string | null;
  busy: boolean;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); onCheck(username.trim(), password); }}>
      <p className="text-sm text-white/50">
        Optional: Dein HSBI-Konto wird Admin. Die Prüfung zeigt gleichzeitig, dass der HSBI-Login vom neuen Server aus funktioniert. Das Passwort wird nicht gespeichert.
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {verifiedEmail ? (
        <>
          <p className="text-sm text-emerald-400">Geprüft: {verifiedEmail} wird Admin.</p>
          <PrimaryButton type="button" onClick={onNext}>Weiter</PrimaryButton>
        </>
      ) : (
        <>
          <Field id="hsbi-user" label="HSBI-Kennung">
            <TextInput id="hsbi-user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="amustermann" autoComplete="username" required />
          </Field>
          <Field id="hsbi-pw" label="HSBI-Passwort">
            <TextInput id="hsbi-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={onSkip}>Überspringen</Button>
            <PrimaryButton type="submit" busy={busy}>Prüfen</PrimaryButton>
          </div>
        </>
      )}
    </form>
  );
}

export function SummaryStep({ publicUrl, localUsername, hsbiEmail, onFinish, error, busy }: {
  publicUrl: string; localUsername: string; hsbiEmail: string | null;
  onFinish: () => void; error: string | null; busy: boolean;
}) {
  return (
    <div className="grid gap-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      <dl className="grid gap-2 text-sm">
        <div><dt className="text-white/40 text-xs">Öffentliche Adresse</dt><dd className="text-white/85">{publicUrl}</dd></div>
        <div><dt className="text-white/40 text-xs">Notfall-Admin</dt><dd className="text-white/85">{localUsername}</dd></div>
        <div><dt className="text-white/40 text-xs">HSBI-Admin</dt><dd className="text-white/85">{hsbiEmail ?? 'übersprungen'}</dd></div>
      </dl>
      <PrimaryButton type="button" onClick={onFinish} busy={busy}>Setup abschließen</PrimaryButton>
    </div>
  );
}
```

`src/pages/SetupPage.tsx`:
```tsx
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthBackdrop, AUTH_CARD_STYLE } from '@/components/AuthBackdrop';
import { ChecksStep, CodeStep, HsbiAdminStep, LocalAdminStep, PrimaryButton, SummaryStep, UrlStep } from '@/components/setup/SetupSteps';
import { setupApi, SetupExpiredError, type SetupCheck } from '@/lib/setup/setupApi';

type Step = 'code' | 'checks' | 'url' | 'local' | 'hsbi' | 'summary' | 'done';

const TITLES: Record<Step, [string, string]> = {
  code: ['Einrichtung', 'Schritt 1 von 6 · Setup-Code'],
  checks: ['Systemcheck', 'Schritt 2 von 6'],
  url: ['Öffentliche Adresse', 'Schritt 3 von 6'],
  local: ['Notfall-Admin', 'Schritt 4 von 6'],
  hsbi: ['HSBI-Admin', 'Schritt 5 von 6 · optional'],
  summary: ['Zusammenfassung', 'Schritt 6 von 6'],
  done: ['Fertig', 'CuraHub ist eingerichtet.'],
};

export function SetupPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('code');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<SetupCheck[]>([]);
  const [publicUrl, setPublicUrl] = useState('');
  const [suggestedUrl, setSuggestedUrl] = useState('');
  const [localAdmin, setLocalAdmin] = useState<{ username: string; password: string } | null>(null);
  const [hsbi, setHsbi] = useState<{ username: string; password: string; email: string } | null>(null);

  /** Runs a request; an expired session (restart, 30 min) sends the wizard back to the code step. */
  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      if (err instanceof SetupExpiredError) {
        setToken(null);
        setStep('code');
      }
      setError(err instanceof Error ? err.message : 'Unerwarteter Fehler.');
    } finally {
      setBusy(false);
    }
  }, []);

  const loadChecks = (t: string) => run(async () => {
    const data = await setupApi.checks(t);
    setChecks(data.checks);
    setSuggestedUrl(data.suggestedPublicUrl);
  });

  const [title, description] = TITLES[step];

  return (
    <AuthBackdrop wide>
      <Card className="w-full border" style={AUTH_CARD_STYLE}>
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-light" style={{ fontFamily: '"Funnel Display", sans-serif', color: 'rgba(255,255,255,0.88)' }}>
            {title}
          </CardTitle>
          <CardDescription style={{ color: 'rgba(255,255,255,0.38)' }}>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {step === 'code' && (
            <CodeStep busy={busy} error={error} onSubmit={(code) => run(async () => {
              const { token: t } = await setupApi.verifyCode(code);
              setToken(t);
              setStep('checks');
              await loadChecks(t);
            })} />
          )}
          {step === 'checks' && token && (
            <ChecksStep checks={checks} busy={busy} onRecheck={() => loadChecks(token)} onNext={() => setStep('url')} />
          )}
          {step === 'url' && (
            <UrlStep initial={publicUrl || suggestedUrl} onNext={(url) => { setPublicUrl(url); setStep('local'); }} />
          )}
          {step === 'local' && (
            <LocalAdminStep onNext={(username, password) => { setLocalAdmin({ username, password }); setStep('hsbi'); }} />
          )}
          {step === 'hsbi' && token && (
            <HsbiAdminStep
              busy={busy}
              error={error}
              verifiedEmail={hsbi?.email ?? null}
              onSkip={() => { setHsbi(null); setError(null); setStep('summary'); }}
              onNext={() => setStep('summary')}
              onCheck={(username, password) => run(async () => {
                const result = await setupApi.hsbiCheck(token, username, password);
                if (result.ok) setHsbi({ username, password, email: result.email });
                else setError(result.reason);
              })}
            />
          )}
          {step === 'summary' && token && localAdmin && (
            <SummaryStep
              busy={busy}
              error={error}
              publicUrl={publicUrl}
              localUsername={localAdmin.username}
              hsbiEmail={hsbi?.email ?? null}
              onFinish={() => run(async () => {
                await setupApi.complete(token, {
                  publicUrl,
                  localAdmin,
                  ...(hsbi ? { hsbiAdmin: { username: hsbi.username, password: hsbi.password } } : {}),
                });
                setLocalAdmin(null);
                setHsbi(null);
                setStep('done');
              })}
            />
          )}
          {step === 'done' && (
            <div className="grid gap-4">
              <p className="text-sm text-white/50">
                Die Einrichtung ist abgeschlossen und gesperrt. Melde dich jetzt mit deinem HSBI-Konto oder über „Notfall-Login" an.
              </p>
              <PrimaryButton type="button" onClick={() => navigate('/login', { replace: true })}>Zum Login</PrimaryButton>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthBackdrop>
  );
}
```

`src/components/setup/SetupGate.tsx`:
```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { setupApi } from '@/lib/setup/setupApi';

/**
 * Sends every page to /setup until the instance is set up, and /setup to /login afterwards.
 * If the status request fails the app renders normally (the server gate still protects the API).
 */
export function SetupGate({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const location = useLocation();
  const [complete, setComplete] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    setupApi.status()
      .then((s) => { if (!cancelled) setComplete(s.complete); })
      .catch(() => { if (!cancelled) setComplete(true); });
    return () => { cancelled = true; };
  }, [location.pathname === '/setup']);

  if (complete === null) return <>{fallback}</>;
  if (!complete && location.pathname !== '/setup') return <Navigate to="/setup" replace />;
  if (complete && location.pathname === '/setup') return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```
The effect dependency re-checks the status when the user leaves `/setup` (after „Zum Login"), so the redirect goes the right way. ESLint's `react-hooks/exhaustive-deps` accepts an expression dependency with a warning — if it flags it, compute `const onSetupPage = location.pathname === '/setup';` above the effect and depend on `onSetupPage`.

`src/App.tsx`:
- `const SetupPage = lazy(() => import('./pages/SetupPage').then((m) => ({ default: m.SetupPage })));`
- `import { SetupGate } from './components/setup/SetupGate';`
- Wrap `<Routes>` in `<SetupGate fallback={<RouteFallback />}>…</SetupGate>` inside the `Suspense`, and add `<Route path="/setup" element={<SetupPage />} />` next to `/login`.

- [ ] **Step 6: Emergency login on LoginPage**

`src/pages/LoginPage.tsx`:
- `const [mode, setMode] = useState<'hsbi' | 'local'>('hsbi');`
- `fetch(mode === 'hsbi' ? '/auth/login' : '/auth/local-login', …)` in `handleSubmit`.
- `CardDescription`: `{mode === 'hsbi' ? 'Melde dich mit deinem HSBI-Account an.' : 'Lokales Admin-Konto — nur für den Notfall.'}`; `CardTitle`: `{mode === 'hsbi' ? 'Anmelden' : 'Notfall-Login'}`.
- Password placeholder: `mode === 'hsbi' ? 'Dein HSBI Passwort' : 'Passwort'`; username placeholder `mode === 'hsbi' ? 'amustermann' : 'notfall'`.
- Below the submit button, inside the form:
```tsx
<button
  type="button"
  onClick={() => { setMode(mode === 'hsbi' ? 'local' : 'hsbi'); setError(''); }}
  className="text-xs text-center text-white/30 hover:text-white/60 transition-colors"
>
  {mode === 'hsbi' ? 'Notfall-Login' : 'Zurück zum HSBI-Login'}
</button>
```

- [ ] **Step 7: System block and „lokal" badge on UsersPage**

`src/pages/UsersPage.tsx`:
- Import `SystemCheckList` and `type SetupCheck`.
- State `const [system, setSystem] = useState<{ checks: SetupCheck[]; publicUrl: string | null; version: string } | null>(null);`
- Second effect: `fetch('/admin/system', { headers: { Authorization: \`Bearer ${token}\` } })` → `setSystem(await res.json())` when `res.ok` (ignore errors; the block then stays hidden).
- Above the users table:
```tsx
{system && (
  <section className="border border-zinc-800 rounded-xl p-5 mb-8">
    <div className="flex items-baseline justify-between mb-4">
      <h2 className="font-display text-lg font-light">System</h2>
      <span className="text-xs text-zinc-500">{system.publicUrl ?? 'keine öffentliche Adresse gesetzt'} · Version {system.version}</span>
    </div>
    <SystemCheckList checks={system.checks} />
  </section>
)}
```
- In the e-mail cell: after `{u.email.split('@')[0]}` add `{!u.email.includes('@') && <span className="ml-2 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">lokal</span>}`.

- [ ] **Step 8: Verify**

Run: `npm run test && npm run lint && npm run build`
Expected: all Vitest suites pass (incl. `validation.test.ts`), no lint errors, build succeeds.

- [ ] **Step 9: Commit**

```bash
git add src/lib/setup src/components/AuthBackdrop.tsx src/components/setup src/pages/SetupPage.tsx src/pages/LoginPage.tsx src/pages/UsersPage.tsx src/App.tsx
git commit -m "feat(ui): first-run setup wizard, emergency login, system checks for admins"
```

---

### Task 8: Compose, secrets init, Apache snippet, docs

**Files:**
- Modify: `docker-compose.yml` (whole file), `.env.example` (whole file), `CLAUDE.md` (commands + new section)
- Create: `deploy/init-secrets.sh`, `deploy/apache/curahub.conf`, `docs/deployment.md`

**Interfaces:**
- Consumes: secret file names from Task 1 (`db_root_password`, `db_password`, `jwt_secret`), mount point `/run/curahub-secrets`, `/api/health` from Task 2, scripts from Task 5.

- [ ] **Step 1: `deploy/init-secrets.sh`**

```sh
#!/bin/sh
# Runs as the compose `init` service before the database starts: creates the random secrets
# on the very first start and never touches existing ones.
set -eu
umask 077
for name in db_root_password db_password jwt_secret; do
  file="/secrets/$name"
  if [ ! -s "$file" ]; then
    head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$file"
    echo "[init] $name erzeugt"
  fi
  chmod 600 "$file"
done
```
`chmod +x deploy/init-secrets.sh`.

- [ ] **Step 2: `docker-compose.yml`**

```yaml
# CuraHub — one compose file for fresh installs and updates.
# Fresh install: `docker compose up -d`, then open https://<domain>/setup (code: `docker compose logs app`).
# See docs/deployment.md.
services:
  init:
    image: alpine:3.20
    restart: "no"
    command: ["sh", "/init-secrets.sh"]
    volumes:
      - secrets:/secrets
      - ./deploy/init-secrets.sh:/init-secrets.sh:ro

  db:
    image: mariadb:10.6
    restart: always
    environment:
      # Only the *_FILE variants: the mariadb entrypoint aborts when a variable and its _FILE are both set.
      # An already initialised datadir ignores these (existing installations keep their passwords).
      MARIADB_ROOT_PASSWORD_FILE: /run/curahub-secrets/db_root_password
      MARIADB_PASSWORD_FILE: /run/curahub-secrets/db_password
      MARIADB_DATABASE: curahub
      MARIADB_USER: curahub
      # Creates the healthcheck user on older datadirs and upgrades system tables after image updates.
      MARIADB_AUTO_UPGRADE: "1"
    volumes:
      - db_data:/var/lib/mysql
      - secrets:/run/curahub-secrets:ro
    depends_on:
      init:
        condition: service_completed_successfully
    networks:
      - curahub-network
    healthcheck:
      test: ["CMD", "healthcheck.sh", "--connect", "--innodb_initialized"]
      interval: 5s
      timeout: 5s
      retries: 20
      start_period: 30s

  app:
    build:
      context: .
      dockerfile: Dockerfile
    restart: always
    # SEC-08: Docker port publishing bypasses ufw. Loopback by default — Apache on the host proxies to it.
    ports:
      - "${APP_BIND_ADDRESS:-127.0.0.1}:${APP_EXTERNAL_PORT:-3000}:3000"
    environment:
      PORT: 3000
      NODE_ENV: production
      # Empty = read from /run/curahub-secrets (fresh install). Set in .env only for existing installations.
      DATABASE_URL: ${DATABASE_URL:-}
      JWT_SECRET: ${JWT_SECRET:-}
      CORS_ORIGINS: ${CORS_ORIGINS:-}
      BEHIND_CLOUDFLARE: ${BEHIND_CLOUDFLARE:-false}
      VIDEO_JOB_CONCURRENCY: ${VIDEO_JOB_CONCURRENCY:-}
      UPLOAD_MAX_BYTES: ${UPLOAD_MAX_BYTES:-}
      DEPLOYED_COMMIT: ${DEPLOYED_COMMIT:-}
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - backend_uploads:/app/server/uploads
      - secrets:/run/curahub-secrets:ro
    networks:
      - curahub-network
    healthcheck:
      test: ["CMD", "curl", "-fsS", "http://localhost:3000/api/health"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 90s

networks:
  curahub-network:
    driver: bridge

volumes:
  secrets:
  db_data:
  backend_uploads:
```

Validate: `docker compose config -q` (config rendering only, no containers — allowed locally). Expected: no output, exit 0.

- [ ] **Step 3: `.env.example`**

```dotenv
# CuraHub — alle Werte sind optional. Eine Neuinstallation braucht keine .env:
# Passwörter und JWT-Secret erzeugt der init-Container beim ersten Start.

# Host-Port und -Adresse, auf der die App lauscht (Apache auf dem Host leitet dorthin weiter).
# APP_EXTERNAL_PORT=3000
# APP_BIND_ADDRESS=127.0.0.1

# Weitere erlaubte Origins für Browser-Zugriffe (kommagetrennt). Standard: die im Setup
# eingetragene öffentliche Adresse.
# CORS_ORIGINS=

# Nur setzen, wenn Cloudflare vor dem Server sitzt (dann zählt die Client-IP aus cf-connecting-ip).
# BEHIND_CLOUDFLARE=false

# Gleichzeitige Video-Transkodierungen (Standard 1) und Upload-Obergrenze in Bytes.
# VIDEO_JOB_CONCURRENCY=1
# UPLOAD_MAX_BYTES=

# Nur für bestehende Installationen, die ihre Zugangsdaten schon in der .env haben:
# DATABASE_URL=mysql://user:passwort@db:3306/datenbank
# JWT_SECRET=
```

- [ ] **Step 4: `deploy/apache/curahub.conf`**

```apache
# CuraHub hinter Apache (TLS terminiert Apache).
# In den bestehenden <VirtualHost *:443> der CuraHub-Domain einbinden:
#   Include /pfad/zu/CuraHub/deploy/apache/curahub.conf
# Benötigte Module: a2enmod proxy proxy_http headers
# Port anpassen, falls APP_EXTERNAL_PORT nicht 3000 ist.

ProxyPreserveHost On
ProxyRequests Off
# Uploads (16-MB-Blöcke) und Video-Streams brauchen mehr als die Standard-60 s.
ProxyTimeout 300
RequestHeader set X-Forwarded-Proto "https"
ProxyPass        / http://127.0.0.1:3000/ nocanon
ProxyPassReverse / http://127.0.0.1:3000/
Header always set Strict-Transport-Security "max-age=31536000"
# Uploads kommen in 16-MB-Blöcken; das Limit muss darüber liegen.
LimitRequestBody 33554432
```

- [ ] **Step 5: `docs/deployment.md`**

```markdown
# CuraHub installieren und betreiben

## Voraussetzungen
- Linux-Server mit Docker Engine und dem Compose-Plugin (`docker compose version`).
- Apache mit TLS-Zertifikat für die CuraHub-Domain und den Modulen `proxy`, `proxy_http`, `headers`.
- Ausgehender HTTPS-Zugriff auf www.hsbi.de (HSBI-Login).
- Mindestens 10 GB freier Speicher für Uploads.

## Neuinstallation
1. Code holen: `git clone <repo-url> /opt/curahub && cd /opt/curahub`
2. Starten: `docker compose up -d --build` (der erste Build dauert einige Minuten).
3. Apache: `deploy/apache/curahub.conf` im `<VirtualHost *:443>` der Domain einbinden, `apachectl configtest && systemctl reload apache2`.
4. Setup-Code anzeigen: `docker compose logs app | grep -A1 Setup-Code`
5. `https://<domain>/setup` öffnen und den Assistenten durchgehen (Systemcheck, Adresse, Notfall-Admin, HSBI-Admin).

Danach mit dem HSBI-Konto anmelden, unter „Benutzerverwaltung" Kurator:innen freischalten, Projekt anlegen, Werke hochladen und im Satelliten platzieren.

## Backups
Drei Volumes gehören ins Backup: `<projekt>_secrets`, `<projekt>_db_data`, `<projekt>_backend_uploads` (`<projekt>` = Ordnername, z. B. `curahub`).

Datenbank-Dump:
    docker compose exec db sh -c 'exec mariadb-dump -uroot -p"$(cat /run/curahub-secrets/db_root_password)" --single-transaction --routines curahub' > curahub-$(date +%Y%m%d-%H%M%S).sql

Ohne das Volume `secrets` kommt man nicht mehr an die Datenbank; ein neues JWT-Secret meldet nur alle Nutzer:innen ab.

## Update
    git pull --ff-only
    docker compose build app
    docker compose up -d

Migrationen laufen beim Start automatisch. Vorher einen Dump ziehen.

## Notfälle
- Admin-Passwort vergessen: `docker compose exec app node dist/scripts/reset-local-admin.js notfall`
- Setup erneut öffnen (Daten bleiben): `docker compose exec app node dist/scripts/reset-setup.js`, dann `docker compose restart app`, neuer Code im Log.
- Zustand prüfen: als Admin unter „Benutzerverwaltung" → Abschnitt „System".

## Bestehende Installation (alter Server)
Die bisherige `.env` mit `DATABASE_URL`, `JWT_SECRET`, `APP_EXTERNAL_PORT`, `APP_BIND_ADDRESS` funktioniert weiter; Werte aus der `.env` haben Vorrang vor den erzeugten Secrets. Hinter Cloudflare zusätzlich `BEHIND_CLOUDFLARE=true` setzen. Der Datenbank-Port wird nicht mehr auf dem Host veröffentlicht.
```

- [ ] **Step 6: `CLAUDE.md`**

- In „Commands → Backend": delete the line `` - `cd server && npx prisma db seed` — seed via `prisma/seed.ts` ``.
- After the „Backend API" section add:
```markdown
### Setup & Deployment

- Fresh install = `docker compose up -d` + web wizard at `/setup` (runbook: `docs/deployment.md`, Apache snippet: `deploy/apache/curahub.conf`). The `init` service writes `db_root_password`, `db_password`, `jwt_secret` into volume `secrets` (`/run/curahub-secrets`); `lib/loadSecretEnv` fills `DATABASE_URL`/`JWT_SECRET` from them when unset (env always wins) — import it first in every entry point and script.
- `SystemSetting` (`setup_completed_at`, `public_url`); `lib/setupState` caches it. Until completion `lib/setupGate` answers 503 `setup_required` on every API namespace; the one-time code is printed to the log, setup tokens are signed with an in-memory secret (never `JWT_SECRET`). `/setup` routes 404 afterwards; `scripts/reset-setup.js` re-opens.
- Local emergency accounts: `User.email` without `@`, bcrypt hash, `POST /auth/local-login`; `scripts/reset-local-admin.js <name>`.
- CORS: `CORS_ORIGINS` else `public_url`; `trust proxy` = loopback + private ranges; `cf-connecting-ip` only with `BEHIND_CLOUDFLARE=true`.
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml .env.example deploy docs/deployment.md CLAUDE.md
git commit -m "feat(deploy): one compose file with generated secrets, Apache snippet and runbook"
```

---

### Task 9: Proof on the server (fresh install + existing installation)

No local stack. All commands on `Prohosting-18GB-Server`; production (`/root/CuraHub`, project `curahub`) is never touched.

- [ ] **Step 1: Full local checks**

Run: `npm run test && npm run lint && npm run build && cd server && npm run build && npx jest 2>&1 | grep -E "^(PASS|FAIL)|Suites:"`
Expected: client green; server: only `auth.test.ts` and `scaleFigures.test.ts` fail (DB baseline).

- [ ] **Step 2: Deploy a fresh copy**

```bash
ssh Prohosting-18GB-Server 'rm -rf /root/CuraHub-fresh && mkdir /root/CuraHub-fresh'
git archive HEAD | ssh Prohosting-18GB-Server 'tar -x -C /root/CuraHub-fresh'
COMMIT=$(git rev-parse --short HEAD)
ssh Prohosting-18GB-Server "cd /root/CuraHub-fresh && APP_EXTERNAL_PORT=3004 DEPLOYED_COMMIT=$COMMIT docker compose -p curahub-fresh up -d --build"
```

- [ ] **Step 3: Verify the start**

```bash
ssh Prohosting-18GB-Server 'cd /root/CuraHub-fresh && docker compose -p curahub-fresh ps && docker compose -p curahub-fresh logs init && docker compose -p curahub-fresh logs app | tail -40'
ssh Prohosting-18GB-Server 'docker run --rm -v curahub-fresh_secrets:/s alpine ls -l /s'
```
Expected: `init` exited 0 with three „erzeugt" lines; files `-rw-------`; `db` and `app` healthy; app log shows all 9 migrations applied from zero (incl. `0_init`) and the setup banner with a code.

- [ ] **Step 4: Walk through the wizard and the product**

Tunnel: `ssh -N -L 3004:127.0.0.1:3004 Prohosting-18GB-Server`, open `http://localhost:3004` in the built-in browser.
Check, in order:
1. `/` redirects to `/setup`; `curl -s localhost:3004/api/projects` → `503 {"error":"setup_required"}`.
2. Wrong code → error; right code → system check. Expected: all red-free; `proxy` yellow (no Apache in front), `hsbi` green.
3. Address `http://localhost:3004`, emergency admin `notfall` + password, HSBI step: the user types their own HSBI credentials (never typed by the agent), or „Überspringen".
4. Restart test before finishing: `docker compose -p curahub-fresh restart app`, then „Setup abschließen" → wizard returns to the code step; enter the new code from the log, finish.
5. `/setup` now redirects to `/login`; `curl -s localhost:3004/api/setup/checks` → 404.
6. Emergency login works; `/users` shows the System block and the „lokal" badge; promote the HSBI account if skipped.
7. Create a project + exhibition, upload an image, a video, a PDF book and a splat (sample files from `Sample Files/` plus one PDF/splat the user provides), wait for processing, place them in the Satellit, open the public viewer link.
8. `docker compose -p curahub-fresh exec app node dist/scripts/reset-local-admin.js notfall` → set a new password, log in with it.
9. `docker compose -p curahub-fresh restart app` → no banner, still set up, users still there.

- [ ] **Step 5: Existing installation (prod copy on the test stack)**

```bash
ssh Prohosting-18GB-Server 'grep -E "^(APP_|DB_BIND|DB_EXTERNAL)" /root/CuraHub-test-secrets/test.env'
```
Then deploy the branch to `/root/CuraHub-test` (same `git archive` procedure, keep `docker-compose.test.yml` aside) and start it with the **new** `docker-compose.yml`, the test env file and the test port:
```bash
ssh Prohosting-18GB-Server 'cd /root/CuraHub-test && APP_EXTERNAL_PORT=3002 docker compose -p curahub-test --env-file /root/CuraHub-test-secrets/test.env up -d --build'
```
Expected: compose reuses `curahub-test_db_data` / `curahub-test_backend_uploads` (warning „already exists … not created by compose" is fine); db healthy (auto-upgrade created the healthcheck user); migration `system_settings` applied and marked the DB set up; `/` shows the normal home page, no wizard; HSBI login + editor + Yol viewer work as before.
If the test stack's volumes are declared `external` under different names, fall back to its own `docker-compose.test.yml` with the new `app` environment block copied in, and note the difference for the production rollout.

- [ ] **Step 6: Clean up**

```bash
ssh Prohosting-18GB-Server 'cd /root/CuraHub-fresh && docker compose -p curahub-fresh down -v && cd / && rm -rf /root/CuraHub-fresh'
```
Report results to the user; production deploy (needs `BEHIND_CLOUDFLARE=true` in prod `.env` + backup first) only after they ask.
```
