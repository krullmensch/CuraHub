# Fresh install with one Docker Compose + web setup wizard — Design Spec
**Date:** 2026-09-30
**Status:** Approved (in chat), awaiting spec review

---

## Overview

CuraHub moves to a new server soon. On the new server it should come up from an empty database with one `docker compose up -d`; everything else is configured and secured in the browser by a first-run **setup wizard**. After the wizard the curators log in and fill the Satellit again by uploading and placing works through the normal UI.

Decisions taken in chat:

- **Empty start, re-upload.** No data transfer from the old server (no export/import, no dump restore).
- **Apache on the host, already present** (managed outside this repo). The compose file only exposes the app on a loopback port; the repo ships a VirtualHost/ProxyPass snippet to include.
- **Secrets are generated automatically** by an `init` container on the first start; `.env` becomes optional.
- **Setup wizard** covers: setup code, system check, public URL, emergency admin (local password), HSBI admin (live login check).
- The setup screen is protected by a **one-time code printed to the container log**; after completion it is locked for good (re-open only from the shell).

Out of scope: data migration from the old server, a container registry / prebuilt image, e-mail, changing the public URL from the web UI after setup, a web password reset, Cloudflare tunnel in compose.

---

## 1. Compose, secrets and container start

### `docker-compose.yml` — three services, three volumes

| Service | Job |
|---|---|
| `init` (`alpine:3.20`, `restart: "no"`) | On every start: for each of `db_root_password`, `db_password`, `jwt_secret` in volume `secrets` (mounted at `/secrets`) — if the file is missing, write 48 random hex chars (`head -c 24 /dev/urandom \| od -An -tx1 \| tr -d ' \n'`), `chmod 600`. Existing files are never touched. Exits 0. Script inline in compose or `deploy/init-secrets.sh` (mounted read-only). |
| `db` (`mariadb:10.6`) | `MARIADB_ROOT_PASSWORD_FILE=/run/secrets-vol/db_root_password`, `MARIADB_PASSWORD_FILE=/run/secrets-vol/db_password`, `MARIADB_DATABASE=curahub`, `MARIADB_USER=curahub`. `depends_on: init: condition: service_completed_successfully`. **No host port** (internal network only). Healthcheck `healthcheck.sh --connect --innodb_initialized` (ships with the mariadb image, needs no password on the command line). |
| `app` | `depends_on: db: service_healthy`. Mounts `secrets` read-only. New entrypoint `server/docker-entrypoint.sh`: if `DATABASE_URL` is unset, build it as `mysql://curahub:$(cat db_password)@db:3306/curahub`; if `JWT_SECRET` is unset, read it from `jwt_secret`; then `node dist/scripts/prepare-db.js && exec node dist/index.js`. Port `${APP_BIND_ADDRESS:-127.0.0.1}:${APP_EXTERNAL_PORT:-3000}:3000`. Healthcheck `curl -fsS http://localhost:3000/api/health`. |

Volumes: `secrets`, `db_data`, `backend_uploads`. Hex secrets need no URL encoding.

**Backwards compatibility with today's production `.env`** (`DATABASE_URL`, `JWT_SECRET`, `DB_*`, `APP_EXTERNAL_PORT=3001`, `APP_BIND_ADDRESS=172.17.0.1`):

- `app`: variables set in the environment win over the secret files, so `DATABASE_URL`/`JWT_SECRET` from `.env` keep working. The compose file passes them through as `${DATABASE_URL:-}` / `${JWT_SECRET:-}` (empty = use the secret file).
- `db`: compose sets **only** the `*_FILE` variables, never the plain `MARIADB_*_PASSWORD` (the mariadb entrypoint aborts when both are set). An already-initialised datadir ignores the password variables, so production's existing DB keeps its passwords; the random files are simply unused there. `MARIADB_AUTO_UPGRADE: "1"` is set so the image creates its healthcheck user (`.my-healthcheck.cnf`) on datadirs that predate it and runs `mariadb-upgrade` on image updates.
- Host port: the variable stays `APP_EXTERNAL_PORT` (default `3000`); the container always listens on 3000 internally. `APP_PORT` is no longer read by compose.
- The db service no longer publishes a host port (production binds `127.0.0.1:3307` today; dumps already go through `docker exec`). `DB_EXTERNAL_PORT`/`DB_BIND_ADDRESS` become unused.
- Production additionally needs `BEHIND_CLOUDFLARE=true` in its `.env` (section 4) — part of the rollout note in `docs/deployment.md`.

