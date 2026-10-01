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
