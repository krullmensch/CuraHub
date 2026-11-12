/**
 * Starting points for the operator's Impressum and Datenschutzerklärung (admin → „Rechtliche
 * Angaben"). The privacy template describes what CuraHub itself processes; `[[…]]` marks what only
 * the operator knows. The server's system check warns while a placeholder is left
 * (`PLACEHOLDER_RE` in server/src/lib/legalTexts.ts).
 *
 * Keep it true to the code: `templates.test.ts` fails when a localStorage key is missing here.
 */

export const PLACEHOLDER_RE = /\[\[[^\]\n]+\]\]/;

export const hasPlaceholders = (text: string): boolean => PLACEHOLDER_RE.test(text);

export const IMPRINT_TEMPLATE = `# Impressum

## Angaben gemäß § 5 DDG

[[Name der Einrichtung oder Person, die CuraHub betreibt]]
[[Straße und Hausnummer]]
[[Postleitzahl und Ort]]

[[Bei einer Hochschule: Rechtsform (z. B. Körperschaft des öffentlichen Rechts) und gesetzliche Vertretung (z. B. Präsidentin oder Präsident)]]

## Kontakt

E-Mail: [[E-Mail-Adresse]]
Telefon: [[Telefonnummer]]

## Zuständige Aufsichtsbehörde

[[Bei einer Hochschule: das zuständige Ministerium, z. B. Ministerium für Kultur und Wissenschaft des Landes Nordrhein-Westfalen]]

## Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV

[[Name, Anschrift]]

## Ausstellungen

Die veröffentlichten Ausstellungen werden von den jeweiligen Kuratorinnen und Kuratoren gestaltet. Für die gezeigten Werke und Texte sind sie verantwortlich; Hinweise auf Rechtsverletzungen bitte an die oben genannte Adresse.
`;

