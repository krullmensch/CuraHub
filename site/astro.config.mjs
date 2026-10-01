import { defineConfig } from 'astro/config';

export default defineConfig({
    site: 'https://krullmensch.github.io',
    base: '/CuraHub',
    output: 'static',
    trailingSlash: 'always',
    // Fonts, the hero video and the markdown sources live in the app's folders one level up.
    vite: { server: { fs: { allow: ['..'] } } },
});
