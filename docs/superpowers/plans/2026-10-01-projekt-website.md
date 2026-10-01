# Project Website (Landing Page, Wiki, Setup Guide) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public, German, static project website for CuraHub on GitHub Pages with a landing page, the user manual and the setup guide, rendered from the same markdown files the app and the repo already use.

**Architecture:** A separate Astro 7 package in `site/` builds static HTML. Content collections load `../src/wiki/*.md` and `../docs/deployment.md` directly; a new `src/wiki/pages.json` is the shared order/title list that both the app's `WikiView` and the site read. A GitHub Actions workflow builds on pull requests and deploys on pushes to `main`. Screenshots are PNGs in the repo, captured by a hand-run CDP script from a demo exhibition on the server test stack.

**Tech Stack:** Astro 7 (static output, `astro:content` glob loader, `astro:assets`), `@astrojs/markdown-remark` (unified processor for one custom remark plugin), `unist-util-visit`, sharp, plain CSS, `node --test` for the site's pure helpers, Vitest for the app-side manifest test, GitHub Actions + GitHub Pages, headless Chrome over CDP.

**Spec:** `docs/superpowers/specs/2026-10-01-projekt-website-design.md`

## Global Constraints

- All site text is German. Code, comments and commit messages are English.
- Site address `https://krullmensch.github.io/CuraHub/`: `site: 'https://krullmensch.github.io'`, `base: '/CuraHub'`. Every internal link goes through `url()` from `site/src/lib/url.ts`; no hard-coded `/CuraHub`.
- Repo blob links: `https://github.com/krullmensch/CuraHub/blob/main/<path>`.
- No copies of `src/wiki/*.md` or `docs/deployment.md` anywhere in `site/`.
- The only app change is `src/components/WikiView.tsx` + `src/wiki/pages.json` + `tsconfig.app.json` (`resolveJsonModule`). Same seven pages, same order, same titles.
- `site/` has its own `package.json`/`node_modules`; nothing in `site/` is imported by the app, and the root `npm run build`, `npm run lint`, `npm run test` must behave as before (plus the one new Vitest file).
- No Tailwind, no client framework, no third-party hosts for fonts/scripts, no cookies, no analytics. One dark theme.
- Colours: background `#09090b`, surface `#18181b`, border `rgba(63,63,70,.6)`, text `#d4d4d8`, strong `#f4f4f5`, muted `#a1a1aa`, accent `#60a5fa`, button `#2563eb`.
- Fonts: the files in `src/assets/fonts/` (Funnel Display for headings, Albert Sans for body).
- Astro 7 needs Node ≥ 22.12. CI uses Node 22. The Rust compiler rejects unclosed tags — close every non-void element.
- **Never run the CuraHub app, its DB or a browser against a local CuraHub stack.** Allowed locally: `npm run lint|test|build` (root), `npm run build|test|preview` in `site/` (static files only). Anything needing the running app happens on `Prohosting-18GB-Server` (test stack `curahub-test`, `127.0.0.1:3002`, reached via `ssh -N -L 3002:127.0.0.1:3002 Prohosting-18GB-Server`). Never touch the production stack.
- Screenshots: no e-mail address and no real person's name visible; user menu closed.
- Commit only the files a task names; the working tree has unrelated local changes under `.claude/` that must stay uncommitted.
- Nothing is pushed and no PR is opened by this plan; publishing (merge to `main`, switching Pages on) is the user's step.

## Review Focus

- A wiki page that links to another page or embeds an image with a relative path (`[x](viewer.md)`, `![](img.png)`) renders in the app's modal but would 404 under `/CuraHub/wiki/…` — the build must fail, not ship a dead link. Test: `check-links` relative-link case (Task 6).
- `base` changes to `/` (custom domain later) — every generated link must still resolve. Test: `joinBase` with base `/` (Task 2).
- A `.md` file added to `src/wiki/` but not to `pages.json` (or the reverse) — the app would silently hide it / the site build would break. Test: `pages.test.ts` set equality (Task 1); build error message (Task 3).
- Inline code in the runbook that merely looks like a path (`../secrets`, a directory, `/run/curahub-secrets/db_password`, a whole shell command) must stay plain code, not become a GitHub link. Test: `repoPathOf` cases (Task 4).
- A screenshot that was never captured — pages still build (text only), so a missing image would ship unnoticed. Test: `shots.test.mjs` asserts every required PNG exists (Task 10).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/wiki/pages.json` (new) | Ordered `{id,title}` list of manual pages — shared by app and site |
| `src/wiki/pages.test.ts` (new) | Manifest ↔ files consistency |
| `src/components/WikiView.tsx` (modify) | Builds its page list from the manifest + `import.meta.glob` |
| `tsconfig.app.json`, `eslint.config.js`, `.dockerignore`, `.gitignore` (modify) | JSON imports; keep `site/` out of lint and the app image |
| `site/package.json`, `site/astro.config.mjs`, `site/tsconfig.json` | The site package |
| `site/src/lib/paths.mjs` + `paths.test.mjs` | `joinBase(base, path)` — pure |
| `site/src/lib/url.ts` | `url(path)` = `joinBase(import.meta.env.BASE_URL, path)` |
| `site/src/lib/wikiPages.ts` | Typed re-export of `src/wiki/pages.json` |
| `site/src/lib/remarkRepoLinks.mjs` + test | Inline-code repo paths → GitHub links |
| `site/src/lib/shots.mjs` + `shots.test.mjs` | Names + alt texts of all required screenshots |
| `site/src/lib/screenshots.ts` | `shot(name)` → `ImageMetadata \| undefined` |
| `site/src/content.config.ts` | Collections `wiki`, `docs`, `legal` |
| `site/src/styles/global.css` | Tokens, fonts, base + prose styles |
| `site/src/layouts/Base.astro` | `<head>`, header, footer |
| `site/src/components/{Header,Footer,Hero,FeatureBlock,WikiArticle,Toc,ShotRow}.astro` | One job each |
| `site/src/pages/{index,setup,[legal]}.astro`, `site/src/pages/wiki/{index,[id]}.astro` | Routes |
| `site/scripts/check-links.mjs` + test | Dead internal links fail the build |
| `site/scripts/capture-screenshots.mjs` | Hand-run CDP capture |
| `site/src/assets/screenshots/*.png`, `CREDITS.md` | Images + sources of the demo works |
| `.github/workflows/site.yml` | Build on PR, deploy on `main` |

---

### Task 1: Shared wiki manifest

**Files:**
- Create: `src/wiki/pages.json`, `src/wiki/pages.test.ts`
- Modify: `src/components/WikiView.tsx:1-30`, `tsconfig.app.json`

**Interfaces:**
- Produces: `src/wiki/pages.json` — `Array<{ id: string; title: string }>`, `id` = file name in `src/wiki/` without `.md`. Task 3 imports it.

- [ ] **Step 1: Write the failing test**

`src/wiki/pages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import pages from './pages.json';

const files = Object.keys(import.meta.glob('./*.md', { query: '?raw' }))
    .map((p) => p.slice(2, -3))
    .sort();

describe('wiki manifest', () => {
    it('lists exactly the markdown files in src/wiki', () => {
        expect(pages.map((p) => p.id).sort()).toEqual(files);
    });

    it('has unique ids and non-empty titles', () => {
        expect(new Set(pages.map((p) => p.id)).size).toBe(pages.length);
        for (const page of pages) expect(page.title.trim()).not.toBe('');
    });

    it('keeps the manual order', () => {
        expect(pages.map((p) => p.id)).toEqual([
            'access-control',
            'project-management',
            'asset-management',
            '3d-scene',
            '2d-wall-editor',
            'viewer',
            'admin',
        ]);
    });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run src/wiki/pages.test.ts`
Expected: FAIL — cannot resolve `./pages.json`.

- [ ] **Step 3: Create the manifest**

`src/wiki/pages.json`:

```json
[
  { "id": "access-control", "title": "Benutzer & Rechte" },
  { "id": "project-management", "title": "Ausstellungen & Versionen" },
  { "id": "asset-management", "title": "Asset-Management" },
  { "id": "3d-scene", "title": "3D-Editor (Planer)" },
  { "id": "2d-wall-editor", "title": "2D-Wandeditor" },
  { "id": "viewer", "title": "Viewer-Modus" },
  { "id": "admin", "title": "Admin & Raumverwaltung" }
]
```

In `tsconfig.app.json` add to `compilerOptions`, after `"moduleDetection": "force",`:

```json
    "resolveJsonModule": true,
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/wiki/pages.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Switch `WikiView` to the manifest**

In `src/components/WikiView.tsx` replace everything from the comment `// Import markdown files as raw strings` down to the closing `];` of `const pages` with:

```tsx
import wikiPages from '../wiki/pages.json';

// Order and titles come from src/wiki/pages.json (shared with the project website in site/).
const docs = import.meta.glob<string>('../wiki/*.md', { query: '?raw', import: 'default', eager: true });

interface WikiPage {
  id: string;
  title: string;
  content: string;
}

const pages: WikiPage[] = wikiPages.map(({ id, title }) => ({
  id,
  title,
  content: docs[`../wiki/${id}.md`] ?? '',
}));
```

The four imports at the top (`useState`, `ReactMarkdown`, `remarkGfm`, `BookOpen`) and the component below stay unchanged.

- [ ] **Step 6: Verify**

Run: `npm run lint && npm run test && npm run build`
Expected: lint clean, all Vitest suites pass, build succeeds. In the build output the wiki markdown must still be part of the lazy `WikiView-*.js` chunk: `grep -l "Benutzerhandbuch" dist/assets/*.js` prints one `WikiView-…js` file and `grep -l "Hängehöhe" dist/assets/WikiView-*.js` prints the same file.

- [ ] **Step 7: Commit**

```bash
git add src/wiki/pages.json src/wiki/pages.test.ts src/components/WikiView.tsx tsconfig.app.json
git commit -m "refactor(wiki): page order and titles in a shared manifest"
```

---

### Task 2: Site scaffold, layout and styles

**Files:**
- Create: `site/package.json`, `site/astro.config.mjs`, `site/tsconfig.json`, `site/src/lib/paths.mjs`, `site/src/lib/paths.test.mjs`, `site/src/lib/url.ts`, `site/src/styles/global.css`, `site/src/layouts/Base.astro`, `site/src/components/Header.astro`, `site/src/components/Footer.astro`, `site/src/pages/index.astro`
- Modify: `eslint.config.js:9`, `.dockerignore`, `.gitignore`

**Interfaces:**
- Produces:
  - `joinBase(base: string, path: string): string` (`site/src/lib/paths.mjs`)
  - `url(path: string): string` (`site/src/lib/url.ts`)
  - `Base.astro` props `{ title: string; description?: string }`, default slot = page content inside `<main>`
  - CSS classes `.container`, `.prose`, `.button`, `.button--ghost`, `.section`

- [ ] **Step 1: Create the package**

```bash
mkdir -p site && cd site
npm init -y
npm pkg set name=curahub-site private=true type=module
npm pkg delete main keywords author license description
npm pkg set scripts.dev="astro dev" scripts.build="astro build" scripts.preview="astro preview" scripts.test="node --test"
npm install astro @astrojs/markdown-remark unist-util-visit sharp
```

Expected: `site/package.json` with `astro` ≥ 7 in `dependencies`, `site/package-lock.json` written.

`site/tsconfig.json`:

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": { "resolveJsonModule": true, "allowJs": true },
  "include": [".astro/types.d.ts", "src"]
}
```

- [ ] **Step 2: Keep `site/` out of the app's tooling**

`eslint.config.js` line 9: `globalIgnores(['dist', 'site']),`

Append to `.dockerignore`:

```
site
.github
```

Append to `.gitignore`:

```
# Project website (site/)
.astro
```

(`node_modules` and `dist` in `.gitignore` already match `site/node_modules` and `site/dist`.)

- [ ] **Step 3: Write the failing test for `joinBase`**

`site/src/lib/paths.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinBase } from './paths.mjs';

test('prefixes the base path', () => {
    assert.equal(joinBase('/CuraHub/', '/wiki/'), '/CuraHub/wiki/');
    assert.equal(joinBase('/CuraHub', '/wiki/'), '/CuraHub/wiki/');
    assert.equal(joinBase('/CuraHub/', 'wiki/'), '/CuraHub/wiki/');
});

test('root path keeps one trailing slash', () => {
    assert.equal(joinBase('/CuraHub/', '/'), '/CuraHub/');
    assert.equal(joinBase('/CuraHub', ''), '/CuraHub/');
});

test('keeps anchors and queries', () => {
    assert.equal(joinBase('/CuraHub/', '/#funktionen'), '/CuraHub/#funktionen');
    assert.equal(joinBase('/CuraHub/', '/setup/#update'), '/CuraHub/setup/#update');
});

test('works without a base (custom domain)', () => {
    assert.equal(joinBase('/', '/wiki/'), '/wiki/');
    assert.equal(joinBase('/', '/'), '/');
    assert.equal(joinBase('', '/setup/'), '/setup/');
});
```

Run: `cd site && npm test`
Expected: FAIL — cannot find module `./paths.mjs`.

- [ ] **Step 4: Implement**

`site/src/lib/paths.mjs`:

```js
/**
 * Joins the site's base path and a site-absolute path.
 * @param {string} base  e.g. '/CuraHub/', '/CuraHub', '/' or ''
 * @param {string} path  e.g. '/wiki/', 'wiki/', '/#funktionen'
 * @returns {string}
 */