`.env.example` shrinks to the optional knobs: `APP_EXTERNAL_PORT`, `APP_BIND_ADDRESS`, `VIDEO_JOB_CONCURRENCY`, `UPLOAD_MAX_BYTES`, `CORS_ORIGINS`, `BEHIND_CLOUDFLARE`, each with a German comment.

`Dockerfile`: copy the entrypoint, `CMD ["sh", "/app/server/docker-entrypoint.sh"]`.

### `GET /api/health`

Unauthenticated, not affected by the setup gate. Returns `200 {"ok":true}` when a `SELECT 1` succeeds, else `503`. Also mounted without `/api` like the other routes.

---

## 2. Setup state and gate

### Prisma — one migration `…_system_settings`

```prisma
model SystemSetting {
  key       String   @id @db.VarChar(64)
  value     String   @db.Text
  updatedAt DateTime @updatedAt
}
```

Keys: `setup_completed_at` (ISO timestamp), `public_url`.

The migration SQL also inserts `setup_completed_at = NOW()` **when the `User` table already has rows** (`INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM User)`). Existing databases (production, test stack) therefore never see the wizard.

### `server/src/lib/setupState.ts`

- `isSetupComplete()` — cached in memory after the first `true` (it never goes back without a restart).
- `getPublicUrl()` — cached, `null` before setup.
- `setupCode` — generated at start when setup is open: 12 chars from an unambiguous alphabet (`ABCDEFGHJKMNPQRSTUVWXYZ23456789`), formatted `XXXX-XXXX-XXXX`, compared case-insensitively and ignoring dashes with `crypto.timingSafeEqual`. Printed once as a boxed block to stdout:
  ```
  ==============================================
   CuraHub ist noch nicht eingerichtet.
   Setup-Code: 7F3K-9QXM-2BTA
   Öffne https://<deine-domain>/setup
  ==============================================
  ```
  Memory only; a restart makes a new code.

### Gate middleware (`server/src/lib/setupGate.ts`)

Mounted in `index.ts` before all routers. While setup is open:

- `/api/setup/*`, `/setup/*`, `/api/health`, `/health` → pass.
- Frontend GET requests (the SPA fallback and static files from `dist/`) → pass, so `/setup` can render.
- Everything else (API namespaces from `API_NAMESPACE_SEGMENTS`, incl. `/auth`, `/public`, `/uploads`) → `503 {"error":"setup_required"}`.

After completion the middleware is a no-op.

### Setup session

`POST /api/setup/verify-code {code}` — rate-limited 5 per minute per IP (reuse the bucket logic from `loginRateLimit`, extracted into a small `createRateLimit(rules)` helper). Correct code → a JWT signed with `JWT_SECRET`, claim `{ purpose: 'setup' }`, 30 min. All other setup routes require it as `Authorization: Bearer`.

### After completion

Every `/api/setup/*` route except `GET /api/setup/status` → `404`. Re-opening only from the shell: `docker compose exec app node dist/scripts/reset-setup.js` deletes `setup_completed_at` (users are kept) and tells the operator to restart the app.

---

## 3. Setup API and wizard

### API (`server/src/routes/setup.ts`, mounted at `/setup` and `/api/setup`)

| Route | Auth | Result |
|---|---|---|
| `GET /status` | none | `{ complete: boolean }` |
| `POST /verify-code` | none (rate-limited) | `{ token }` or `401` |
| `GET /checks` | setup token | `{ checks: Check[], suggestedPublicUrl }` |
| `POST /hsbi-check` | setup token | body `{username, password}` → calls `validateHSBI`; `{ ok: true, email }` or `{ ok: false, reason }`. Rate-limited like `/auth/login`. Stores nothing. |
| `POST /complete` | setup token | body see below; one transaction; `{ ok: true }` |

`Check = { id, label, status: 'ok' | 'warn' | 'fail', detail }` (German `label`/`detail`).

**Checks** (`server/src/lib/systemChecks.ts`, each with a timeout, run in parallel):

