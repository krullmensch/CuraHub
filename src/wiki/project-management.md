# Ausstellungs- & Projektverwaltung

In CuraHub verwaltest du deine Ausstellungen in Projekten. Das System nutzt eine Versionskontrolle, damit du verschiedene Entwürfe sicher ausprobieren kannst.

## Projekt-Dashboard
Oben im Editor wechselst du zwischen deinen Projekten und legst neue an. Jedes Projekt ist eine Ausstellung mit eigener Asset-Bibliothek und eigenen Versionen.

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

*Tipp: Admins können besonders gelungene, veröffentlichte Ausstellungen auf der Startseite hervorheben (Featured Exhibitions).*
