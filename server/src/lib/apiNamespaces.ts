/** First path segments that belong to the API (mounted with and without the /api prefix). */
export const API_NAMESPACE_SEGMENTS = new Set([
    'api', 'auth', 'upload', 'uploads', 'public', 'assets',
    'folders', 'artworks', 'instances', 'projects', 'walls', 'scale-figures', 'books', 'admin',
    'health',
]);

// Frontend route patterns, mirroring src/App.tsx <Route path="..."> entries
// that live under /exhibition or /exhibitions (every other frontend route is
// covered by the default "serve html" case since it can't collide with
// an API namespace segment).
export const EXHIBITION_FRONTEND_ROUTE_PATTERNS = [
    /^\/exhibitions$/,
    /^\/exhibition$/,
    /^\/exhibition\/[^/]+$/,           // /exhibition/:slug (public viewer)
    /^\/exhibition\/[^/]+\/assets$/,   // /exhibition/:projectSlug/assets
    /^\/exhibition\/[^/]+\/edit$/,     // /exhibition/:projectSlug/edit
];

// Editor/admin-only frontend routes — excluded from search indexing.
export const NOINDEX_ROUTE_PATTERNS = [
    /^\/exhibition\/[^/]+\/edit$/,
    /^\/exhibition\/[^/]+\/assets$/,
    /^\/project$/,
    /^\/users$/,
    /^\/setup$/,
];

export function isFrontendExhibitionPath(p: string): boolean {
    return EXHIBITION_FRONTEND_ROUTE_PATTERNS.some((re) => re.test(p));
}