export function joinBase(base, path) {
    const head = base.replace(/\/+$/, '');
    const tail = path.replace(/^\/+/, '');
    return `${head}/${tail}`;
}
```

`site/src/lib/url.ts`:

```ts
import { joinBase } from './paths.mjs';

/** Site-internal link. The only place that knows the base path. */
export function url(path: string): string {
    return joinBase(import.meta.env.BASE_URL, path);
}
```

Run: `cd site && npm test`
Expected: 4 passed.

- [ ] **Step 5: Astro config**

`site/astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';

export default defineConfig({
    site: 'https://krullmensch.github.io',
    base: '/CuraHub',
    output: 'static',
    trailingSlash: 'always',
    // Fonts, the hero video and the markdown sources live in the app's folders one level up.
    vite: { server: { fs: { allow: ['..'] } } },
});
```

- [ ] **Step 6: Styles**

`site/src/styles/global.css`:

```css
/* Fonts are the app's own files (src/assets/fonts) — nothing is loaded from a third party. */
@font-face {
    font-family: 'Funnel Display';
    src: url('../../../src/assets/fonts/FunnelDisplay-Variable.woff2') format('woff2-variations');
    font-weight: 300 800;
    font-style: normal;
    font-display: swap;
}
@font-face {
    font-family: 'Albert Sans';
    src: url('../../../src/assets/fonts/albert-sans-latin-ext-wght-normal.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
@font-face {
    font-family: 'Albert Sans';
    src: url('../../../src/assets/fonts/albert-sans-latin-wght-normal.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
    font-family: 'Albert Sans';
    src: url('../../../src/assets/fonts/albert-sans-latin-wght-italic.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: italic;
    font-display: swap;
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

:root {
    --bg: #09090b;
    --surface: #18181b;
    --border: rgba(63, 63, 70, 0.6);
    --text: #d4d4d8;
    --strong: #f4f4f5;
    --muted: #a1a1aa;
    --accent: #60a5fa;
    --button: #2563eb;
    --display: 'Funnel Display', sans-serif;
    --body: 'Albert Sans', sans-serif;
    --width: 72rem;
    color-scheme: dark;
}

*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 5rem; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: var(--body);
    font-size: 1.0625rem;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
}
h1, h2, h3 { font-family: var(--display); color: var(--strong); line-height: 1.15; margin: 0 0 0.75rem; }
h1 { font-size: clamp(2.25rem, 5vw, 3.75rem); font-weight: 700; }
h2 { font-size: clamp(1.6rem, 3vw, 2.25rem); font-weight: 600; }
h3 { font-size: 1.25rem; font-weight: 600; }
p { margin: 0 0 1rem; }
a { color: var(--accent); text-underline-offset: 2px; }
a:hover { color: #93c5fd; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 2px; }
img, video { max-width: 100%; height: auto; display: block; }

.container { width: 100%; max-width: var(--width); margin: 0 auto; padding: 0 1.25rem; }
.section { padding: 4.5rem 0; border-top: 1px solid var(--border); }
.lead { font-size: 1.2rem; color: var(--text); max-width: 46rem; }
.muted { color: var(--muted); }

.button {
    display: inline-block;
    padding: 0.7rem 1.25rem;
    border-radius: 0.5rem;
    background: var(--button);
    color: #fff;
    font-weight: 600;
    text-decoration: none;
    border: 1px solid transparent;
}
.button:hover { background: #1d4ed8; color: #fff; }
.button--ghost { background: transparent; border-color: var(--border); color: var(--strong); }
.button--ghost:hover { background: var(--surface); color: var(--strong); }

.skip-link { position: absolute; left: -999px; top: 0; background: var(--button); color: #fff; padding: 0.5rem 1rem; z-index: 100; }
.skip-link:focus { left: 0; }

/* Rendered markdown (wiki, setup guide, legal) — same look as .wiki-content in the app. */
.prose { max-width: 46rem; }
.prose h1 { font-size: 2rem; margin-bottom: 1rem; }
.prose h2 { font-size: 1.35rem; color: #e4e4e7; margin-top: 2.25rem; }
.prose h3 { font-size: 1.1rem; color: var(--text); margin-top: 1.5rem; }
.prose p, .prose ul, .prose ol { color: var(--muted); }
.prose ul, .prose ol { padding-left: 1.5rem; margin: 0 0 1rem; }
.prose li { margin-bottom: 0.35rem; }
.prose strong { color: #e4e4e7; }
.prose code {
    background: rgba(63, 63, 70, 0.5);
    color: #93c5fd;
    padding: 0.15rem 0.4rem;
    border-radius: 0.25rem;
    font-size: 0.875em;
    overflow-wrap: anywhere;
}
.prose a code { text-decoration: underline; }
.prose pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    overflow-x: auto;
    margin: 0 0 1rem;
}
.prose pre code { background: none; padding: 0; overflow-wrap: normal; }
.prose table { width: 100%; border-collapse: collapse; font-size: 0.9rem; color: var(--muted); margin-bottom: 1rem; }
.prose th, .prose td { border-bottom: 1px solid var(--border); padding: 0.4rem 0.75rem 0.4rem 0; text-align: left; vertical-align: top; }
.prose th { color: #e4e4e7; font-weight: 600; }
```

- [ ] **Step 7: Header, footer, layout**

`site/src/components/Header.astro`:

```astro
---
import { url } from '../lib/url';

const links = [
    { href: url('/#funktionen'), label: 'Funktionen' },
    { href: url('/wiki/'), label: 'Wiki' },
    { href: url('/setup/'), label: 'Setup-Guide' },
];
const current = Astro.url.pathname;
---
<header class="site-header">
    <div class="container bar">
        <a class="wordmark" href={url('/')}>CuraHub</a>
        <nav aria-label="Hauptnavigation">
            <ul>
                {links.map((link) => (
                    <li>
                        <a href={link.href} aria-current={current.startsWith(link.href) && !link.href.includes('#') ? 'page' : undefined}>
                            {link.label}
                        </a>
                    </li>
                ))}
                <li><a href="https://github.com/krullmensch/CuraHub" rel="noopener">GitHub</a></li>
            </ul>
        </nav>
    </div>
</header>

<style>
    .site-header {
        position: sticky;
        top: 0;
        z-index: 50;
        background: rgba(9, 9, 11, 0.85);
        backdrop-filter: blur(8px);
        border-bottom: 1px solid var(--border);
    }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 3.75rem; flex-wrap: wrap; }
    .wordmark { font-family: var(--display); font-weight: 700; font-size: 1.25rem; color: var(--strong); text-decoration: none; }
    ul { display: flex; gap: 1.25rem; list-style: none; margin: 0; padding: 0; flex-wrap: wrap; }
    nav a { color: var(--muted); text-decoration: none; font-size: 0.95rem; padding: 0.5rem 0; display: inline-block; }
    nav a:hover, nav a[aria-current='page'] { color: var(--strong); }
</style>
```

`site/src/components/Footer.astro` (the Impressum link is added in Task 6):

```astro
---
---
<footer class="site-footer">
    <div class="container row">
        <p class="muted">CuraHub — entstanden an der HSBI (Hochschule Bielefeld).</p>
        <ul>
            <li><a href="https://github.com/krullmensch/CuraHub" rel="noopener">GitHub</a></li>
        </ul>
    </div>
</footer>

<style>
    .site-footer { border-top: 1px solid var(--border); padding: 2rem 0; margin-top: 4rem; font-size: 0.95rem; }
    .row { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; }
    p { margin: 0; }
    ul { display: flex; gap: 1.25rem; list-style: none; margin: 0; padding: 0; }
</style>
```

`site/src/layouts/Base.astro`:

```astro
---
import '../styles/global.css';
import Header from '../components/Header.astro';
import Footer from '../components/Footer.astro';

interface Props {
    title: string;
    description?: string;
}

const {
    title,
    description = 'CuraHub ist ein Planungswerkzeug für Ausstellungen im Browser: Werke in 3D platzieren, Wände einrichten, Versionen veröffentlichen.',
} = Astro.props;
const fullTitle = title === 'CuraHub' ? title : `${title} · CuraHub`;
---
<!doctype html>
<html lang="de">
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{fullTitle}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={new URL(Astro.url.pathname, Astro.site).href} />
    </head>
    <body>
        <a class="skip-link" href="#inhalt">Zum Inhalt springen</a>
        <Header />
        <main id="inhalt">
            <slot />
        </main>
        <Footer />
    </body>
</html>
```

`site/src/pages/index.astro` (replaced in Task 5):

```astro
---
import Base from '../layouts/Base.astro';
---
<Base title="CuraHub">
    <section class="container section">
        <h1>CuraHub</h1>
        <p class="lead">Ausstellungen im Browser planen.</p>
    </section>
</Base>
```

- [ ] **Step 8: Build**

Run: `cd site && npm run build`
Expected: "1 page(s) built", `site/dist/index.html` exists, `grep -c "/CuraHub/wiki/" dist/index.html` ≥ 1, `ls dist/_astro/*.woff2` lists four font files.

Run from the repo root: `npm run lint`
Expected: clean (no file under `site/` linted).

- [ ] **Step 9: Commit**

```bash
git add site/package.json site/package-lock.json site/astro.config.mjs site/tsconfig.json site/src eslint.config.js .dockerignore .gitignore
git commit -m "feat(site): Astro package with layout, styles and base-path helper"
```

---

### Task 3: Wiki pages

**Files:**
- Create: `site/src/content.config.ts`, `site/src/lib/wikiPages.ts`, `site/src/components/WikiArticle.astro`, `site/src/pages/wiki/index.astro`, `site/src/pages/wiki/[id].astro`

**Interfaces:**
- Consumes: `src/wiki/pages.json` (Task 1), `url()`, `Base.astro`, `.prose` (Task 2)
- Produces: collection `wiki` (entry id = file name without `.md`); `wikiPages: WikiPageMeta[]` with `interface WikiPageMeta { id: string; title: string }`; `WikiArticle.astro` props `{ id: string }`. Task 4 extends `content.config.ts` with `docs`, Task 6 with `legal`.

- [ ] **Step 1: Collection and manifest**

`site/src/content.config.ts`:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The manual's markdown is the app's own (src/wiki) — one source, no copies.
const wiki = defineCollection({
    loader: glob({ pattern: '*.md', base: '../src/wiki' }),
});

export const collections = { wiki };
```

`site/src/lib/wikiPages.ts`:

```ts
import pages from '../../../src/wiki/pages.json';

export interface WikiPageMeta {
    id: string;
    title: string;
}

/** Manual pages in reading order — the same list the app's WikiView uses. */
export const wikiPages: WikiPageMeta[] = pages;
```

- [ ] **Step 2: Article with sidebar**

`site/src/components/WikiArticle.astro`:

```astro
---
import { getEntry, render } from 'astro:content';
import Base from '../layouts/Base.astro';
import { url } from '../lib/url';
import { wikiPages } from '../lib/wikiPages';

interface Props {
    id: string;
}

const { id } = Astro.props;
const meta = wikiPages.find((page) => page.id === id);
const entry = await getEntry('wiki', id);
if (!meta || !entry) {
    throw new Error(`Wiki-Seite "${id}" steht in src/wiki/pages.json, aber src/wiki/${id}.md fehlt (oder umgekehrt).`);
}
const { Content } = await render(entry);
---
<Base title={`${meta.title} · Wiki`} description={`CuraHub-Benutzerhandbuch: ${meta.title}`}>
    <div class="container wiki">
        <nav class="sidebar" aria-label="Benutzerhandbuch">
            <p class="sidebar-title">Benutzerhandbuch</p>
            <ul>
                {wikiPages.map((page) => (
                    <li>
                        <a href={url(`/wiki/${page.id}/`)} aria-current={page.id === id ? 'page' : undefined}>
                            {page.title}
                        </a>
                    </li>
                ))}
            </ul>
        </nav>
        <article class="prose">
            <Content />
        </article>
    </div>
</Base>

<style>
    .wiki { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 3rem; padding-top: 2.5rem; align-items: start; }
    .sidebar { position: sticky; top: 5rem; }
    .sidebar-title { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.75rem; }
    .sidebar ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.125rem; }
    .sidebar a { display: block; padding: 0.5rem 0.75rem; border-radius: 0.5rem; color: var(--muted); text-decoration: none; font-size: 0.95rem; }
    .sidebar a:hover { background: var(--surface); color: var(--strong); }
    .sidebar a[aria-current='page'] { background: rgba(37, 99, 235, 0.2); color: var(--accent); font-weight: 500; }
    @media (max-width: 767px) {
        .wiki { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }
        .sidebar { position: static; border-bottom: 1px solid var(--border); padding-bottom: 1rem; }
    }
</style>
```

- [ ] **Step 3: Routes**

`site/src/pages/wiki/[id].astro`:

```astro
---
import WikiArticle from '../../components/WikiArticle.astro';
import { wikiPages } from '../../lib/wikiPages';

export function getStaticPaths() {
    return wikiPages.map((page) => ({ params: { id: page.id } }));
}

const { id } = Astro.params;
---
<WikiArticle id={id} />
```

`site/src/pages/wiki/index.astro`:

```astro
---
import WikiArticle from '../../components/WikiArticle.astro';
import { wikiPages } from '../../lib/wikiPages';
---
<WikiArticle id={wikiPages[0].id} />
```

- [ ] **Step 4: Build and check**

Run: `cd site && npm run build`
Expected: 9 pages built. Then:

```bash
ls dist/wiki            # 2d-wall-editor 3d-scene access-control admin asset-management index.html project-management viewer
grep -c 'aria-current="page"' dist/wiki/3d-scene/index.html     # 2 — the sidebar entry and the header's "Wiki" link
grep -o "<h1[^>]*>[^<]*" dist/wiki/3d-scene/index.html          # <h1 …>3D-Editor (Planer-Modus)
grep -c "<table" dist/wiki/2d-wall-editor/index.html            # ≥ 0; if the source has a GFM table it must be ≥ 1 (check: grep -c "^|" ../src/wiki/2d-wall-editor.md)
```

If a GFM table in a wiki file is not rendered as `<table>`, GFM is off in the default processor: do Task 4 Step 3 first (unified processor, GFM on by default) and re-check.

- [ ] **Step 5: Prove the build fails on a manifest/file mismatch**

```bash
mv ../src/wiki/viewer.md ../src/wiki/viewer.md.off && npm run build; echo "exit $?"; mv ../src/wiki/viewer.md.off ../src/wiki/viewer.md
```

Expected: build error containing `Wiki-Seite "viewer" steht in src/wiki/pages.json`, `exit 1`. Afterwards `git status --short ../src/wiki` is empty.

- [ ] **Step 6: Commit**

```bash
git add site/src/content.config.ts site/src/lib/wikiPages.ts site/src/components/WikiArticle.astro site/src/pages/wiki
git commit -m "feat(site): user manual rendered from src/wiki"
```

---

### Task 4: Setup guide

**Files:**
- Create: `site/src/lib/remarkRepoLinks.mjs`, `site/src/lib/remarkRepoLinks.test.mjs`, `site/src/lib/shots.mjs`, `site/src/lib/screenshots.ts`, `site/src/components/Toc.astro`, `site/src/components/ShotRow.astro`, `site/src/pages/setup.astro`, `site/src/assets/screenshots/.gitkeep`
- Modify: `site/astro.config.mjs`, `site/src/content.config.ts`

**Interfaces:**
- Consumes: `Base.astro`, `.prose`, `url()`
- Produces:
  - `repoPathOf(value: string, repoRoot: string): string | null`, `remarkRepoLinks({ repoRoot })` (remark plugin)
  - `site/src/lib/shots.mjs`: `FEATURE_SHOTS`, `WIZARD_SHOTS` — `Array<{ name: string; alt: string }>`; `ALL_SHOTS`
  - `shot(name: string): ImageMetadata | undefined` (`site/src/lib/screenshots.ts`)
  - `ShotRow.astro` props `{ shots: { name: string; alt: string }[] }` — renders only the shots whose PNG exists
  - collection `docs` with entry id `deployment`

- [ ] **Step 1: Failing test for the path check**

`site/src/lib/remarkRepoLinks.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { remarkRepoLinks, repoPathOf } from './remarkRepoLinks.mjs';

const root = mkdtempSync(path.join(tmpdir(), 'repo-'));
mkdirSync(path.join(root, 'deploy/apache'), { recursive: true });
writeFileSync(path.join(root, 'deploy/apache/curahub.conf'), '');

test('an existing file path is a repo path', () => {
    assert.equal(repoPathOf('deploy/apache/curahub.conf', root), 'deploy/apache/curahub.conf');
});

test('everything else is not', () => {
    assert.equal(repoPathOf('deploy/apache', root), null); // directory
    assert.equal(repoPathOf('deploy/apache/missing.conf', root), null);
    assert.equal(repoPathOf('/run/curahub-secrets/db_password', root), null); // absolute
    assert.equal(repoPathOf('../' + path.basename(root) + '/deploy/apache/curahub.conf', root), null); // leaves the repo
    assert.equal(repoPathOf('docker compose logs app | grep Setup-Code', root), null); // a command
    assert.equal(repoPathOf('curahub', root), null); // no slash
});

test('the plugin wraps matching inline code in a link and leaves the rest', () => {
    const tree = {
        type: 'root',
        children: [
            {
                type: 'paragraph',
                children: [
                    { type: 'inlineCode', value: 'deploy/apache/curahub.conf' },
                    { type: 'inlineCode', value: 'apachectl configtest' },
                ],
            },
            { type: 'link', url: 'https://example.org', children: [{ type: 'inlineCode', value: 'deploy/apache/curahub.conf' }] },
        ],
    };
    remarkRepoLinks({ repoRoot: root })(tree);
    const [first, second] = tree.children[0].children;
    assert.equal(first.type, 'link');
    assert.equal(first.url, 'https://github.com/krullmensch/CuraHub/blob/main/deploy/apache/curahub.conf');
    assert.deepEqual(first.children, [{ type: 'inlineCode', value: 'deploy/apache/curahub.conf' }]);
    assert.equal(second.type, 'inlineCode');
    assert.equal(tree.children[1].children[0].type, 'inlineCode'); // already inside a link
});
```

Run: `cd site && npm test`
Expected: FAIL — cannot find module `./remarkRepoLinks.mjs`.

- [ ] **Step 2: Implement the plugin**

`site/src/lib/remarkRepoLinks.mjs`:

```js
import { statSync } from 'node:fs';
import path from 'node:path';
import { visit } from 'unist-util-visit';

const REPO_BLOB = 'https://github.com/krullmensch/CuraHub/blob/main/';

/**
 * @param {string} value     text of an inline code span
 * @param {string} repoRoot  absolute path of the repository root
 * @returns {string | null}  the path if it names an existing file inside the repo
 */
export function repoPathOf(value, repoRoot) {
    // Relative, at least one directory, no spaces or shell syntax.
    if (!/^[\w.-]+(\/[\w.-]+)+$/.test(value)) return null;
    const absolute = path.resolve(repoRoot, value);
    if (!absolute.startsWith(path.resolve(repoRoot) + path.sep)) return null;
    try {
        return statSync(absolute).isFile() ? value : null;
    } catch {
        return null;
    }
}

/** Remark plugin: inline code that is a path to a file in this repo becomes a link to it on GitHub. */
export function remarkRepoLinks({ repoRoot }) {
    return (tree) => {
        visit(tree, 'inlineCode', (node, index, parent) => {
            if (!parent || index === undefined || parent.type === 'link') return;
            const repoPath = repoPathOf(node.value, repoRoot);
            if (!repoPath) return;
            parent.children[index] = { type: 'link', url: REPO_BLOB + repoPath, children: [node] };
        });
    };
}
```

Run: `cd site && npm test`
Expected: all tests pass (4 from Task 2 + 3 new).

- [ ] **Step 3: Use the unified processor with the plugin**

`site/astro.config.mjs` — full file:

```js
import { fileURLToPath } from 'node:url';
import { unified } from '@astrojs/markdown-remark';
import { defineConfig } from 'astro/config';
import { remarkRepoLinks } from './src/lib/remarkRepoLinks.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
    site: 'https://krullmensch.github.io',
    base: '/CuraHub',
    output: 'static',
    trailingSlash: 'always',
    markdown: {
        processor: unified({
            remarkPlugins: [[remarkRepoLinks, { repoRoot }]],
        }),
    },
    // Fonts, the hero video and the markdown sources live in the app's folders one level up.
    vite: { server: { fs: { allow: ['..'] } } },
});
```

`site/src/content.config.ts` — add the `docs` collection:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The manual's markdown is the app's own (src/wiki) — one source, no copies.
const wiki = defineCollection({
    loader: glob({ pattern: '*.md', base: '../src/wiki' }),
});

// The runbook the repo shows on GitHub.
const docs = defineCollection({
    loader: glob({ pattern: 'deployment.md', base: '../docs' }),
});

export const collections = { wiki, docs };
```

- [ ] **Step 4: Screenshot names and lookup**

`site/src/lib/shots.mjs`:

```js
/** Every screenshot the site shows. File: site/src/assets/screenshots/<name>.png */
export const FEATURE_SHOTS = [
    { name: 'planer-3d', alt: 'Der 3D-Planer: Ausstellungsraum von schräg oben, mehrere Werke an den Wänden sind ausgewählt.' },
    { name: 'wandeditor-2d', alt: 'Der 2D-Wandeditor: eine Wand frontal mit Hängelinie, Abstandsmaßen und Hilfslinien.' },
    { name: 'medien', alt: 'Die Medienbibliothek mit Bildern, einem Video, einem 3D-Modell und einem Buch.' },
    { name: 'rahmen', alt: 'Ein ausgewähltes Bild mit Rahmen und Passepartout, daneben die Rahmenauswahl.' },
    { name: 'versionen', alt: 'Die Versionsübersicht einer Ausstellung mit veröffentlichter Version.' },
    { name: 'rundgang', alt: 'Der Rundgang aus der Ich-Perspektive: Blick entlang einer Wand mit Werken.' },
];

export const WIZARD_SHOTS = [
    { name: 'setup-1-code', alt: 'Einrichtungsassistent, Schritt 1: Eingabe des Setup-Codes.' },
    { name: 'setup-2-systemcheck', alt: 'Einrichtungsassistent, Schritt 2: Systemcheck mit bestandenen Prüfungen.' },
    { name: 'setup-3-adresse', alt: 'Einrichtungsassistent, Schritt 3: öffentliche Adresse der Installation.' },
    { name: 'setup-4-notfall-admin', alt: 'Einrichtungsassistent, Schritt 4: Notfall-Admin anlegen.' },
    { name: 'setup-5-hsbi-admin', alt: 'Einrichtungsassistent, Schritt 5: HSBI-Admin festlegen.' },
];

export const ALL_SHOTS = [...FEATURE_SHOTS, ...WIZARD_SHOTS];
```

`site/src/lib/screenshots.ts`:

```ts
import type { ImageMetadata } from 'astro';

const files = import.meta.glob<{ default: ImageMetadata }>('../assets/screenshots/*.png', { eager: true });

/** The screenshot with this name, or undefined while it has not been captured yet. */
export function shot(name: string): ImageMetadata | undefined {
    return files[`../assets/screenshots/${name}.png`]?.default;
}
```

Create the empty folder marker: `touch site/src/assets/screenshots/.gitkeep`

- [ ] **Step 5: Table of contents and screenshot row**

`site/src/components/Toc.astro`:

```astro
---
interface Props {
    headings: { depth: number; slug: string; text: string }[];
}

const items = Astro.props.headings.filter((heading) => heading.depth === 2);
---
<nav class="toc" aria-label="Inhalt">
    <p class="toc-title">Inhalt</p>
    <ol>
        {items.map((item) => (
            <li><a href={`#${item.slug}`}>{item.text}</a></li>
        ))}
    </ol>
</nav>

<style>
    .toc { position: sticky; top: 5rem; }
    .toc-title { font-size: 0.75rem; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.75rem; }
    ol { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.125rem; }
    a { display: block; padding: 0.4rem 0.75rem; border-radius: 0.5rem; color: var(--muted); text-decoration: none; font-size: 0.95rem; }
    a:hover { background: var(--surface); color: var(--strong); }
    @media (max-width: 767px) { .toc { position: static; border-bottom: 1px solid var(--border); padding-bottom: 1rem; } }
</style>
```

`site/src/components/ShotRow.astro`:

```astro
---
import { Image } from 'astro:assets';
import { shot } from '../lib/screenshots';

interface Props {
    shots: { name: string; alt: string }[];
}

const available = Astro.props.shots
    .map((entry) => ({ ...entry, image: shot(entry.name) }))
    .filter((entry) => entry.image !== undefined);
---
{available.length > 0 && (
    <ol class="shots">
        {available.map((entry) => (
            <li>
                <Image src={entry.image!} alt={entry.alt} widths={[480, 960]} sizes="(max-width: 767px) 100vw, 20rem" />
            </li>
        ))}
    </ol>
)}

<style>
    .shots { list-style: none; margin: 0 0 2rem; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.75rem; }
    .shots li { border: 1px solid var(--border); border-radius: 0.5rem; overflow: hidden; background: var(--surface); }
</style>
```

- [ ] **Step 6: The page**

`site/src/pages/setup.astro`:

```astro
---
import { getEntry, render } from 'astro:content';
import ShotRow from '../components/ShotRow.astro';
import Toc from '../components/Toc.astro';
import Base from '../layouts/Base.astro';
import { WIZARD_SHOTS } from '../lib/shots.mjs';

const entry = await getEntry('docs', 'deployment');
if (!entry) throw new Error('docs/deployment.md fehlt.');
const { Content, headings } = await render(entry);
---
<Base title="Setup-Guide" description="CuraHub installieren: Voraussetzungen, Neuinstallation mit Docker Compose, Einrichtungsassistent, Backups und Updates.">
    <div class="container guide">
        <Toc headings={headings} />
        <div>
            <section aria-label="Der Einrichtungsassistent in Bildern">
                <ShotRow shots={WIZARD_SHOTS} />
            </section>
            <article class="prose">
                <Content />
            </article>
        </div>
    </div>
</Base>

<style>
    .guide { display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 3rem; padding-top: 2.5rem; align-items: start; }
    @media (max-width: 767px) { .guide { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; } }
</style>
```

- [ ] **Step 7: Build and check**

Run: `cd site && npm run build`
Expected: 10 pages. Then:

```bash
grep -o 'href="https://github.com/krullmensch/CuraHub/blob/main/[^"]*"' dist/setup/index.html
# → href="https://github.com/krullmensch/CuraHub/blob/main/deploy/apache/curahub.conf"   (exactly this one)
grep -o 'href="#[^"]*"' dist/setup/index.html | head -8
# → #voraussetzungen #neuinstallation #backups #update #notfälle #bestehende-installation
grep -c 'id="neuinstallation"' dist/setup/index.html   # 1
grep -c "<pre" dist/setup/index.html                    # ≥ 3 (the bash blocks)
```

- [ ] **Step 8: Commit**

```bash
git add site/astro.config.mjs site/src/content.config.ts site/src/lib site/src/components/Toc.astro site/src/components/ShotRow.astro site/src/pages/setup.astro site/src/assets/screenshots/.gitkeep
git commit -m "feat(site): setup guide rendered from docs/deployment.md"
```

---

### Task 5: Landing page

**Files:**
- Create: `site/src/components/Hero.astro`, `site/src/components/FeatureBlock.astro`
- Modify: `site/src/pages/index.astro` (replace)

**Interfaces:**
- Consumes: `Base.astro`, `url()`, `shot()`, `FEATURE_SHOTS`
- Produces: `FeatureBlock.astro` props `{ title: string; shotName: string; alt: string; flip?: boolean }`, default slot = text

- [ ] **Step 1: Hero**

`site/src/components/Hero.astro`:

```astro
---
import poster from '../../../public/BG_Video_CuraHub-poster.webp';
import videoUrl from '../../../public/BG_Video_CuraHub-720p.webm?url';
import { url } from '../lib/url';
---
<section class="hero">
    <!-- The video is only requested by the script below; without it the poster stays. -->
    <video class="hero-video" data-hero-video data-src={videoUrl} poster={poster.src} muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>
    <div class="hero-shade"></div>
    <div class="container hero-text">
        <h1>Ausstellungen planen, bevor die erste Schraube sitzt.</h1>
        <p class="lead">
            CuraHub ist ein Planungswerkzeug im Browser: Werke im 3D-Raum platzieren, Wände millimetergenau einrichten,
            Entwürfe als Versionen sichern und als Rundgang teilen.
        </p>
        <p class="actions">
            <a class="button" href={url('/setup/')}>Setup-Guide</a>
            <a class="button button--ghost" href="https://github.com/krullmensch/CuraHub" rel="noopener">GitHub</a>
        </p>
    </div>
</section>

<script>
    // Same rule as the app's HomePage: no video for reduced motion or Save-Data, and only after first paint.
    const video = document.querySelector<HTMLVideoElement>('[data-hero-video]');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

    if (video && !reducedMotion && !saveData) {
        const start = () => {
            video.src = video.dataset.src ?? '';
            video.play().catch(() => {
                // Autoplay blocked — the poster stays visible.
            });
        };
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(start, { timeout: 2000 });
        } else {
            window.setTimeout(start, 200);
        }
    }
</script>

<style>
    .hero { position: relative; min-height: min(78vh, 44rem); display: flex; align-items: flex-end; overflow: hidden; }
    .hero-video { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; object-fit: cover; }
    .hero-shade { position: absolute; inset: 0; background: linear-gradient(to top, #09090b 5%, rgba(9, 9, 11, 0.55) 55%, rgba(9, 9, 11, 0.35)); }
    .hero-text { position: relative; padding-top: 6rem; padding-bottom: 4rem; }
    .hero-text h1 { max-width: 18ch; }
    .hero-text .lead { color: #e4e4e7; }
    .actions { display: flex; gap: 0.75rem; flex-wrap: wrap; margin: 1.5rem 0 0; }
</style>
```

- [ ] **Step 2: Feature block**

`site/src/components/FeatureBlock.astro`:

```astro
---
import { Image } from 'astro:assets';
import { shot } from '../lib/screenshots';

interface Props {
    title: string;
    shotName: string;
    alt: string;
    flip?: boolean;
}

const { title, shotName, alt, flip = false } = Astro.props;
const image = shot(shotName);
---
<article class:list={['feature', { flip, plain: !image }]}>
    <div class="text">
        <h3>{title}</h3>
        <slot />
    </div>
    {image && (
        <div class="frame">
            <Image src={image} alt={alt} widths={[640, 1280, 1920]} sizes="(max-width: 899px) 100vw, 42rem" />
        </div>
    )}
</article>

<style>
    .feature { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 3rem; align-items: center; padding: 2.5rem 0; }
    .feature.flip .text { order: 2; }
    .feature.plain { grid-template-columns: minmax(0, 1fr); }
    .text { color: var(--muted); max-width: 34rem; }
    .text h3 { font-size: 1.5rem; }
    .frame { border: 1px solid var(--border); border-radius: 0.75rem; overflow: hidden; background: var(--surface); }
    @media (max-width: 899px) {
        .feature { grid-template-columns: minmax(0, 1fr); gap: 1.25rem; }
        .feature.flip .text { order: 0; }
    }
</style>
```

- [ ] **Step 3: The page**

`site/src/pages/index.astro`:

```astro
---
import FeatureBlock from '../components/FeatureBlock.astro';
import Hero from '../components/Hero.astro';
import Base from '../layouts/Base.astro';
import { FEATURE_SHOTS } from '../lib/shots.mjs';
import { url } from '../lib/url';

const alt = (name: string) => FEATURE_SHOTS.find((entry) => entry.name === name)?.alt ?? '';
---
<Base title="CuraHub">
    <Hero />

    <section class="section">
        <div class="container">
            <h2>Was ist CuraHub?</h2>
            <p class="lead">
                CuraHub ist ein Werkzeug, mit dem Kurator:innen eine Ausstellung im Browser planen: im maßstabsgetreuen
                3D-Modell des Raums, mit echten Werkgrößen, Rahmen und Stellwänden.
            </p>
            <p class="lead">
                Es ist an der HSBI (Hochschule Bielefeld) für den Ausstellungsraum „Satellit“ entstanden. Entwürfe lassen
                sich als Versionen sichern, vergleichen und als öffentlicher Rundgang teilen.
            </p>
        </div>
    </section>

    <section class="section" id="funktionen">
        <div class="container">
            <h2>Funktionen</h2>

            <FeatureBlock title="3D-Planer" shotName="planer-3d" alt={alt('planer-3d')}>
                <p>
                    Werke per Drag & Drop an Wände und auf den Boden setzen, verschieben, drehen und skalieren. Mehrere
                    Werke lassen sich gemeinsam auswählen, ausrichten und verteilen.
                </p>
                <p>Stellwände stehen frei im Raum und nehmen Werke auf allen vier Seiten auf.</p>
            </FeatureBlock>

            <FeatureBlock title="2D-Wandeditor" shotName="wandeditor-2d" alt={alt('wandeditor-2d')} flip>
                <p>
                    Jede Wand lässt sich frontal öffnen und wie in einem Layoutprogramm einrichten: Hängehöhe, Abstände
                    zwischen den Werken, Abstand zum Boden, Hilfslinien und Einrasten.
                </p>
                <p>Die Maße erscheinen auch in der 3D-Ansicht.</p>
            </FeatureBlock>

            <FeatureBlock title="Medien" shotName="medien" alt={alt('medien')}>
                <p>
                    Bilder, Videos, 3D-Modelle und Gaussian Splats hochladen; ganze Ordner auf einmal. Videos werden für
                    den Browser umgerechnet, Bilder verkleinert, Maße aus den Metadaten übernommen.
                </p>
                <p>PDFs liegen als Buch auf einem Sockel und lassen sich im Rundgang durchblättern.</p>
            </FeatureBlock>

            <FeatureBlock title="Rahmen und Passepartouts" shotName="rahmen" alt={alt('rahmen')} flip>
                <p>
                    14 Rahmenprofile nach den Sortimenten von HALBE und Max Aab, in den Oberflächen, die es wirklich gibt.
                    Passepartouts mittig, im optischen Zentrum oder im Goldenen Schnitt.
                </p>
                <p>Das Außenmaß steht direkt daneben.</p>
            </FeatureBlock>

            <FeatureBlock title="Versionen und Veröffentlichen" shotName="versionen" alt={alt('versionen')}>
                <p>
                    Jeder Stand einer Ausstellung ist eine Version. Versionen lassen sich verzweigen, zusammenführen und
                    wiederherstellen; eine davon wird veröffentlicht.
                </p>
            </FeatureBlock>

            <FeatureBlock title="Rundgang" shotName="rundgang" alt={alt('rundgang')} flip>
                <p>
                    In der Ich-Perspektive durch den Raum gehen, mit Augenhöhe 1,62 m. Die veröffentlichte Version ist
                    über einen Link ohne Anmeldung begehbar.
                </p>
            </FeatureBlock>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <h2>In drei Schritten</h2>
            <ol class="steps">
                <li>
                    <h3>Installieren</h3>
                    <p class="muted">Repository holen, <code>docker compose up -d --build</code>. Passwörter und Schlüssel erzeugt CuraHub selbst.</p>
                </li>
                <li>
                    <h3>Einrichten</h3>
                    <p class="muted">Der Assistent unter <code>/setup</code> prüft das System und legt die Admin-Konten an.</p>
                </li>
                <li>
                    <h3>Kuratieren</h3>
                    <p class="muted">Kurator:innen freischalten, Werke hochladen, im Raum platzieren, veröffentlichen.</p>
                </li>
            </ol>
            <p><a class="button" href={url('/setup/')}>Zum Setup-Guide</a></p>
        </div>
    </section>

    <section class="section">
        <div class="container two">
            <div>
                <h2>Voraussetzungen</h2>
                <ul class="plain">
                    <li>Linux-Server mit Docker Engine und Compose-Plugin</li>
                    <li>Apache mit TLS-Zertifikat für die Domain</li>
                    <li>Mindestens 10 GB freier Speicher für Uploads</li>
                    <li>Ausgehender HTTPS-Zugriff auf www.hsbi.de für die Anmeldung</li>
                </ul>
            </div>
            <div>
                <h2>Stand und Grenzen</h2>
                <ul class="plain">
                    <li>
                        <strong>Anmeldung über das HSBI-Konto.</strong> Ohne HSBI-Zugang kann sich nur der lokale
                        Notfall-Admin anmelden.
                    </li>
                    <li>
                        <strong>Ein fester Raum.</strong> Das Modell des „Satellit“ ist Teil der Installation; eigene
                        Räume lassen sich noch nicht hochladen.
                    </li>
                </ul>
            </div>
        </div>
    </section>

    <section class="section">
        <div class="container">
            <h2>Technik</h2>
            <p class="lead">
                React, Three.js mit WebGPU (WebGL als Rückfall), Express, Prisma, MariaDB, Docker.
                Der Quelltext liegt auf <a href="https://github.com/krullmensch/CuraHub" rel="noopener">GitHub</a>,
                die Bedienung erklärt das <a href={url('/wiki/')}>Wiki</a>.
            </p>
        </div>
    </section>
</Base>

<style>
    .steps { list-style: none; counter-reset: step; margin: 2rem 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1.25rem; }
    .steps li { counter-increment: step; border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; background: var(--surface); }
    .steps li::before { content: counter(step); font-family: var(--display); font-size: 2rem; font-weight: 700; color: var(--accent); display: block; margin-bottom: 0.5rem; }
    .steps p { margin: 0; }
    .two { display: grid; grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); gap: 3rem; }
    .plain { margin: 0; padding-left: 1.25rem; color: var(--muted); display: grid; gap: 0.6rem; }
    .plain strong { color: var(--strong); }
    code { background: rgba(63, 63, 70, 0.5); color: #93c5fd; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
</style>
```

- [ ] **Step 4: Check the claims in the copy against the code**

Each statement on the page must be true today. Verify and fix the copy (not the code) where it is not:

```bash
grep -c "label:" src/lib/frameStyles.ts; grep -n "PROFILES\b\|FRAME_LINES" src/lib/frameStyles.ts | head   # 14 profiles?
grep -n "PLAYER_EYE\|1.62" src/lib/playerDimensions.ts                                                    # eye height 1.62
grep -rn "merge" server/src/routes/versions.ts | head -3                                                   # versions can be merged
```

- [ ] **Step 5: Build and check**

Run: `cd site && npm run build`
Expected: 10 pages. Then:

```bash
grep -c 'id="funktionen"' dist/index.html                 # 1
grep -o 'data-src="[^"]*"' dist/index.html                 # data-src="/CuraHub/_astro/BG_Video_CuraHub-720p.<hash>.webm"
grep -c '<video[^>]* src=' dist/index.html                 # 0 — the video is never in the HTML as src
grep -o '<h[123][^>]*>' dist/index.html | tr -d '\n'       # one h1, then h2/h3 without skipping a level
```

- [ ] **Step 6: Commit**

```bash
git add site/src/components/Hero.astro site/src/components/FeatureBlock.astro site/src/pages/index.astro
git commit -m "feat(site): landing page"
```

---

### Task 6: Legal pages and dead-link check

**Files:**
- Create: `site/scripts/check-links.mjs`, `site/scripts/check-links.test.mjs`, `site/src/content/legal/.gitkeep`, `site/src/pages/[legal].astro`
- Modify: `site/src/content.config.ts`, `site/src/components/Footer.astro`, `site/package.json` (`build` script)

**Interfaces:**
- Consumes: `Base.astro`, `.prose`, `url()`
- Produces: `findDeadLinks(distDir: string, base: string): { file: string; link: string }[]`; collection `legal` (entry id = file name without `.md`, e.g. `impressum`)

- [ ] **Step 1: Failing test**

`site/scripts/check-links.test.mjs`:

```js
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { findDeadLinks } from './check-links.mjs';

function site(files) {
    const dir = mkdtempSync(path.join(tmpdir(), 'dist-'));
    for (const [name, content] of Object.entries(files)) {
        const file = path.join(dir, name);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(file, content);
    }
    return dir;
}

test('accepts links that resolve to files', () => {
    const dir = site({
        'index.html': '<a href="/CuraHub/wiki/">w</a><a href="/CuraHub/#funktionen">f</a><img src="/CuraHub/_astro/a.png"><a href="https://example.org/x">e</a><a href="#top">t</a><a href="mailto:a@b.de">m</a>',
        'wiki/index.html': '<a href="/CuraHub/">home</a><a href="/CuraHub/setup/?x=1#update">s</a>',
        'setup/index.html': '',
        '_astro/a.png': '',
    });
    assert.deepEqual(findDeadLinks(dir, '/CuraHub/'), []);
});

test('reports a missing page and a missing asset', () => {
    const dir = site({ 'index.html': '<a href="/CuraHub/nope/">n</a><img srcset="/CuraHub/_astro/a.webp 480w, /CuraHub/_astro/b.webp 960w">', '_astro/a.webp': '' });
    assert.deepEqual(findDeadLinks(dir, '/CuraHub/'), [
        { file: 'index.html', link: '/CuraHub/nope/' },
        { file: 'index.html', link: '/CuraHub/_astro/b.webp' },
    ]);
});

test('reports relative links from markdown that do not exist next to the page', () => {
    const dir = site({ 'wiki/viewer/index.html': '<a href="admin.md">a</a><img src="bild.png">' });
    assert.deepEqual(findDeadLinks(dir, '/CuraHub/'), [
        { file: 'wiki/viewer/index.html', link: 'admin.md' },
        { file: 'wiki/viewer/index.html', link: 'bild.png' },
    ]);
});

test('reports site-absolute links that miss the base path', () => {
    const dir = site({ 'index.html': '<a href="/wiki/">w</a>', 'wiki/index.html': '' });
    assert.deepEqual(findDeadLinks(dir, '/CuraHub/'), [{ file: 'index.html', link: '/wiki/' }]);
});

test('works with base "/"', () => {
    const dir = site({ 'index.html': '<a href="/wiki/">w</a>', 'wiki/index.html': '' });
    assert.deepEqual(findDeadLinks(dir, '/'), []);
});
```

Run: `cd site && npm test`
Expected: FAIL — cannot find module `./check-links.mjs`.

- [ ] **Step 2: Implement**

`site/scripts/check-links.mjs`:

```js
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ATTRIBUTE = /\s(?:href|src|poster|data-src)="([^"]*)"/g;
const SRCSET = /\ssrcset="([^"]*)"/g;

function htmlFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return htmlFiles(full);
        return entry.name.endsWith('.html') ? [full] : [];
    });
}

function linksIn(html) {
    const links = [...html.matchAll(ATTRIBUTE)].map((match) => match[1]);
    for (const match of html.matchAll(SRCSET)) {
        for (const candidate of match[1].split(',')) links.push(candidate.trim().split(/\s+/)[0]);
    }
    return links.filter(Boolean);
}

function isFile(file) {
    return existsSync(file) && statSync(file).isFile();
}

/**
 * Internal links in the built site that point at nothing.
 * @param {string} distDir  the build output directory
 * @param {string} base     the site's base path, e.g. '/CuraHub/' or '/'
 * @returns {{ file: string, link: string }[]}
 */
export function findDeadLinks(distDir, base) {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    const dead = [];
    for (const file of htmlFiles(distDir)) {
        const relative = path.relative(distDir, file);
        for (const link of linksIn(readFileSync(file, 'utf8'))) {
            if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(link)) continue; // external, mailto:, data:, same-page anchor
            const clean = decodeURIComponent(link.split('#')[0].split('?')[0]);
            let target;
            if (clean.startsWith('/')) {
                if (!clean.startsWith(prefix) && clean !== prefix.slice(0, -1)) {
                    dead.push({ file: relative, link });
                    continue;
                }
                target = path.join(distDir, clean.slice(prefix.length));
            } else {
                target = path.resolve(path.dirname(file), clean);
            }
            if (clean.endsWith('/') || clean === '' || clean === prefix.slice(0, -1)) target = path.join(target, 'index.html');
            if (!isFile(target)) dead.push({ file: relative, link });
        }
    }
    return dead;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const distDir = fileURLToPath(new URL('../dist', import.meta.url));
    const base = process.argv[2] ?? '/CuraHub/';
    const dead = findDeadLinks(distDir, base);
    for (const { file, link } of dead) console.error(`Toter Link in ${file}: ${link}`);
    if (dead.length > 0) process.exit(1);
    console.log('Links geprüft: alle internen Links führen zu einer Datei.');
}
```

Run: `cd site && npm test`
Expected: all pass (12 tests).

- [ ] **Step 3: Run it in the build**

```bash
cd site && npm pkg set scripts.build="astro build && node scripts/check-links.mjs"
npm run build
```

Expected: build output ends with `Links geprüft: alle internen Links führen zu einer Datei.`

- [ ] **Step 4: Legal collection, route, footer link**

`site/src/content.config.ts` — full file:

```ts
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

