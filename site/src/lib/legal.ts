import { getCollection, render, type CollectionEntry } from 'astro:content';

/** Pages of the site that a legal file would silently replace (or be replaced by) under the same URL. */
const RESERVED_IDS = ['wiki', 'setup', '404', 'index'];

export interface LegalPage {
    entry: CollectionEntry<'legal'>;
    /** Footer link text and page title. */
    label: string;
}

/** The entry's first `# ` heading, else its id with a capital first letter. */
export async function legalLabel(entry: CollectionEntry<'legal'>): Promise<string> {
    const { headings } = await render(entry);
    const heading = headings.find((candidate) => candidate.depth === 1)?.text.trim();
    return heading || entry.id.charAt(0).toUpperCase() + entry.id.slice(1);
}

/**
 * Every legal page (Impressum, Datenschutz, ...), sorted by id. Footer and routes both read this,
 * so a file can never build a page that nobody links to.
 */
export async function legalPages(): Promise<LegalPage[]> {
    const entries = await getCollection('legal');
    for (const entry of entries) {
        if (RESERVED_IDS.includes(entry.id)) {
            const file = entry.filePath ?? `src/content/legal/${entry.id}.md`;
            throw new Error(
                `Rechtstext „${file}“ kann nicht gebaut werden: Die Adresse /${entry.id}/ gehört schon einer anderen Seite. ` +
                    `Bitte die Datei umbenennen (nicht: ${RESERVED_IDS.join(', ')}).`,
            );
        }
    }
    entries.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return Promise.all(entries.map(async (entry) => ({ entry, label: await legalLabel(entry) })));
}
