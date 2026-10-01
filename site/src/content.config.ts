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
const legalFiles = glob({ pattern: '*.md', base: './src/content/legal' });
const legal = defineCollection({
    loader: {
        ...legalFiles,
        async load(context) {
            await legalFiles.load(context);
            // glob() creates no collection when nothing matches, and getCollection() then logs
            // a warning on every call. Set-and-delete leaves an existing, empty collection.
            context.store.set({ id: '.empty', data: {} });
            context.store.delete('.empty');
        },
    },
});

export const collections = { wiki, docs, legal };