// The manual's markdown is the app's own (src/wiki) — one source, no copies.
const wiki = defineCollection({
    loader: glob({ pattern: '*.md', base: '../src/wiki' }),
});

// The runbook the repo shows on GitHub.
const docs = defineCollection({
    loader: glob({ pattern: 'deployment.md', base: '../docs' }),
});

// Impressum etc. — written by the site owner; an empty folder means no such pages.
const legal = defineCollection({
    loader: glob({ pattern: '*.md', base: './src/content/legal' }),
});

export const collections = { wiki, docs, legal };
```

`touch site/src/content/legal/.gitkeep`

`site/src/pages/[legal].astro`:

```astro
---
import { getCollection, render } from 'astro:content';
import Base from '../layouts/Base.astro';

export async function getStaticPaths() {
    const entries = await getCollection('legal');
    return entries.map((entry) => ({ params: { legal: entry.id }, props: { entry } }));
}

const { entry } = Astro.props;
const { Content, headings } = await render(entry);
const title = headings.find((heading) => heading.depth === 1)?.text ?? 'Impressum';
---
<Base title={title}>
    <div class="container page">
        <article class="prose">
            <Content />
        </article>
    </div>
</Base>

<style>
    .page { padding-top: 2.5rem; }
</style>
```

`site/src/components/Footer.astro` — replace the frontmatter and the `<ul>`:

```astro
---
import { getCollection } from 'astro:content';
import { url } from '../lib/url';

