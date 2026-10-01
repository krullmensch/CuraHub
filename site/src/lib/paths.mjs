/**
 * Joins the site's base path and a site-absolute path.
 * @param {string} base  e.g. '/CuraHub/', '/CuraHub', '/' or ''
 * @param {string} path  e.g. '/wiki/', 'wiki/', '/#funktionen'
 * @returns {string}
 */
export function joinBase(base, path) {
    const head = base.replace(/\/+$/, '');
    const tail = path.replace(/^\/+/, '');
    return `${head}/${tail}`;
}
