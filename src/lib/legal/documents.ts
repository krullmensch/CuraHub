import { operatorComplete, type LegalOperator } from './operator';

/**
 * Impressum and Datenschutzerklärung built from the operator's details (pure, Vitest). The privacy
 * text describes what CuraHub itself processes — keep it true to the code: `documents.test.ts`
 * fails when a localStorage key is missing from the table.
 *
 * Operator input goes in as Markdown text; LegalPage renders without raw HTML, so nothing in it runs.
 */

export interface LegalEnvironment {
  /** The server sits behind Cloudflare (BEHIND_CLOUDFLARE=true). */
  behindCloudflare: boolean;
}

/** Hard line breaks inside one paragraph. */
const lines = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join('  \n');

const blocks = (...parts: (string | false | null | undefined)[]) => `${parts.filter(Boolean).join('\n\n')}\n`;

const address = (op: LegalOperator) => lines(op.name, op.legalForm, op.street, `${op.postalCode} ${op.city}`);

const mail = (email: string) => `[${email}](mailto:${email})`;

const contentResponsible = (op: LegalOperator) => op.contentResponsible || op.representative || op.name;

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** „November 2026"; the record's save date, else today. */
export function standOf(updatedAt: string | undefined, now: Date = new Date()): string {
  const date = updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? new Date(updatedAt) : now;
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function buildImprint(op: LegalOperator): string {
  return blocks(
    '# Impressum',
    '## Angaben gemäß § 5 DDG',
    lines(op.name, op.legalForm, op.street, `${op.postalCode} ${op.city}`),
    op.representative && `Vertreten durch: ${op.representative}`,
    '## Kontakt',
    lines(`E-Mail: ${mail(op.email)}`, op.phone && `Telefon: ${op.phone}`),
    op.register && `## Register und Umsatzsteuer\n\n${op.register}`,
    op.supervisoryAuthority && `## Zuständige Aufsichtsbehörde\n\n${op.supervisoryAuthority}`,
    '## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV',
    `${contentResponsible(op)}, Anschrift wie oben`,
    '## Ausstellungen',
    'Die veröffentlichten Ausstellungen werden von den jeweiligen Kuratorinnen und Kuratoren gestaltet. Für die gezeigten Werke und Texte sind sie verantwortlich; Hinweise auf Rechtsverletzungen bitte an die oben genannte Adresse.',
  );
}

/** The localStorage entries CuraHub writes, as the privacy text lists them. */
export const BROWSER_STORAGE: { key: string; content: string; when: string }[] = [
  { key: 'curahub-auth', content: 'Anmelde-Token (30 Tage gültig), E-Mail-Adresse bzw. Benutzername und Rolle', when: 'nach der Anmeldung; wird beim Abmelden geleert' },
  { key: 'curahub-render-quality', content: 'gewählte Darstellungsqualität', when: 'wenn du sie von Hand einstellst' },
  { key: 'curahub-renderer', content: 'gewählte Grafikschnittstelle (WebGPU/WebGL)', when: 'wenn du sie von Hand einstellst' },
  { key: 'curahub-sidebar-view', content: 'Ansicht der Werk-Seitenleiste', when: 'im Editor' },
  { key: 'curahub-room-cutaway', content: 'Puppenhaus-Ansicht an oder aus', when: 'im Editor' },
  { key: 'curahub-wall-measures', content: 'eingeblendete Maße', when: 'im Editor' },
  { key: 'curahub-wall-guides-view', content: 'Anzeige der Hilfslinien', when: 'im Wand-Editor' },
  { key: 'curahub-mobile-planner', content: 'Wahl zwischen mobiler und vollständiger Ansicht', when: 'auf dem Smartphone' },
];

const CLOUDFLARE =
  'Die Installation ist über das Netzwerk von Cloudflare erreichbar (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA). Cloudflare leitet jede Anfrage an den Server weiter, schützt ihn vor Angriffen und verarbeitet dabei die IP-Adresse und die Anfragedaten. Dabei können Daten in die USA übermittelt werden; Cloudflare ist unter dem EU-US Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der EU-Kommission besteht (Art. 45 DSGVO).';

export function buildPrivacy(op: LegalOperator, env: LegalEnvironment): string {
  const isPublic = op.kind === 'public';
  const publicBasis = `Art. 6 Abs. 1 Buchst. e DSGVO in Verbindung mit ${op.stateLaw || 'dem Datenschutzgesetz des Landes'}`;
  const logBasis = isPublic ? publicBasis : 'Art. 6 Abs. 1 Buchst. f DSGVO (berechtigtes Interesse an einem sicheren Betrieb)';
  const accountBasis = isPublic ? publicBasis : 'Art. 6 Abs. 1 Buchst. b DSGVO (Nutzung des Dienstes)';
  const thirdCountry = env.behindCloudflare || !!op.otherRecipients;

  const storageTable = [
    '| Eintrag | Inhalt | Wann |',
    '|---|---|---|',
    ...BROWSER_STORAGE.map((e) => `| \`${e.key}\` | ${e.content} | ${e.when} |`),
  ].join('\n');

  return blocks(
    '# Datenschutzerklärung',
    'Diese Erklärung beschreibt, welche personenbezogenen Daten bei der Nutzung dieser CuraHub-Installation verarbeitet werden — beim Besuch öffentlicher Ausstellungen und beim Kuratieren.',

    '## Verantwortlich',
    lines(address(op), op.representative && `Vertreten durch: ${op.representative}`),
    lines(`E-Mail: ${mail(op.email)}`, op.phone && `Telefon: ${op.phone}`),
    op.dpo && `## Datenschutzbeauftragte(r)\n\n${op.dpo}`,

    '## Kurzfassung',
    [
      '- CuraHub setzt **keine Cookies**, verwendet **kein Tracking**, keine Analyse- oder Werbedienste und lädt keine Schriften, Skripte oder Bilder von anderen Servern.',
      '- Im Browser werden nur die Anmeldung und von dir gewählte Ansichtseinstellungen gespeichert (siehe „Speicherung im Browser“). Dafür ist keine Einwilligung nötig.',
      '- Wer eine öffentliche Ausstellung ansieht, braucht kein Konto; dabei werden keine Daten über dich gespeichert.',
    ].join('\n'),

    '## Aufruf der Seiten (Server-Protokolle)',
    'Beim Aufruf jeder Seite überträgt dein Browser technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse und Angaben zum Browser. Die Anwendung selbst speichert diese Daten nicht. Um wiederholte Fehlanmeldungen abzuwehren, hält sie die IP-Adresse und den eingegebenen Benutzernamen bis zu 15 Minuten im Arbeitsspeicher.',
    [
      op.hosting && `CuraHub läuft ${op.hosting}.`,
      op.logRetentionDays !== null
        ? `Der vorgeschaltete Webserver protokolliert Zugriffe einschließlich der IP-Adresse; diese Protokolle werden nach ${op.logRetentionDays} ${op.logRetentionDays === 1 ? 'Tag' : 'Tagen'} gelöscht.`
        : 'Der vorgeschaltete Webserver kann Zugriffe einschließlich der IP-Adresse protokollieren; diese Protokolle werden nur so lange aufbewahrt, wie es für den sicheren Betrieb nötig ist.',
    ].filter(Boolean).join(' '),
    `Rechtsgrundlage ist ${logBasis}; der Zweck ist die sichere und zuverlässige Bereitstellung der Anwendung.`,

    '## Speicherung im Browser',
    'CuraHub setzt keine Cookies. Im lokalen Speicher deines Browsers (localStorage) legt es nur ab, was für die von dir genutzten Funktionen unbedingt erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG):',
    storageTable,
    'Die Einträge bleiben in deinem Browser, bis du dich abmeldest oder sie in den Browser-Einstellungen löschst. Sie werden nicht an Dritte übertragen.',

    '## Öffentliche Ausstellungen',
    'Veröffentlichte Ausstellungen sind ohne Anmeldung zugänglich. Damit Kuratorinnen und Kuratoren sehen, wie viele Personen gerade eine Ausstellung besuchen, baut der Viewer eine Verbindung zum Server auf; dabei wird nur eine zufällige Kennung für den geöffneten Tab verwendet. Die Zahl wird nicht gespeichert, und es entsteht kein Besuchsprofil.',
    'Zu jeder Ausstellung wird angezeigt, wer sie veröffentlicht hat (der Benutzername vor dem @, nie die E-Mail-Adresse).',

    '## Konto und Anmeldung',
    'Kuratieren setzt ein Konto voraus.',
    [
      '- **HSBI-Konto:** Benutzername und Passwort werden zur Prüfung verschlüsselt an die Anmeldung der Hochschule Bielefeld (www.hsbi.de) übermittelt. CuraHub speichert das Passwort nicht.',
      '- **CuraHub-Konto:** Konten, die eine Administratorin oder ein Administrator anlegt. Gespeichert wird das Passwort nur als Hash (bcrypt).',
    ].join('\n'),
    `Zu jedem Konto speichert CuraHub die E-Mail-Adresse beziehungsweise den Benutzernamen, die Rolle, das Datum der Registrierung und ob die Einführungstour abgeschlossen ist. Rechtsgrundlage ist ${accountBasis}.`,

    '## Inhalte, Zusammenarbeit und Live-Anzeige',
    'CuraHub speichert die Projekte, Ausstellungen, Versionen und hochgeladenen Dateien sowie, wer welche Version angelegt hat und wer zu einer Ausstellung eingeladen ist.',
    [
      '- Beim Hochladen entfernt CuraHub die eingebetteten Metadaten aus Bildern und Videos (z. B. Kamera, Aufnahmezeit, GPS-Position). PDF-Bücher und 3D-Modelle werden unverändert gespeichert.',
      '- Wer gemeinsam an einer Ausstellung arbeitet, sieht in der Kopfzeile Benutzernamen, wer gerade welches Objekt bearbeitet, und in welcher Ansicht die anderen sind. Diese Angaben werden nur im Arbeitsspeicher des Servers gehalten und nicht gespeichert.',
      '- Für veröffentlichte Versionen erzeugt der Server selbst eine AR-Datei der Ausstellung; dafür werden keine Dienste Dritter genutzt.',
    ].join('\n'),
    'Inhalte werden gelöscht, wenn du sie löschst oder dein Konto gelöscht wird.',

    '## Sicherungen',
    'Die Datenbank wird täglich gesichert. Die Sicherungen werden nach 14 Tagen automatisch gelöscht.',

    '## Empfänger',
    'Bei HSBI-Konten werden die Anmeldedaten zur Prüfung an die Hochschule Bielefeld übermittelt (siehe oben).',
    env.behindCloudflare && CLOUDFLARE,
    op.otherRecipients,
    !thirdCountry && 'Weitere Empfänger gibt es nicht. Eine Übermittlung in Länder außerhalb der EU findet nicht statt.',

    '## Deine Rechte',
    'Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit sowie das Recht, einer Verarbeitung zu widersprechen (Art. 15 bis 21 DSGVO). Wende dich dafür an die oben genannte Stelle.',
    `Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren${op.dataProtectionAuthority ? `, zuständig ist: ${op.dataProtectionAuthority}` : ''}.`,

    `Stand: ${standOf(op.updatedAt)}`,
  );
}

export interface LegalSettings {
  operator: LegalOperator | null;
  /** Own Markdown; empty = generated. */
  imprint: string;
  privacy: string;
}

/** The texts the pages show: an own text wins, else generated from complete details, else ''. */
export function resolveLegalDocuments(s: LegalSettings, env: LegalEnvironment): { imprint: string; privacy: string } {
  const op = operatorComplete(s.operator) ? s.operator : null;
  return {
    imprint: s.imprint.trim() || (op ? buildImprint(op) : ''),
    privacy: s.privacy.trim() || (op ? buildPrivacy(op, env) : ''),
  };
}
