# Project website: landing page, wiki and setup guide — Design Spec
**Date:** 2026-10-01
**Status:** Approved (in chat), awaiting spec review

---

## Overview

CuraHub gets a public project website for people outside the HSBI team — other universities and curators who want to learn what CuraHub is and install it themselves. It has three parts: a landing page, the user manual ("Wiki") and the setup guide.

Decisions taken in chat:

- **Its own static website**, not a route inside the app. The app's `/` (`HomePage`, published exhibitions) stays as it is.
- **GitHub Pages**, built and published by a GitHub Actions workflow from the public repo `krullmensch/CuraHub`. Address: `https://krullmensch.github.io/CuraHub/`.
- **German only**, like the app, the wiki and the runbook.
- **Astro** in a separate `site/` package (approach A). Static HTML, no client framework.
- **One source for the texts**: the website renders the same `src/wiki/*.md` the app shows and the same `docs/deployment.md` GitHub shows. No copies.
- **Real screenshots** taken on the server test stack, showing a **demo exhibition** that is built for this purpose with public-domain images and rearranged modular walls — no real exhibition, no personal data.
- The landing page states the current limits openly (HSBI login, fixed room model).

Out of scope: English, wiki search, blog/news, a custom domain, a licence text, analytics, a dark/light switch (one dark theme), changes to the app's `HomePage`.

Open, decided by the user outside this spec:

- **Licence.** The repo has none. The site says nothing about a licence until one exists.
- **Impressum.** See section 2.

---

## 1. Pages and content

One shared header on every page: wordmark "CuraHub", links **Funktionen** (anchor on the landing page), **Wiki**, **Setup-Guide**, **GitHub** (external). One shared footer: GitHub link, "Entstanden an der HSBI", Impressum link when the page exists.

### Landing page `/`

Top to bottom:

1. **Hero.** Background video `public/BG_Video_CuraHub-720p.webm` with poster `public/BG_Video_CuraHub-poster.webp`, one sentence saying what CuraHub is, two buttons: "Setup-Guide" (→ `/setup/`) and "GitHub". With `prefers-reduced-motion: reduce` or Save-Data only the poster is shown and the video is never requested (same rule as `HomePage`).
2. **Was ist CuraHub.** Three sentences: browser-based planning tool for exhibitions, built at the HSBI, for curators.
3. **Funktionen** (`#funktionen`). Six blocks, each a heading, two or three sentences and one screenshot:
   - 3D-Planer — placing works, multi-selection, modular walls
   - 2D-Wandeditor — hanging height, gaps, guides
   - Medien — images, video, 3D models, Gaussian splats, books (PDF on a pedestal)
   - Rahmen und Passepartouts — HALBE and Aab ranges
   - Versionen und Veröffentlichen — version history, public viewer link
   - Rundgang — first person, public viewer
4. **In drei Schritten.** Installieren → Assistent durchlaufen → kuratieren, with a link to the setup guide.
5. **Voraussetzungen.** Short form of the runbook's requirements (Docker with Compose, Apache with TLS, 10 GB for uploads).
6. **Stand und Grenzen.** Two fixed HSBI bindings an outside installer must know before installing:
   - Login runs through the HSBI account; without HSBI access only the emergency admin can log in.
   - The room model "Satellit" is part of the image; own rooms cannot be uploaded.
7. **Technik.** One line of stack (React, Three.js/WebGPU, Express, Prisma, MariaDB, Docker) and the repo link.

Feature texts are written new for the site in `site/src/`. They describe what the code does today (source: `CLAUDE.md`), not the outdated `README.md`.

### Wiki `/wiki/` and `/wiki/<id>/`

The seven existing manual pages, each with its own URL. `/wiki/` shows the first page. A sidebar lists all pages in manual order, the current one marked. Below 768 px the sidebar becomes a list above the content.

### Setup guide `/setup/`

`docs/deployment.md` rendered unchanged, with a table of contents built from its `##` headings. Above the "Neuinstallation" steps a row of setup-wizard screenshots (code, system check, public address, emergency admin, HSBI admin).

