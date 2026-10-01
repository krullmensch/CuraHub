import { joinBase } from './paths.mjs';

/** Site-internal link. The only place that knows the base path. */
export function url(path: string): string {
    return joinBase(import.meta.env.BASE_URL, path);
}