const hasImpressum = (await getCollection('legal')).some((entry) => entry.id === 'impressum');
---
<footer class="site-footer">
    <div class="container row">
        <p class="muted">CuraHub — entstanden an der HSBI (Hochschule Bielefeld).</p>
        <ul>
            <li><a href="https://github.com/krullmensch/CuraHub" rel="noopener">GitHub</a></li>
            {hasImpressum && <li><a href={url('/impressum/')}>Impressum</a></li>}
        </ul>
    </div>
</footer>
```

(The `<style>` block stays as written in Task 2.)

- [ ] **Step 5: Check both states**

```bash
cd site && npm run build && ls dist | grep -c impressum; grep -c "Impressum" dist/index.html
```

Expected without the file: `0` and `0`, 10 pages.

```bash
printf '# Impressum\n\nTest\n' > src/content/legal/impressum.md && npm run build && ls dist/impressum && grep -c 'href="/CuraHub/impressum/"' dist/index.html; rm src/content/legal/impressum.md
```

Expected with the file: `index.html`, `1`, 11 pages. Afterwards `git status --short src/content` shows only `.gitkeep`.

- [ ] **Step 6: Commit**

```bash
git add site/scripts/check-links.mjs site/scripts/check-links.test.mjs site/src/content/legal/.gitkeep "site/src/pages/[legal].astro" site/src/content.config.ts site/src/components/Footer.astro site/package.json
git commit -m "feat(site): optional legal pages, dead-link check in the build"
```

---

### Task 7: GitHub Pages workflow and look check

**Files:**
- Create: `.github/workflows/site.yml`

**Interfaces:**
- Consumes: `npm test` and `npm run build` in `site/`

- [ ] **Step 1: Workflow**

`.github/workflows/site.yml`:

```yaml
name: Project website

