import { nameForEmail } from '../live/protocol';

/** What `/public/featured` and `/public/exhibitions` read for one published version. */
export interface ListedVersion {
    id: number;
    comment: string | null;
    published_at: Date | null;
    exhibition: unknown;
    creator: { email: string };
    _count: { instances: number };
}

/**
 * One entry of the public exhibition lists. These routes need no login, so the creator goes out
 * as the display name the pages show (the part before the @) — never as an e-mail address
 * (data minimisation, Art. 5 Abs. 1 lit. c DSGVO).
 */
export function toPublicListing(v: ListedVersion) {
    return {
        exhibition: v.exhibition,
        version: {
            id: v.id,
            comment: v.comment,
            published_at: v.published_at,
            artworkCount: v._count.instances,
            creator: { name: nameForEmail(v.creator.email) },
        },
    };
}
