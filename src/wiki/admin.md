# Admin & Verwaltung

Admins haben Zugriff auf erweiterte Werkzeuge zur Verwaltung der Plattform. Der Raum selbst, der „Satellit“, ist fest vorgegeben.

## Featured Exhibitions
Admins können auf dem Dashboard oder in der Projektübersicht besonders gelungene, veröffentlichte Ausstellungen als **"Featured"** markieren. Diese Ausstellungen werden dann prominent auf der öffentlichen Startseite präsentiert.

## Benutzerverwaltung
Unter **Benutzerverwaltung** sehen Admins alle angemeldeten Konten und vergeben die Rollen User, Curator, Prof und Admin. Neue Nutzer:innen erscheinen dort nach ihrer ersten Anmeldung mit der Rolle User.

## Systemcheck
Der Abschnitt **System** in der Benutzerverwaltung zeigt, ob die Installation gesund ist: Datenbank, Upload-Ordner, freier Speicher, die Werkzeuge für Videos und PDFs, die Erreichbarkeit des HSBI-Logins und das Datenbank-Backup. Beim Backup steht, wann der letzte tägliche Dump geschrieben wurde; eine Warnung erscheint, wenn er älter als einen Tag ist oder fehlgeschlagen ist. Dieselben Prüfungen laufen im Einrichtungsassistenten.

## Impressum und Datenschutz

Sobald Ausstellungen öffentlich sind, braucht die Installation ein Impressum und eine Datenschutzerklärung. CuraHub erzeugt beide aus den Angaben zum Betreiber: Name, Anschrift und E-Mail (Pflicht), dazu Vertretung, Aufsichtsbehörde, Datenschutzbeauftragte:r, Server-Standort und wie lange Zugriffsprotokolle aufbewahrt werden. Du trägst sie im Einrichtungsassistenten oder später in der **Benutzerverwaltung** unter **Rechtliche Angaben** ein. Die Texte stehen dann unter `/impressum` und `/datenschutz` und sind auf jeder öffentlichen Seite verlinkt; lass die Datenschutzerklärung von der oder dem Datenschutzbeauftragten prüfen.

Brauchst du einen anderen Wortlaut, stell das Dokument auf **Eigener Text**: Es beginnt mit dem erzeugten Text, den du in Markdown anpasst.

Einen Cookie-Hinweis braucht CuraHub nicht: Es setzt keine Cookies und speichert im Browser nur die Anmeldung und selbst gewählte Ansichtseinstellungen.

## CuraHub-Konten anlegen
Unter **CuraHub-Konto anlegen** in der Benutzerverwaltung legst du ein Konto mit Benutzername (3–32 Zeichen: a–z, 0–9, Punkt, Unterstrich, Bindestrich) und Rolle an. CuraHub erzeugt ein Startpasswort und zeigt es nur dieses eine Mal an: gib Benutzername und Startpasswort an die Person weiter. Bei ihrer ersten Anmeldung legt sie ein eigenes Passwort fest; bis dahin steht in der Liste „Startpasswort noch nicht geändert".

Bei CuraHub-Konten gibt es **Passwort zurücksetzen**: Das erzeugt ein neues Startpasswort, das bisherige gilt nicht mehr. Wer schon angemeldet ist, bleibt angemeldet; um jemanden sofort auszusperren, lösche das Konto. HSBI-Konten haben kein Passwort in CuraHub.

Ein Wechsel vom HSBI-Konto zu einem CuraHub-Konto überträgt keine Projekte: Lade das neue Konto in die Ausstellungen ein.

## Notfall-Admin
Ist das Passwort eines lokalen Admin-Kontos verloren, setzt es jemand mit Zugriff auf den Server neu. Der Setup-Guide beschreibt den Befehl unter "Notfälle".