on:
  pull_request:
    paths:
      - 'site/**'
      - 'src/wiki/**'
      - 'docs/deployment.md'
      - 'src/assets/fonts/**'
      - 'public/BG_Video_CuraHub-*'
      - '.github/workflows/site.yml'
  push:
    branches: [main]
    paths:
      - 'site/**'
      - 'src/wiki/**'
      - 'docs/deployment.md'
      - 'src/assets/fonts/**'
      - 'public/BG_Video_CuraHub-*'
      - '.github/workflows/site.yml'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: site/package-lock.json
      - run: npm ci
        working-directory: site
      - run: npm test
        working-directory: site
      - run: npm run build
        working-directory: site
      - if: github.event_name != 'pull_request'
        uses: actions/upload-pages-artifact@v3
        with:
          path: site/dist

  deploy:
    if: github.event_name != 'pull_request'
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the YAML**

Run: `npx --yes yaml-lint .github/workflows/site.yml`
Expected: `✔ YAML Lint successful.` The two `paths` lists must be identical (`grep -c "site/\*\*" .github/workflows/site.yml` → 2).

- [ ] **Step 3: Look check on the static build**

Build, serve the static files, take screenshots at three widths. In Claude Code start the server with `preview_start` (entry `{"name":"site-preview","runtimeExecutable":"npm","runtimeArgs":["run","preview","--prefix","site"],"port":4321}` in `.claude/launch.json`, not committed); elsewhere `cd site && npm run preview`.

```bash
cd site && npm run build
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="${TMPDIR:-/tmp}/site-look" && mkdir -p "$OUT"
for page in "" "wiki/2d-wall-editor/" "setup/"; do
  for width in 375 768 1440; do
    name=$(echo "${page:-index}" | tr '/' '_')
    "$CHROME" --headless=new --hide-scrollbars --window-size=$width,2600 --screenshot="$OUT/${name}-${width}.png" "http://localhost:4321/CuraHub/${page}" >/dev/null 2>&1
  done
done
ls "$OUT"
```

Expected: nine PNGs. Read each one and check: no horizontal overflow at 375 px, header links wrap cleanly, wiki/setup sidebar sits above the text below 768 px, code blocks scroll inside their box, hero text readable over the poster, focus ring visible (`Tab` in a headed run is not needed — check the CSS rule exists in `dist/_astro/*.css`: `grep -c "focus-visible" dist/_astro/*.css` ≥ 1).

Contrast (AA): text `#a1a1aa` on `#09090b` = 7.8:1, `#60a5fa` on `#09090b` = 7.4:1, white on `#2563eb` = 5.2:1 — all pass; no other text colours may be introduced.

Fix what the screenshots show, rebuild, re-shoot. Send the final nine images to the user.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/site.yml
git commit -m "ci(site): build on pull requests, deploy to GitHub Pages on main"
```

---

### Task 8: Deploy the branch to the test stack and check the wiki modal

Operational task on `Prohosting-18GB-Server`; nothing is committed.

- [ ] **Step 1: Ask the user for the test account**

Ask in chat, and wait for a clear yes: "Darf ich auf dem Test-Stack ein lokales Testkonto `screenshots` per `reset-local-admin.js` anlegen und mich damit im Headless-Browser anmelden? Für die Bilder des Assistenten lege ich außerdem auf einem frischen Wegwerf-Stack (Port 3003) einen Notfall-Admin mit Zufallspasswort an und baue den Stack danach ab. Alternative: du nimmst die eingeloggten Ansichten selbst auf." If the answer is no, skip Steps 3–4 here, and in Tasks 9–10 hand the logged-in parts to the user with the shot list from `site/src/lib/shots.mjs`.

- [ ] **Step 2: Deploy this branch to the test stack**

```bash
C=$(git rev-parse --short HEAD)
ssh Prohosting-18GB-Server "rm -rf /root/CuraHub-test-prev && mv /root/CuraHub-test /root/CuraHub-test-prev && mkdir /root/CuraHub-test"
git archive HEAD | ssh Prohosting-18GB-Server 'tar -x -C /root/CuraHub-test'
ssh Prohosting-18GB-Server "echo $C > /root/CuraHub-test/DEPLOYED_COMMIT && cd /root/CuraHub-test && set -a && . /root/CuraHub-test-secrets/test.env && set +a && export DATABASE_URL=\"mysql://\${DB_USER}:\${DB_PASSWORD}@db:3306/\${DB_NAME}\" APP_EXTERNAL_PORT=3002 DEPLOYED_COMMIT=$C && docker compose -p curahub-test up -d --build 2>&1 | tail -5"
ssh Prohosting-18GB-Server 'sleep 30; docker ps --filter name=curahub-test --format "{{.Names}} {{.Status}}"; curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/api/health'
```

Expected: both containers `healthy`, `200`. `site/` is not in the image (`ssh Prohosting-18GB-Server 'docker exec curahub-test-app-1 ls /app | grep -c site'` → `0`).

- [ ] **Step 3: Create the test account (only after the yes from Step 1)**

```bash
ssh Prohosting-18GB-Server 'docker exec curahub-test-app-1 node dist/scripts/reset-local-admin.js screenshots'
```

The script prints the password once. Keep it only in the shell environment of this session (`export CURAHUB_SHOT_USER=screenshots CURAHUB_SHOT_PASSWORD=…`); never write it to a file in the repo or repeat it in chat.

- [ ] **Step 4: Check the wiki modal**

Open the tunnel (`ssh -N -L 3002:127.0.0.1:3002 Prohosting-18GB-Server`, background), then use the capture runner from Task 10 Step 1 in a one-off run, or headless Chrome over CDP by hand: log in at `http://localhost:3002/login` ("Notfall-Login" → `#username`, `#password`, submit), open any exhibition in the editor, open the wiki from the header, and read the modal's text.

