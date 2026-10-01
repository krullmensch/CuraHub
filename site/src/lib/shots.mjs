/** Every screenshot the site shows. File: site/src/assets/screenshots/<name>.png */
export const FEATURE_SHOTS = [
    { name: 'planer-3d', alt: 'Der 3D-Planer: Ausstellungsraum von schräg oben, alle Werke an Wänden und Stellwänden sind ausgewählt.' },
    { name: 'wandeditor-2d', alt: 'Der 2D-Wandeditor: eine Stellwand frontal mit vier gerahmten Werken, Hängelinie, Abstandsmaßen und Hilfslinien.' },
    { name: 'medien', alt: 'Die Medienbibliothek mit Bildern, einem Video, einem 3D-Modell und einem Buch.' },
    { name: 'rahmen', alt: 'Ein ausgewähltes Bild mit Holzrahmen und Passepartout, daneben die Einstellungen für Rahmen und Passepartout.' },
    { name: 'versionen', alt: 'Die Versionshistorie einer Ausstellung mit drei Versionen, eine davon veröffentlicht.' },
    { name: 'rundgang', alt: 'Der Rundgang aus der Ich-Perspektive: Blick in den Raum mit Stellwänden, Maßstabsfigur und eingeblendeten Werkangaben.' },
];

export const WIZARD_SHOTS = [
    { name: 'setup-1-code', alt: 'Einrichtungsassistent, Schritt 1: Eingabe des Setup-Codes.' },
    { name: 'setup-2-systemcheck', alt: 'Einrichtungsassistent, Schritt 2: Systemcheck mit sechs bestandenen Prüfungen und zwei Warnungen.' },
    { name: 'setup-3-adresse', alt: 'Einrichtungsassistent, Schritt 3: öffentliche Adresse der Installation.' },
    { name: 'setup-4-notfall-admin', alt: 'Einrichtungsassistent, Schritt 4: Notfall-Admin anlegen.' },
    { name: 'setup-5-hsbi-admin', alt: 'Einrichtungsassistent, Schritt 5: HSBI-Admin festlegen.' },
];

export const ALL_SHOTS = [...FEATURE_SHOTS, ...WIZARD_SHOTS];
