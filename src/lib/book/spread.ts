/** Page layout of the flip viewer, like a real book: cover alone on the right, then 2–3, 4–5, … */

export interface Spread {
  left: number | null;
  right: number | null;
}

export function buildSpreads(pageCount: number, single: boolean): Spread[] {
  const spreads: Spread[] = [];
  if (pageCount < 1) return spreads;
  if (single) {
    for (let p = 1; p <= pageCount; p++) spreads.push({ left: null, right: p });
    return spreads;
  }
  spreads.push({ left: null, right: 1 });
  for (let p = 2; p <= pageCount; p += 2) spreads.push({ left: p, right: p + 1 <= pageCount ? p + 1 : null });
  return spreads;
}

export function spreadIndexOfPage(spreads: Spread[], page: number): number {
  const index = spreads.findIndex((s) => s.left === page || s.right === page);
  return index >= 0 ? index : Math.max(0, spreads.length - 1);
}

export function spreadLabel(spread: Spread, pageCount: number): string {
  const pages = [spread.left, spread.right].filter((p): p is number => p !== null);
  return `${pages.join('–')} / ${pageCount}`;
}