Expected: sidebar shows the seven titles in manifest order; clicking each shows its content (first heading of each: "Benutzer & Rechte"… as in the `.md` files); no console error.

---

### Task 9: Demo exhibition on the test stack

Operational task; the only committed file is `CREDITS.md`.

**Files:**
- Create: `site/src/assets/screenshots/CREDITS.md`

- [ ] **Step 1: Pick the works and get the download list approved**

Sources (each record carries its own licence flag — check it per work, do not assume):
- Images: The Met Open Access (`https://collectionapi.metmuseum.org/public/collection/v1/objects/<id>` → `isPublicDomain: true`, `primaryImage`), Art Institute of Chicago (`https://api.artic.edu/api/v1/artworks/<id>?fields=id,title,artist_title,date_display,is_public_domain,image_id,dimensions` → `is_public_domain: true`, image `https://www.artic.edu/iiif/2/<image_id>/full/1686,/0/default.jpg`), Rijksmuseum (public-domain works).
- Video: one public-domain clip (NASA imagery is public domain), ≤ 30 s, ≤ 1080p.
- 3D model: one CC0 GLB from Smithsonian Open Access (`https://3d.si.edu`, usage "CC0"), ≤ 50 MB.
- Book: one public-domain PDF (e.g. a pre-1900 exhibition catalogue from the Internet Archive), ≤ 20 MB.

Selection: 14 images — 5 landscape, 5 portrait, 4 near-square; real sizes between 30 cm and 180 cm on the long side; paintings and prints/photographs mixed, so frames and passepartouts make sense.

Write the candidate list (title, artist, year, source URL, licence flag as returned by the API, file size) and **show it to the user; download only after an explicit yes** (rule: downloads need permission). Download into the session scratch directory, not the repo.

- [ ] **Step 2: Read the API the editor itself uses**

Read `server/src/routes/projects.ts`, `versions.ts`, `upload.ts`, `artworks.ts`, `instances.ts`, `walls.ts` (routes + Zod schemas) and `src/lib/wallEditor/geometry.ts` (`getWallFrame`, `wallToWorld`). The demo is created with the same requests the editor sends, using the test account's token against `http://localhost:3002` (tunnel). Titles, artists, years and sizes in cm go into the artwork records, so the info panels show real data.

- [ ] **Step 3: Build the exhibition**

Target state (check each point in the editor afterwards):

1. Project "Demo-Ausstellung", exhibition "Licht und Landschaft", one working version.
2. Four modular walls, 2.5 m high, 0.12 m thick, labels "Wand A"–"Wand D", moved away from their default positions into this layout around the room's centre `(cx, cz)` (centre = mean of the room-wall anchor poses, see point 4): A 4.0 m wide at `(cx, cz − 2.0)`, rotation 0; B 3.0 m at `(cx + 2.6, cz)`, rotation 90°; C 3.0 m at `(cx − 2.6, cz + 0.6)`, rotation 90°; D 2.0 m at `(cx, cz + 2.4)`, rotation 20°. If a wall would intersect the room or a restriction zone, shift it along its own plane in 0.25 m steps until it is free.
3. Works on modular walls: positions computed with `wallToWorld(getWallFrame(wall, side), u, v, d)`, `d` = half the artwork's depth, picture centres at the hanging height 1.45 m unless stated: Wall A front — 4 works in a row, equal gaps of 0.35 m, centred on the wall; Wall A back — 1 large work centred; Wall B front — 3 works, the middle one 10 cm higher (so the 2D editor has something to align); Wall C front — 2 works; Wall D front — the video as a `monitor`.
4. Works on room walls: take position + rotation of four existing room-wall instances (`wallId = null`, medium `frame`) from any existing exhibition on the test stack (`GET` only) as anchor poses, and place the remaining 4 images there at 1.45 m.
5. The 3D model on the floor near `(cx + 1.2, cz + 1.2)`, the book on its pedestal near `(cx − 1.2, cz + 1.5)`, one scale figure in front of Wall A.
6. Frames: at least four different styles in use (`alu8-silber-matt`, `holz16-eiche-natur` or the nearest existing id, `aab102-aab-kirsche`, one `none`), passepartouts of 5–8 cm on four works, one of them `optical-center`. Valid ids: `src/lib/frameStyles.ts`.
7. In the 2D editor state for Wall A front: two guides stored (`axis 'h'` at 1.45, `axis 'v'` at the wall's middle).
8. One published version, comment "Erste Hängung"; a second, unpublished version branched from it with one work moved (so the version panel shows a history).

- [ ] **Step 4: Verify on the test stack**

```bash
curl -s http://localhost:3002/public/exhibitions | head -c 600
```

Expected: the demo exhibition is listed with its slug and `artworkCount` ≥ 17. Open `http://localhost:3002/exhibition/<slug>` headless (WebGPU flags) and take one screenshot: the room renders, works hang on walls, no work floats or sinks into a wall.

- [ ] **Step 5: Credits**

`site/src/assets/screenshots/CREDITS.md` — one table row per file actually used: title, artist, year, collection, URL of the record, licence as stated by the source (e.g. "Public Domain / CC0"). Heading: `# Werke in den Screenshots`. First line under it: `Die Screenshots zeigen eine Demo-Ausstellung mit gemeinfreien Werken.`

```bash
git add site/src/assets/screenshots/CREDITS.md
git commit -m "docs(site): credits for the works in the demo exhibition"
```

---

### Task 10: Capture script and screenshots

**Files:**
- Create: `site/scripts/capture-screenshots.mjs`, `site/src/lib/shots.test.mjs`, `site/src/assets/screenshots/*.png` (11 files)

**Interfaces:**
- Consumes: `ALL_SHOTS` from `site/src/lib/shots.mjs` (file names), env `CURAHUB_SHOT_USER`, `CURAHUB_SHOT_PASSWORD`

- [ ] **Step 1: Failing test — every required screenshot exists**

`site/src/lib/shots.test.mjs`:

```js
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ALL_SHOTS } from './shots.mjs';

const file = (name) => new URL(`../assets/screenshots/${name}.png`, import.meta.url);

test('every screenshot the site shows has been captured', () => {
    const missing = ALL_SHOTS.filter((entry) => !existsSync(file(entry.name))).map((entry) => entry.name);
    assert.deepEqual(missing, []);
});

test('screenshots are PNGs at least 1600 px wide', () => {
    for (const entry of ALL_SHOTS) {
        if (!existsSync(file(entry.name))) continue;
        const header = readFileSync(file(entry.name)).subarray(0, 24);
        assert.equal(header.subarray(1, 4).toString('latin1'), 'PNG', entry.name);
        assert.ok(header.readUInt32BE(16) >= 1600, `${entry.name} is ${header.readUInt32BE(16)} px wide`);
    }
});

test('every alt text is a German sentence', () => {
    for (const entry of ALL_SHOTS) assert.match(entry.alt, /^[A-ZÄÖÜ].{20,}\.$/, entry.name);
});
```

Run: `cd site && npm test`
Expected: first test FAILS listing all 11 names; the others pass.

- [ ] **Step 2: The capture runner**

`site/scripts/capture-screenshots.mjs`:

```js
// Captures the site's screenshots from a running CuraHub instance. Run by hand:
//   CURAHUB_SHOT_USER=… CURAHUB_SHOT_PASSWORD=… node scripts/capture-screenshots.mjs http://localhost:3002 [shot-name …]
// Needs Google Chrome and Node ≥ 22 (built-in WebSocket). Never run by CI.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOTS } from './shots.config.mjs';

const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const OUT = fileURLToPath(new URL('../src/assets/screenshots/', import.meta.url));
const [baseUrl, ...only] = process.argv.slice(2);
if (!baseUrl) throw new Error('Usage: node scripts/capture-screenshots.mjs <base-url> [shot-name …]');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
    const chrome = spawn(CHROME, [
        '--headless=new',
        '--enable-unsafe-webgpu',
        '--hide-scrollbars',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${mkdtempSync(path.join(tmpdir(), 'curahub-shots-'))}`,
        'about:blank',
    ]);
    let target;
    for (let attempt = 0; attempt < 50 && !target; attempt++) {
        await sleep(200);
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            target = targets.find((entry) => entry.type === 'page');
        } catch {
            // Chrome is still starting.
        }
    }
    if (!target) throw new Error('Chrome did not start.');
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = reject;
    });
    let nextId = 1;
    const pending = new Map();
    socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        const waiter = pending.get(message.id);
        if (!waiter) return;
        pending.delete(message.id);
        if (message.error) waiter.reject(new Error(message.error.message));
        else waiter.resolve(message.result);
    };
    const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
            const id = nextId++;
            pending.set(id, { resolve, reject });
            socket.send(JSON.stringify({ id, method, params }));
        });
    return { send, close: () => chrome.kill() };
}

