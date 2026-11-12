import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BROWSER_STORAGE, buildImprint, buildPrivacy, resolveLegalDocuments, standOf } from './documents';
import { EMPTY_OPERATOR, operatorProblem, type LegalOperator } from './operator';

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
    if (file.endsWith('documents.ts') || !/localStorage|sessionStorage|persist\(/.test(text)) continue;
    for (const m of text.matchAll(/['"`](curahub-[a-z0-9-]+)['"`]/g)) keys.add(m[1]);
  }
  return [...keys];
}

const HSBI: LegalOperator = {
  ...EMPTY_OPERATOR,
  name: 'Hochschule Bielefeld',
  legalForm: 'Körperschaft des öffentlichen Rechts',
  representative: 'die Präsidentin',
  street: 'Interaktion 1',
  postalCode: '33619',
  city: 'Bielefeld',
  email: 'info@hsbi.de',
  dpo: 'datenschutz@hsbi.de',
  supervisoryAuthority: 'Ministerium für Kultur und Wissenschaft NRW',
  hosting: 'auf einem Server im Rechenzentrum der HSBI',
  updatedAt: '2026-11-12T10:00:00Z',
};
const PLAIN = { behindCloudflare: false };

describe('privacy text', () => {
  it('lists every key CuraHub stores in the browser', () => {
    const keys = storageKeys();
    expect(keys).toContain('curahub-auth');
    expect(keys.filter((key) => !BROWSER_STORAGE.some((e) => e.key === key))).toEqual([]);
    const text = buildPrivacy(HSBI, PLAIN);
    for (const e of BROWSER_STORAGE) expect(text).toContain(`\`${e.key}\``);
  });

  it('names the operator, the DPO, hosting, log retention and the date', () => {
    const text = buildPrivacy(HSBI, PLAIN);
    expect(text).toContain('Hochschule Bielefeld  \nKörperschaft des öffentlichen Rechts  \nInteraktion 1  \n33619 Bielefeld');
    expect(text).toContain('## Datenschutzbeauftragte(r)\n\ndatenschutz@hsbi.de');
    expect(text).toContain('CuraHub läuft auf einem Server im Rechenzentrum der HSBI.');
    expect(text).toContain('nach 14 Tagen gelöscht');
    expect(text).toContain('Stand: November 2026');
    expect(text).not.toContain('undefined');
  });

  it('uses the public-law basis for public bodies and b/f for others', () => {
    expect(buildPrivacy(HSBI, PLAIN)).toContain('Art. 6 Abs. 1 Buchst. e DSGVO in Verbindung mit § 3 DSG NRW');
    const priv = buildPrivacy({ ...HSBI, kind: 'private' }, PLAIN);
    expect(priv).toContain('Art. 6 Abs. 1 Buchst. f DSGVO');
    expect(priv).toContain('Art. 6 Abs. 1 Buchst. b DSGVO');
    expect(priv).not.toContain('Buchst. e');
  });

  it('mentions Cloudflare only behind Cloudflare, and no third countries otherwise', () => {
    expect(buildPrivacy(HSBI, PLAIN)).toContain('außerhalb der EU findet nicht statt');
    const cf = buildPrivacy(HSBI, { behindCloudflare: true });
    expect(cf).toContain('Cloudflare, Inc.');
    expect(cf).not.toContain('außerhalb der EU findet nicht statt');
    expect(buildPrivacy({ ...HSBI, otherRecipients: 'Hoster X' }, PLAIN)).toContain('Hoster X');
  });

  it('leaves out what was not given', () => {
    const text = buildPrivacy({ ...HSBI, dpo: '', hosting: '', logRetentionDays: null, dataProtectionAuthority: '' }, PLAIN);
    expect(text).not.toContain('Datenschutzbeauftragte(r)');
    expect(text).not.toContain('CuraHub läuft');
    expect(text).toContain('so lange aufbewahrt, wie es für den sicheren Betrieb nötig ist');
    expect(text).toContain('Datenschutz-Aufsichtsbehörde beschweren.');
  });
});

describe('imprint', () => {
  it('has the § 5 DDG details and the person responsible for content', () => {
    const text = buildImprint(HSBI);
    expect(text).toContain('Vertreten durch: die Präsidentin');
    expect(text).toContain('E-Mail: [info@hsbi.de](mailto:info@hsbi.de)');
    expect(text).toContain('## Zuständige Aufsichtsbehörde\n\nMinisterium für Kultur und Wissenschaft NRW');
    expect(text).toContain('die Präsidentin, Anschrift wie oben');
    expect(text).not.toContain('Telefon');
    expect(text).not.toContain('Register');
  });
  it('falls back to the operator for § 18 MStV', () => {
    expect(buildImprint({ ...HSBI, representative: '' })).toContain('Hochschule Bielefeld, Anschrift wie oben');
    expect(buildImprint({ ...HSBI, contentResponsible: 'Dr. X' })).toContain('Dr. X, Anschrift wie oben');
  });
});

describe('resolveLegalDocuments', () => {
  it('prefers own texts, then generated ones, else nothing', () => {
    expect(resolveLegalDocuments({ operator: null, imprint: '', privacy: '' }, PLAIN)).toEqual({ imprint: '', privacy: '' });
    const generated = resolveLegalDocuments({ operator: HSBI, imprint: '', privacy: '' }, PLAIN);
    expect(generated.imprint).toMatch(/^# Impressum/);
    expect(generated.privacy).toMatch(/^# Datenschutzerklärung/);
    expect(resolveLegalDocuments({ operator: HSBI, imprint: '# Eigen', privacy: ' ' }, PLAIN).imprint).toBe('# Eigen');
    expect(resolveLegalDocuments({ operator: { ...HSBI, city: '' }, imprint: '', privacy: '' }, PLAIN).privacy).toBe('');
  });
});

describe('operatorProblem', () => {
  it('lists missing required fields and checks the e-mail', () => {
    expect(operatorProblem(EMPTY_OPERATOR)).toBe('Pflichtangaben fehlen: Name, Straße, PLZ, Ort, E-Mail.');
    expect(operatorProblem({ ...HSBI, email: 'info' })).toBe('Die E-Mail-Adresse ist ungültig.');
    expect(operatorProblem(HSBI)).toBeNull();
  });
});

describe('standOf', () => {
  it('formats the save date, else today', () => {
    expect(standOf('2026-03-15T12:00:00Z')).toBe('März 2026');
    expect(standOf(undefined, new Date(Date.UTC(2027, 0, 15)))).toBe('Januar 2027');
  });
});