| id | fail when | warn when |
|---|---|---|
| `database` | `SELECT 1` fails | — |
| `migrations` | `_prisma_migrations` has a failed row or fewer applied rows than folders in `prisma/migrations` | — |
| `uploads` | writing + deleting a temp file in `uploads/` fails | — |
| `ffmpeg` | `ffmpeg -version` fails | — |
| `poppler` | `pdfinfo -v` or `pdftoppm -v` fails | — |
| `disk` | — | free space on the uploads volume < 10 GB (`fs.statfs`) |
| `hsbi` | — | `HEAD https://www.hsbi.de/login` fails within 5 s |
| `proxy` | — | request has no `X-Forwarded-For` (not behind Apache) or `req.protocol !== 'https'` (with trust proxy) |

`suggestedPublicUrl` = `${req.protocol}://${req.get('host')}` (with trust proxy this is what Apache forwarded).

**`POST /complete` body** (zod):

```ts
{
  publicUrl: string,          // https://…, or http://localhost[:port] / http://127.0.0.1[:port]; no path, no trailing slash
  localAdmin: { username: string, password: string },
                              // username /^[a-z0-9._-]{3,32}$/, must not contain '@'; password ≥ 12 chars
  hsbiAdmin?: { username: string, password: string }
}
```

Steps: reject when any check is `fail` (re-run server-side); if `hsbiAdmin` is given, call `validateHSBI` again (the password is not kept between requests); then in one Prisma transaction: upsert local `User { email: username, password_hash: bcrypt(12), role: 'admin' }`, upsert `User { email: `${hsbi}@hsbi.de`, role: 'admin' }` if given, write `public_url`, write `setup_completed_at`. Afterwards update the caches and the CORS origin list. HSBI failure → `422` with the reason, nothing written.

### Wizard (`src/pages/SetupPage.tsx` + `src/components/setup/*`)

Route `/setup`, outside `ProtectedRoute`. Styled like `LoginPage`. On app load `App.tsx` asks `GET /api/setup/status` once; while `complete === false` every route redirects to `/setup`; once complete, `/setup` redirects to `/login`. API calls that get `503 setup_required` also redirect there.

Steps (German), the setup token kept in component state only (not persisted):