function pageApi(send) {
    const evaluate = async (expression) => {
        const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
        return result.value;
    };
    const waitFor = async (expression, timeoutMs = 30000) => {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (await evaluate(`Boolean(${expression})`)) return;
            await sleep(250);
        }
        throw new Error(`Timed out waiting for: ${expression}`);
    };
    const centreOf = (selector) =>
        evaluate(`(() => { const el = ${selector}; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const mouse = async (type, x, y, extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
    return {
        evaluate,
        waitFor,
        sleep,
        goto: async (pathname) => {
            await send('Page.navigate', { url: new URL(pathname, baseUrl).href });
            await waitFor(`document.readyState === 'complete'`);
        },
        /** Clicks the element a JS expression returns, e.g. `document.querySelector('[title="Versionen anzeigen"]')`. */
        click: async (selector, extra = {}) => {
            const point = await centreOf(selector);
            if (!point) throw new Error(`Not found: ${selector}`);
            await mouse('mousePressed', point.x, point.y, extra);
            await mouse('mouseReleased', point.x, point.y, extra);
        },
        clickAt: async (x, y, extra = {}) => {
            await mouse('mousePressed', x, y, extra);
            await mouse('mouseReleased', x, y, extra);
        },
        /** `document.evaluate`-free text lookup: first button/link whose text is exactly `text`. */
        byText: (text) => `[...document.querySelectorAll('button, a, [role="menuitem"], [role="tab"]')].find((el) => el.textContent.trim() === ${JSON.stringify(text)})`,
        type: (text) => send('Input.insertText', { text }),
        key: async (key, modifiers = 0) => {
            const params = { key, code: key.length === 1 ? `Key${key.toUpperCase()}` : key, modifiers, windowsVirtualKeyCode: key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0 };
            await send('Input.dispatchKeyEvent', { type: 'keyDown', ...params });
            await send('Input.dispatchKeyEvent', { type: 'keyUp', ...params });
        },
    };
}

async function login(page) {
    const user = process.env.CURAHUB_SHOT_USER;
    const password = process.env.CURAHUB_SHOT_PASSWORD;
    if (!user || !password) throw new Error('Set CURAHUB_SHOT_USER and CURAHUB_SHOT_PASSWORD.');
    await page.goto('/login');
    await page.click(page.byText('Notfall-Login'));
    await page.click(`document.querySelector('#username')`);
    await page.type(user);
    await page.click(`document.querySelector('#password')`);
    await page.type(password);
    await page.click(`document.querySelector('button[type="submit"]')`);
    await page.waitFor(`location.pathname !== '/login'`);
}

const { send, close } = await connect();
try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false });
    const page = pageApi(send);
    const shots = SHOTS.filter((entry) => only.length === 0 || only.includes(entry.name));
    if (shots.some((entry) => entry.login)) await login(page);
    for (const entry of shots) {
        await entry.prepare(page);
        await page.sleep(entry.settleMs ?? 1500);
        const leak = await page.evaluate(`/[\\w.+-]+@[\\w-]+\\.[\\w.]+/.exec(document.body.innerText)?.[0] ?? null`);
        if (leak) throw new Error(`${entry.name}: an e-mail address is visible on screen (${leak}) — close the menu or pick another view.`);
        const { data } = await send('Page.captureScreenshot', { format: 'png', ...(entry.clip ? { clip: { ...entry.clip, scale: 1 } } : {}) });
        writeFileSync(path.join(OUT, `${entry.name}.png`), Buffer.from(data, 'base64'));
        console.log(`✓ ${entry.name}`);
    }
} finally {
    close();
}
```

- [ ] **Step 3: The shot list**

`site/scripts/shots.config.mjs` — one entry per name in `site/src/lib/shots.mjs`. Each `prepare(page)` navigates and drives the UI with the `page` helpers. The states are fixed here; the element lookups are written against the live test stack in Step 4 (titles that exist in the code today are given):

```js
// What each screenshot shows. `prepare` brings the app into that state; see capture-screenshots.mjs for the `page` helpers.
// DEMO is the slug of the demo exhibition on the test stack (Task 9).
const DEMO = process.env.CURAHUB_DEMO_SLUG ?? 'demo-ausstellung';
const editor = `/exhibition/${DEMO}/edit`;
const canvasReady = `document.querySelector('canvas') && !document.querySelector('[data-loading]')`;
const META = 4; // CDP modifier bit for ⌘

export const SHOTS = [
    {
        name: 'planer-3d',
        login: true,
        // Orbit view of the whole room, all works selected (⌘A), sidebars open.
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(4000);
            await page.clickAt(800, 500);
            await page.key('a', META);
        },
    },
    {
        name: 'wandeditor-2d',
        login: true,
        // Wall A front in the 2D editor, measures on, the three works of one row selected.
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(4000);
            await page.click(page.byText('Wand öffnen'));
            await page.waitFor(`document.querySelector('[title="Hilfslinien"]')`);
            await page.click(`document.querySelector('[title="Alle Werke dieser Fläche auswählen"]')`);
        },
    },
    {
        name: 'medien',
        login: true,
        // Asset library page with mixed media.
        prepare: async (page) => {
            await page.goto(`/exhibition/${DEMO}/assets`);
            await page.waitFor(`document.querySelectorAll('img').length > 8`);
        },
    },
    {
        name: 'rahmen',
        login: true,
        // One framed picture with passepartout selected, frame section of the properties panel visible.
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(4000);
            await page.click(`[...document.querySelectorAll('button')].find((el) => el.closest('aside') && el.querySelector('img'))`);
            await page.key('f');
        },
    },
    {
        name: 'versionen',
        login: true,
        prepare: async (page) => {
            await page.goto(editor);
            await page.waitFor(canvasReady, 60000);
            await page.click(`document.querySelector('[title="Versionen anzeigen"]')`);
        },
    },
    {
        name: 'rundgang',
        login: false,
        // Public viewer, first person, looking along Wall A.
        prepare: async (page) => {
            await page.goto(`/exhibition/${DEMO}`);
            await page.waitFor(canvasReady, 60000);
            await page.sleep(5000);
        },
        settleMs: 3000,
    },
];
```

The five wizard shots are added to `SHOTS` in Step 5 (they run against the temporary stack, with `login: false`).

- [ ] **Step 4: Dry-run each shot against the test stack and fix its `prepare`**

With the tunnel open and `CURAHUB_SHOT_USER`/`CURAHUB_SHOT_PASSWORD` set:

```bash
cd site && node scripts/capture-screenshots.mjs http://localhost:3002 planer-3d
```

Read the PNG. For each of the six shots, repeat until the image shows the state described in its comment: the right view, the selection visible, the user menu closed, no loading spinner, no toast. Where a lookup does not find its element, read the component that renders it (`src/components/…`) and use its `title`, `aria-label` or text; do not add test ids to the app. `planer-3d` and `rahmen` may need a camera position: set it with real mouse drags (`mousePressed` / `mouseMoved` / `mouseReleased` on the canvas) or the `F` focus key.

Expected: six PNGs in `site/src/assets/screenshots/`, each 3200 × 2000 px.

- [ ] **Step 5: Wizard screenshots from a fresh temporary stack**

```bash
C=$(git rev-parse --short HEAD)
git archive HEAD | ssh Prohosting-18GB-Server "rm -rf /root/CuraHub-setup && mkdir -p /root/CuraHub-setup && tar -x -C /root/CuraHub-setup"
ssh Prohosting-18GB-Server "cd /root/CuraHub-setup && APP_EXTERNAL_PORT=3003 DEPLOYED_COMMIT=$C docker compose -p curahub-setup up -d --build 2>&1 | tail -3"
ssh Prohosting-18GB-Server 'sleep 30; curl -s http://127.0.0.1:3003/api/setup/status; docker logs curahub-setup-app-1 2>&1 | grep "Setup-Code"'
```

Expected: `{"complete":false}` and a line `Setup-Code: XXXX-XXXX-XXXX`. Open a second tunnel (`ssh -N -L 3003:127.0.0.1:3003 Prohosting-18GB-Server`, background) and add five entries to `SHOTS` (`setup-1-code` … `setup-5-hsbi-admin`, `login: false`), each going to `/setup` and advancing one step further; read `src/pages/SetupPage.tsx` for the field ids and button labels. The setup code comes from `process.env.CURAHUB_SETUP_CODE`. Step 4 of the wizard creates the emergency admin on this throwaway stack with a random password generated in the script (`crypto.randomUUID()`); step 5 is captured **before** submitting (no HSBI login is performed). Use a cropped `clip` around the wizard card (centred 900 × 760) so the five images share one format.

```bash
cd site && CURAHUB_SETUP_CODE=… node scripts/capture-screenshots.mjs http://localhost:3003 setup-1-code setup-2-systemcheck setup-3-adresse setup-4-notfall-admin setup-5-hsbi-admin
```

Then tear the temporary stack down and close its tunnel:

```bash
ssh Prohosting-18GB-Server 'cd /root/CuraHub-setup && docker compose -p curahub-setup down -v --rmi local && rm -rf /root/CuraHub-setup'
pkill -f "L 3003:127.0.0.1:3003"
ssh Prohosting-18GB-Server 'docker ps --format "{{.Names}}" | grep -c curahub-setup'    # 0
```

- [ ] **Step 6: Tests, build, look**

```bash
cd site && npm test && npm run build
grep -c "<img" dist/index.html          # ≥ 6
grep -c "<img" dist/setup/index.html    # ≥ 5
du -sh dist
```

Expected: all tests pass (incl. the three in `shots.test.mjs`), build and link check pass, `dist` below 15 MB. Re-run the look check from Task 7 Step 3 and send the user the 1440 px images of all three page types. Look at every screenshot once more for names and e-mail addresses.

- [ ] **Step 7: Commit**

```bash
git add site/scripts/capture-screenshots.mjs site/scripts/shots.config.mjs site/src/lib/shots.test.mjs site/src/assets/screenshots
git commit -m "feat(site): screenshots of the demo exhibition and the setup wizard, capture script"
```

---

### Task 11: Wrap-up

**Files:**
- Modify: `CLAUDE.md` (project root), `README.md`

- [ ] **Step 1: Document the site for the next person**

Append to `CLAUDE.md` under "## Commands":

```markdown
### Project website (`site/` directory)
- `cd site && npm run dev` — Astro dev server (static site only, not the app)
- `cd site && npm run build` — static build into `site/dist` + dead-link check
- `cd site && npm test` — `node --test` for the site's pure helpers
```

and under "## Architecture" a new subsection:

```markdown
### Project website (`site/`)

Public German site on GitHub Pages (`https://krullmensch.github.io/CuraHub/`): landing page, wiki, setup guide. Astro 7, own `package.json`, plain CSS, no client framework; the app's build, lint and Docker image ignore `site/`.

- One source for texts: the wiki pages are `src/wiki/*.md` in the order of `src/wiki/pages.json` (also read by `WikiView`; `src/wiki/pages.test.ts` keeps both in step), the setup guide is `docs/deployment.md`. Never copy them into `site/`.
- Internal links only through `url()` (`site/src/lib/url.ts`); `base` lives in `site/astro.config.mjs`.
- `remarkRepoLinks` turns inline code that is a path to an existing repo file into a GitHub link.
- Screenshots: PNGs in `site/src/assets/screenshots/`, names + alt texts in `site/src/lib/shots.mjs`, captured by hand with `site/scripts/capture-screenshots.mjs` from the demo exhibition on the test stack (works credited in `CREDITS.md`).
- `site/src/content/legal/impressum.md` (optional) becomes `/impressum/` and a footer link.
- `.github/workflows/site.yml` builds on pull requests and deploys on pushes to `main`.
```

In `README.md` add after the first paragraph:

```markdown
Projektseite mit Wiki und Setup-Guide: https://krullmensch.github.io/CuraHub/
```

- [ ] **Step 2: Final verification**

```bash
npm run lint && npm run test && npm run build
cd site && npm test && npm run build
git status --short
```

Expected: everything passes; `git status` shows only `CLAUDE.md`, `README.md` and the pre-existing unrelated changes under `.claude/`, `.mcp.json`, `.serena/`, `docs/superpowers/specs/2026-09-30-tag-nacht-licht-grobplan.md`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: project website in CLAUDE.md and README"
```

- [ ] **Step 4: Hand over to the user**

Tell the user what remains theirs: (1) write `site/src/content/legal/impressum.md` or decide to go without, (2) decide on a licence, (3) merge to `main`, (4) repo → Settings → Pages → Source "GitHub Actions". Do not push or open a PR unless asked.