export const PRIVACY_TEMPLATE = `# Datenschutzerklärung

Diese Erklärung beschreibt, welche personenbezogenen Daten bei der Nutzung dieser CuraHub-Installation verarbeitet werden — beim Besuch öffentlicher Ausstellungen und beim Kuratieren.

## Verantwortlich

[[Name der Einrichtung, Anschrift, E-Mail-Adresse]]

## Datenschutzbeauftragte(r)

[[Kontakt der oder des Datenschutzbeauftragten, z. B. datenschutz@…]]

## Kurzfassung

- CuraHub setzt **keine Cookies**, verwendet **kein Tracking**, keine Analyse- oder Werbedienste und lädt keine Schriften, Skripte oder Bilder von anderen Servern.
- Im Browser werden nur die Anmeldung und von dir gewählte Ansichtseinstellungen gespeichert (siehe „Speicherung im Browser“). Dafür ist keine Einwilligung nötig.
- Wer eine öffentliche Ausstellung ansieht, braucht kein Konto; dabei werden keine Daten über dich gespeichert.

## Aufruf der Seiten (Server-Protokolle)

Beim Aufruf jeder Seite überträgt dein Browser technisch notwendige Daten: IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse und Angaben zum Browser. Die Anwendung selbst speichert diese Daten nicht. Um wiederholte Fehlanmeldungen abzuwehren, hält sie die IP-Adresse und den eingegebenen Benutzernamen bis zu 15 Minuten im Arbeitsspeicher.

[[Betrieb und Protokolle beschreiben, z. B.: CuraHub läuft auf einem Server im Rechenzentrum der … . Der vorgeschaltete Webserver protokolliert Zugriffe einschließlich der IP-Adresse; diese Protokolle werden nach … Tagen gelöscht.]]

Rechtsgrundlage ist [[z. B. für eine Hochschule: Art. 6 Abs. 1 Buchst. e DSGVO in Verbindung mit § 3 DSG NRW; für andere Betreiber: Art. 6 Abs. 1 Buchst. f DSGVO]]; der Zweck ist die sichere und zuverlässige Bereitstellung der Anwendung.

## Speicherung im Browser

CuraHub setzt keine Cookies. Im lokalen Speicher deines Browsers (localStorage) legt es nur ab, was für die von dir genutzten Funktionen unbedingt erforderlich ist (§ 25 Abs. 2 Nr. 2 TDDDG):

| Eintrag | Inhalt | Wann |
|---|---|---|
| \`curahub-auth\` | Anmelde-Token (30 Tage gültig), E-Mail-Adresse bzw. Benutzername und Rolle | nach der Anmeldung; wird beim Abmelden geleert |
| \`curahub-render-quality\` | gewählte Darstellungsqualität | wenn du sie von Hand einstellst |
| \`curahub-renderer\` | gewählte Grafikschnittstelle (WebGPU/WebGL) | wenn du sie von Hand einstellst |
| \`curahub-sidebar-view\` | Ansicht der Werk-Seitenleiste | im Editor |
| \`curahub-room-cutaway\` | Puppenhaus-Ansicht an oder aus | im Editor |
| \`curahub-wall-measures\` | eingeblendete Maße | im Editor |
| \`curahub-wall-guides-view\` | Anzeige der Hilfslinien | im Wand-Editor |
| \`curahub-mobile-planner\` | Wahl zwischen mobiler und vollständiger Ansicht | auf dem Smartphone |

Die Einträge bleiben in deinem Browser, bis du dich abmeldest oder sie in den Browser-Einstellungen löschst. Sie werden nicht an Dritte übertragen.

## Öffentliche Ausstellungen

Veröffentlichte Ausstellungen sind ohne Anmeldung zugänglich. Damit Kuratorinnen und Kuratoren sehen, wie viele Personen gerade eine Ausstellung besuchen, baut der Viewer eine Verbindung zum Server auf; dabei wird nur eine zufällige Kennung für den geöffneten Tab verwendet. Die Zahl wird nicht gespeichert, und es entsteht kein Besuchsprofil.

Zu jeder Ausstellung wird angezeigt, wer sie veröffentlicht hat (der Benutzername vor dem @, nie die E-Mail-Adresse).

## Konto und Anmeldung

Kuratieren setzt ein Konto voraus.

- **HSBI-Konto:** Benutzername und Passwort werden zur Prüfung verschlüsselt an die Anmeldung der Hochschule Bielefeld (www.hsbi.de) übermittelt. CuraHub speichert das Passwort nicht.
- **CuraHub-Konto:** Konten, die eine Administratorin oder ein Administrator anlegt. Gespeichert wird das Passwort nur als Hash (bcrypt).

Zu jedem Konto speichert CuraHub die E-Mail-Adresse beziehungsweise den Benutzernamen, die Rolle, das Datum der Registrierung und ob die Einführungstour abgeschlossen ist. Rechtsgrundlage ist [[Art. 6 Abs. 1 Buchst. e DSGVO in Verbindung mit … (Hochschule) oder Art. 6 Abs. 1 Buchst. b DSGVO (Nutzungsvertrag)]].

## Inhalte, Zusammenarbeit und Live-Anzeige

CuraHub speichert die Projekte, Ausstellungen, Versionen und hochgeladenen Dateien sowie, wer welche Version angelegt hat und wer zu einer Ausstellung eingeladen ist.

- Beim Hochladen entfernt CuraHub die eingebetteten Metadaten aus Bildern und Videos (z. B. Kamera, Aufnahmezeit, GPS-Position). PDF-Bücher und 3D-Modelle werden unverändert gespeichert.
- Wer gemeinsam an einer Ausstellung arbeitet, sieht in der Kopfzeile Benutzernamen, wer gerade welches Objekt bearbeitet, und in welcher Ansicht die anderen sind. Diese Angaben werden nur im Arbeitsspeicher des Servers gehalten und nicht gespeichert.
- Für veröffentlichte Versionen erzeugt der Server selbst eine AR-Datei der Ausstellung; dafür werden keine Dienste Dritter genutzt.

Inhalte werden gelöscht, wenn du sie löschst oder dein Konto gelöscht wird.

## Sicherungen

Die Datenbank wird täglich gesichert. Die Sicherungen werden nach 14 Tagen automatisch gelöscht.

## Empfänger

Daten werden nur an die oben genannten Stellen übermittelt (Anmeldung der HSBI bei HSBI-Konten). [[Weitere Empfänger nennen, falls vorhanden, z. B. ein Hosting-Dienstleister als Auftragsverarbeiter oder Cloudflare, wenn die Installation über Cloudflare erreichbar ist, und ob dabei Daten in Länder außerhalb der EU übermittelt werden. Gibt es keine weiteren Empfänger: „Eine Übermittlung in Länder außerhalb der EU findet nicht statt.“]]

## Deine Rechte

Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung und Datenübertragbarkeit sowie das Recht, einer Verarbeitung zu widersprechen (Art. 15 bis 21 DSGVO). Wende dich dafür an die oben genannte Stelle.

Du kannst dich außerdem bei einer Datenschutz-Aufsichtsbehörde beschweren, zum Beispiel bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen (www.ldi.nrw.de).

Stand: [[Monat Jahr]]
`;
