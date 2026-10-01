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
