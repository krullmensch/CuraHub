import type { ClaimEntry } from './protocol';

/** Other tabs' claims grouped per tab, for their selection outlines. */
export function outlineGroups(claims: ClaimEntry[], selfSession: string | null) {
  const bySession = new Map<string, { session: string; name: string; color: string; keys: string[] }>();
  for (const c of claims) {
    if (c.session === selfSession) continue;
    let group = bySession.get(c.session);
    if (!group) {
      group = { session: c.session, name: c.name, color: c.color, keys: [] };
      bySession.set(c.session, group);
    }
    group.keys.push(c.key);
  }
  return [...bySession.values()];
}

/** Top-left corner of an SVG path made of `M x y` / `L x y` commands; null for an empty path. */
export function pathBounds(d: string): { minX: number; minY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  const re = /[ML](-?[\d.]+) (-?[\d.]+)/g;
  for (let m = re.exec(d); m; m = re.exec(d)) {
    minX = Math.min(minX, Number(m[1]));
    minY = Math.min(minY, Number(m[2]));
  }
  return Number.isFinite(minX) ? { minX, minY } : null;
}
