/** Every screenshot the site shows. File: site/src/assets/screenshots/<name>.png */
export const FEATURE_SHOTS = [
    { name: 'planer-3d', alt: 'Der 3D-Planer: Ausstellungsraum von schräg oben, mehrere Werke an den Wänden sind ausgewählt.' },
    { name: 'wandeditor-2d', alt: 'Der 2D-Wandeditor: eine Wand frontal mit Hängelinie, Abstandsmaßen und Hilfslinien.' },
    { name: 'medien', alt: 'Die Medienbibliothek mit Bildern, einem Video, einem 3D-Modell und einem Buch.' },
    { name: 'rahmen', alt: 'Ein ausgewähltes Bild mit Rahmen und Passepartout, daneben die Rahmenauswahl.' },
    { name: 'versionen', alt: 'Die Versionsübersicht einer Ausstellung mit veröffentlichter Version.' },
    { name: 'rundgang', alt: 'Der Rundgang aus der Ich-Perspektive: Blick entlang einer Wand mit Werken.' },
];

export const WIZARD_SHOTS = [
    { name: 'setup-1-code', alt: 'Einrichtungsassistent, Schritt 1: Eingabe des Setup-Codes.' },
    { name: 'setup-2-systemcheck', alt: 'Einrichtungsassistent, Schritt 2: Systemcheck mit bestandenen Prüfungen.' },
    { name: 'setup-3-adresse', alt: 'Einrichtungsassistent, Schritt 3: öffentliche Adresse der Installation.' },
    { name: 'setup-4-notfall-admin', alt: 'Einrichtungsassistent, Schritt 4: Notfall-Admin anlegen.' },
    { name: 'setup-5-hsbi-admin', alt: 'Einrichtungsassistent, Schritt 5: HSBI-Admin festlegen.' },
];

export const ALL_SHOTS = [...FEATURE_SHOTS, ...WIZARD_SHOTS];
