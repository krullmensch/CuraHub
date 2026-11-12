import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasPlaceholders, IMPRINT_TEMPLATE, PRIVACY_TEMPLATE } from './templates';

const SRC = join(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Every `'curahub-…'` key in a file that touches the browser's storage. */
function storageKeys(): string[] {
  const keys = new Set<string>();
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, 'utf8');
    if (!/localStorage|sessionStorage|persist\(/.test(text)) continue;
    for (const m of text.matchAll(/['"`](curahub-[a-z0-9-]+)['"`]/g)) keys.add(m[1]);
  }
  return [...keys];
}

describe('privacy template', () => {
  it('lists every key CuraHub stores in the browser', () => {
    const keys = storageKeys();
    expect(keys).toContain('curahub-auth');
    const missing = keys.filter((key) => !PRIVACY_TEMPLATE.includes(`\`${key}\``));
    expect(missing).toEqual([]);
  });

  it('marks what the operator must fill in', () => {
    expect(hasPlaceholders(PRIVACY_TEMPLATE)).toBe(true);
    expect(hasPlaceholders(IMPRINT_TEMPLATE)).toBe(true);
    expect(hasPlaceholders('Siehe [Link](https://x.de) und [1].')).toBe(false);
  });
});