1. **Setup-Code** — input, hint „Den Code findest du mit `docker compose logs app`."
2. **Systemcheck** — list with green/yellow/red; „Erneut prüfen"; „Weiter" disabled while any check is red.
3. **Öffentliche Adresse** — prefilled from `suggestedPublicUrl`; client-side validation with the same rule as the server (shared pure helper).
4. **Notfall-Admin** — username, password twice, strength hint; text „Dieses Konto funktioniert auch, wenn der HSBI-Login ausfällt. Bewahre das Passwort sicher auf, z. B. im Passwort-Manager."
5. **HSBI-Admin** (optional) — HSBI-Kennung + password → „Prüfen" (`/hsbi-check`); success shows the e-mail; failure shows the reason and offers „Überspringen". The password stays in memory until „Setup abschließen" and is sent once more with `/complete`.
6. **Zusammenfassung** — address, emergency admin name, HSBI admin (or „übersprungen") → „Setup abschließen" → success screen with „Zum Login".

Pure helpers in `src/lib/setup/validation.ts` (URL rule, username rule, password rule), mirrored by the server's zod schema.

---

## 4. Emergency login and runtime security

### Local login

- `POST /auth/local-login {username, password}` — looks up `User` where `email = username` and `password_hash` is not null; bcrypt compare; issues the same JWT as the HSBI login. Rate limit: 5 per 15 min per IP+username, 20 per 15 min per username. Uniform error „Benutzername oder Passwort falsch." A username containing `@` is rejected (HSBI accounts never log in here).
- HSBI login unchanged. An HSBI login can never produce a user without `@hsbi.de`, so the two account kinds cannot collide.
- `LoginPage`: small link „Notfall-Login" below the HSBI form toggles to a username/password form that posts to `/auth/local-login`.
- `UsersPage`: local accounts show the username with a badge „lokal" (today it shows `email.split('@')[0]`, which already works for names without `@`).
- Lost password: `docker compose exec app node dist/scripts/reset-local-admin.js <username>` prompts for a new password twice (no echo), min. 12 chars, creates the account as admin if it does not exist. No web reset.
- `server/prisma/seed.ts` (user with password `password`) is deleted, together with the `prisma.seed` entry in `server/package.json`.

### Runtime

- **CORS:** origin list = `CORS_ORIGINS` (env, wins) else `[public_url]`; without either (before setup, or an existing DB that was only marked complete by the migration) no CORS headers are sent — same-origin only, which is how the SPA talks to the API anyway. Today's "reflect any origin" fallback goes away.
- **`app.set('trust proxy', 'loopback, uniquelocal')`** — Apache reaches the container through the Docker bridge (172.16/12), so `req.ip` / `req.protocol` come from `X-Forwarded-*`.
- **Rate-limit client IP:** `cf-connecting-ip` is honoured only when `BEHIND_CLOUDFLARE=true` (today's production sets it; the new server does not). Otherwise `req.ip`. Closes the header-spoofing hole on a server without Cloudflare.
- **Admin „System" block** on `/users`: `GET /admin/system` (admin only) returns the same `Check[]` plus `public_url` and the app version (`DEPLOYED_COMMIT` env or package version). Read-only.

### Apache snippet — `deploy/apache/curahub.conf`

```apache
# In the existing <VirtualHost *:443> for the CuraHub domain (TLS handled by the host).
# Needs: a2enmod proxy proxy_http headers
ProxyPreserveHost On
ProxyRequests Off
ProxyTimeout 300
RequestHeader set X-Forwarded-Proto "https"
ProxyPass        / http://127.0.0.1:3000/ nocanon
ProxyPassReverse / http://127.0.0.1:3000/
Header always set Strict-Transport-Security "max-age=31536000"
# Upload chunks are 16 MB; keep the body limit above that (Apache default is 1 GB).
LimitRequestBody 33554432
```

Range requests pass through `mod_proxy` unchanged.

---

## 5. Testing, docs, proof

### Automated (local: unit tests, lint, typecheck, build only)

Jest (`server/src/tests/`):
- `setupGate` — 503 for API namespaces before setup, SPA/static pass, `/api/health` passes, no-op after.
- `setup` routes — wrong code 401 + rate limit 429; token required; `/complete` validation errors; happy path writes users/settings in one transaction; HSBI failure (mocked `validateHSBI`) writes nothing; routes 404 after completion.
- Migration behaviour — `setup_completed_at` is inserted when users exist (SQL tested against the test DB setup the suite already uses, or as a unit on the SQL string if no DB is available).
- `local-login` — success, wrong password, unknown user, `@` rejected, rate limit.
- CORS from `public_url`; `BEHIND_CLOUDFLARE` switch in the rate limiter.
- `systemChecks` — each check with mocked `execFile`/`statfs`/fetch.

Vitest: `src/lib/setup/validation.ts`.

### Dry run on the Prohosting server (never a local stack)

1. `git archive` the branch into `/root/CuraHub-fresh`, compose project `curahub-fresh`, fresh volumes, `APP_EXTERNAL_PORT=3004`, tunnel `ssh -N -L 3004:127.0.0.1:3004 Prohosting-18GB-Server`.
2. Verify: secret files created (600), all migrations applied from zero (incl. `0_init` on an empty MariaDB), code in `docker compose logs app`, wizard end to end, emergency login, HSBI login, create project/exhibition, upload image, video, PDF book, splat, place them in the Satellit, open the public viewer link.
3. Restart `app` → secrets reused, setup stays closed, users still there.
4. `docker compose -p curahub-fresh down -v`, remove the folder. Production untouched.
5. **Compatibility:** deploy the branch to the existing test stack (prod copy, own `.env`) → no wizard, login and editor as before, migration marked setup complete.

### Docs

- `docs/deployment.md` (German): requirements (Docker + compose plugin, Apache with `proxy`, `proxy_http`, `headers`, TLS); fresh install in five steps (clone → `docker compose up -d` → include Apache snippet + reload → `docker compose logs app` for the code → open `/setup`); backups (volumes `secrets`, `db_data`, `backend_uploads` + dump command); update procedure (`git pull`, `docker compose build app`, `up -d`); emergency commands (`reset-local-admin`, `reset-setup`).
- `CLAUDE.md`: short section „Setup & Deployment" pointing to the above; drop `prisma db seed` from the command list.