---

## 2. Structure and sources

### `site/` — its own package

```
site/
├── package.json            # astro, sharp; scripts: dev, build, preview
├── astro.config.mjs        # site: 'https://krullmensch.github.io', base: '/CuraHub', output: 'static'
├── src/
│   ├── content.config.ts   # collections "wiki" and "docs" (glob loaders, see below)
│   ├── layouts/Base.astro  # <head>, header, footer, fonts
│   ├── components/         # Header, Footer, Hero, FeatureBlock, WikiSidebar, Toc, Prose
│   ├── pages/
│   │   ├── index.astro
│   │   ├── wiki/index.astro
│   │   ├── wiki/[id].astro
│   │   ├── setup.astro
│   │   └── [legal].astro   # one page per file in site/src/content/legal/ (none → no page)
│   ├── lib/
│   │   ├── paths.ts        # url(path): prefixes the base path — the only place that knows it
│   │   └── remarkRepoLinks.ts
│   ├── styles/global.css   # colour tokens, @font-face, prose styles
│   └── assets/screenshots/ # PNG sources + CREDITS.md
└── scripts/
    ├── capture-screenshots.mjs
    └── check-links.mjs
```

- `site/` has its own `node_modules`. The app's Vite build, `tsc` (`tsconfig.app.json` includes only `src`) and Vitest do not touch it. `site/` is added to the root ESLint `ignores` and to `.dockerignore`, so the app image does not grow.
- Styling is plain CSS with custom properties; no Tailwind. One dark theme using the app's colours (zinc-950 background, zinc-200 text, blue-400 accent) and fonts.
- Fonts are the files in `src/assets/fonts/` (Funnel Display, Albert Sans), referenced from `global.css` so Astro's bundler fingerprints them. Nothing is loaded from a third-party host; no cookies, no tracking.
- The hero video and poster are imported from `public/` the same way.
- All internal links go through `url()` from `lib/paths.ts`, so a later custom domain only changes `base` in `astro.config.mjs`.

### One source for the texts

| Content | Source | Read by |
|---|---|---|
| Wiki pages | `src/wiki/*.md` | app (`WikiView`) and website |
| Wiki order and titles | new: `src/wiki/pages.json` | app and website |
| Setup guide | `docs/deployment.md` | website (and GitHub) |
| Landing page texts | `site/src/` | website only |

`src/wiki/pages.json` is an ordered array of `{ "id": "access-control", "title": "Benutzer & Rechte" }`, `id` = file name without `.md`. It holds exactly today's seven entries in today's order.

**The only change to the app:** `WikiView.tsx` builds its `pages` list from `pages.json` plus `import.meta.glob('../wiki/*.md', { query: '?raw', import: 'default', eager: true })` instead of seven hand-written imports and a hard-coded array. Behaviour and bundle split stay the same (the markdown stays inside the lazy `WikiView` chunk).

The website's `wiki` collection uses a glob loader on `../src/wiki/*.md`, the `docs` collection one on `../docs/deployment.md`. `wiki/[id].astro` generates its static paths from `pages.json`; an id without a file fails the build.

Each wiki file starts with its own `# Heading`; that heading is the page's `<h1>`. The `title` from `pages.json` is used for the sidebar and the `<title>`.

### Repo paths in the runbook

`remarkRepoLinks` turns inline code that is exactly a path to an existing file in the repo (e.g. `deploy/apache/curahub.conf`) into a link to `https://github.com/krullmensch/CuraHub/blob/main/<path>`. Existence is checked at build time against the repo root; everything else stays plain inline code.

### Images

Screenshot sources are PNGs committed in `site/src/assets/screenshots/`. Pages use Astro's `<Image>` so the build writes resized WebP variants with `width`/`height` set (no layout shift). Every screenshot has a German alt text describing what it shows.

### Impressum

