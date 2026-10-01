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
