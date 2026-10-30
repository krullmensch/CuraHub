# Ausstellungs- & Projektverwaltung

In CuraHub verwaltest du deine Ausstellungen in Projekten. Das System nutzt eine Versionskontrolle, damit du verschiedene Entwürfe sicher ausprobieren kannst.

## Projekt-Dashboard
Oben im Editor wechselst du zwischen deinen Projekten und legst neue an. Jedes Projekt ist eine Ausstellung mit eigener Asset-Bibliothek und eigenen Versionen.

Beim ersten Besuch führt dich eine kurze Tour durch das Dashboard. Du kannst sie jederzeit über **Tour starten** oben im Wiki erneut ansehen.

## Auf dem Handy planen
Öffnest du den Editor auf einem Smartphone, erscheint statt des vollen Editors eine **mobile Ansicht**: oben der 3D-Raum (mit einem Finger drehen, mit zwei Fingern zoomen und verschieben), unten die Reiter **Raum** und **Assets**.

- **Raum:** Tippe ein Kunstwerk an, um Titel und Maße zu sehen und Rahmen und Passepartout umzustellen. Änderungen werden wie am Rechner gespeichert; bei einer veröffentlichten Version fragt CuraHub zuerst nach einer Arbeitskopie.
- **In AR an Wand:** zeigt das Werk mit Rahmen und Passepartout in echter Größe an einer echten Wand (iPhone über die AR-Ansicht von iOS, Android in Chrome). Dafür braucht das Werk Breite und Höhe in cm; fehlen sie, steht dort **Maße fehlen – am Rechner eintragen**.
- **Assets:** Bilder und Videos des Projekts; über **In AR an Wand** wählst du vorher Rahmen und Passepartout und siehst das noch nicht gehängte Werk an der Wand.

Hängen, verschieben, hochladen und der 2D-Wandeditor gehen nur am Rechner. **Vollen Editor öffnen** (unten im Blatt) schaltet auf dem Gerät dauerhaft zum vollen Editor, **Mobile Ansicht** in der Kopfzeile wieder zurück.

## Versionskontrolle
Eine Version ist ein kompletter Snapshot (Speicherpunkt) deiner Ausstellung, inklusive aller platzierten Kunstwerke und Wände.
- **Version speichern:** Die Versionshistorie (unten im Editor) hält den aktuellen Stand mit einem Kommentar fest.
- **Branching:** Mit **Neuer Branch ab hier** arbeitest du auf Basis einer Version an einer Variante weiter, ohne den Hauptstand zu verändern. **In main mergen** führt sie später zurück.
- **Historie laden:** **Aktivieren** bringt dich zu einer älteren Version zurück.
- Zu einer Version gehören auch die Hängehöhe und die Hilfslinien des 2D-Wandeditors.

## Publishing-Workflow
Damit Besucher deine Ausstellung sehen können, muss sie veröffentlicht werden.
1. Wähle eine fertige Version in der Versionshistorie aus.
2. Klicke auf **Veröffentlichen**. Es ist immer genau eine Version veröffentlicht; die vorherige wird dabei abgelöst.
3. Besucher können nun über den Ausstellungs-Link (`/exhibition/:slug`) darauf zugreifen. **Viewer testen** im Editor öffnet ihn.

Veröffentlichte Versionen sind **schreibgeschützt**, damit Besucher nie halbfertige Änderungen sehen. Sobald du in einer veröffentlichten Version etwas änderst, fragt der Editor nach: **Arbeitskopie anlegen** übernimmt deine Änderung in eine neue Version auf demselben Branch, die Öffentlichkeit sieht weiter den alten Stand. Oben in der Kopfzeile steht dann „Arbeitskopie von v…“; mit **Neu veröffentlichen** machst du die Arbeitskopie zur öffentlichen Version. Alternativ legst du einen neuen Branch an (ab Rolle Kurator) oder verwirfst die Änderung.

**AR-Export:** Nach dem Veröffentlichen erzeugt CuraHub automatisch eine Datei für Augmented Reality (GLB für Android, USDZ für iPhone und iPad). Die Dateien der vorher veröffentlichten Version werden dabei gelöscht. In der Versionshistorie zeigt die Zeile **AR-Export** den Stand (in Warteschlange, wird erzeugt, fertig, fehlgeschlagen). Dort lädst du **GLB herunterladen** und **USDZ herunterladen** und startest den Export mit **Neu erzeugen** bei Bedarf noch einmal, etwa nach einem Fehler.

*Tipp: Admins können besonders gelungene, veröffentlichte Ausstellungen auf der Startseite hervorheben (Featured Exhibitions).*