`site/src/content/legal/impressum.md` is written by the user (name, address, contact). A third collection `legal` globs that folder and `[legal].astro` takes its static paths from it: if the file exists, `/impressum/` is built and the footer links to it; if not, neither exists. Whether the site may go live without it is the user's call.

---

## 3. Publishing

`.github/workflows/site.yml`:

- **Trigger paths** (both events): `site/**`, `src/wiki/**`, `docs/deployment.md`, `src/assets/fonts/**`, `public/BG_Video_CuraHub-*`, the workflow file itself.
- **`pull_request`**: `npm ci` and `npm run build` in `site/` — build only, so broken markdown or a missing wiki file shows up in the PR.
- **`push` to `main`**: the same build, then `actions/upload-pages-artifact` and `actions/deploy-pages`. Permissions `pages: write`, `id-token: write`; concurrency group `pages`.
- Node version as in the app's `Dockerfile`.

One manual step by the user, once: repo → Settings → Pages → Source "GitHub Actions". The site is public only after the branch reaches `main` and Pages is switched on.

---

## 4. Screenshots and the demo exhibition

### Demo exhibition

Built on the **test stack** (`curahub-test`, `127.0.0.1:3002` through the SSH tunnel), never on production:

- A new project "Demo" with one exhibition.
- 12–16 public-domain / CC0 images from museum open-access collections, in mixed formats and sizes, plus one video, one 3D model and one book so the "Medien" block has something to show. Every file with title, author and source is listed in `site/src/assets/screenshots/CREDITS.md`.
- Modular walls rearranged into a clear layout (not the default positions), works hung on both room walls and modular walls, several frame styles and passepartouts in use, one wall laid out in the 2D editor with hanging line and guides.
- One published version, so the public viewer link works.

The demo project stays on the test stack for later re-captures.

### Capturing

`site/scripts/capture-screenshots.mjs` drives headless Chrome over CDP (`--headless=new --enable-unsafe-webgpu`, window 1600 × 1000, device scale factor 2) against a base URL given on the command line. It holds the list of shots: URL, steps to reach the state (open wall editor, select works, …), wait condition, optional crop, output file name. It is run by hand; the workflow never runs it.

Shots: 3D planner (orbit view with a multi-selection), 2D wall editor, asset browser with mixed media, frame panel on a selected picture, version panel, first-person view, public viewer. Wizard steps come from a fresh temporary stack (`curahub-setup`, port 3003) that is torn down afterwards.

Dependencies at capture time:

- **Login.** Editor views need a session. A dedicated local test account on the test stack (`reset-local-admin.js`) is created only after the user confirms it at that point; the alternative is that the user takes the logged-in shots.
- **Downloads.** Fetching the demo images is confirmed with the user before it happens (file list with sources).
- No screenshot may show an e-mail address or another real person's name; the user menu is closed in every shot.

---

## 5. Checks

- **Website build:** `npm run build` in `site/` passes. A wiki id in `pages.json` without a file, or a markdown file that does not parse, fails it.
- **App:** a Vitest test (`src/wiki/pages.test.ts`) asserts that the ids in `pages.json` and the `.md` files in `src/wiki/` are the same set and that ids are unique. `npm run lint` and `npm run test` pass. The wiki modal is checked on the test stack after the `WikiView` change (all seven pages open, same order and titles as before).
- **Look:** static preview of the built site (`astro preview` — the static site only, not the CuraHub app), screenshots at 375, 768 and 1440 px of all three page types, sent to the user.
- **Accessibility:** alt texts, AA contrast on text, visible focus, everything reachable by keyboard, heading order without gaps, poster instead of video under reduced motion.
- **Links:** every internal link in the built `dist/` resolves to a file: `site/scripts/check-links.mjs` runs after `astro build` as part of `npm run build` and exits non-zero on a dead link. External links are not checked.

---

## 6. Branch

New branch `feat/project-website`, branched from `feat/initial-setup` — `docs/deployment.md` and the setup wizard exist only there, not on `main` yet.
