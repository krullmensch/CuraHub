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
