import pages from '../../../src/wiki/pages.json';

export interface WikiPageMeta {
    id: string;
    title: string;
}

/** Manual pages in reading order — the same list the app's WikiView uses. */
export const wikiPages: WikiPageMeta[] = pages;
