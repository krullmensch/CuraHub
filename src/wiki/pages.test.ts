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
