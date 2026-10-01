# Benutzer- & Rechtesystem

CuraHub verfügt über ein rollenbasiertes Rechtesystem. Die Anmeldung läuft über das HSBI-Konto (Hochschul-Login). Wer sich zum ersten Mal anmeldet, hat zunächst die Rolle **User** und muss freigeschaltet werden.

## Rollen im Überblick

### Besucher (ohne Login)
- Kann veröffentlichte Ausstellungen im Viewer-Modus ansehen.
- Kein Zugriff auf den Editor oder unveröffentlichte Entwürfe.

### 1. User
- Angemeldet, aber noch nicht freigeschaltet.
- Sieht statt des Editors den Hinweis, dass der Zugriff fehlt.

### 2. Curator (Kurator:in)
- Eigene Ausstellungsprojekte anlegen.
- Medien hochladen (Bilder, Videos, 3D-Modelle, Gaussian Splats, Bücher).
- Den 3D-Editor und den 2D-Wandeditor nutzen.
- Versionen anlegen, zusammenführen und veröffentlichen.
- Sieht nur eigene Projekte und solche, zu denen sie oder er als Mitwirkende:r eingeladen wurde.

### 3. Prof
- Alle Rechte eines Kurators.
- Ausstellungseinstellungen ändern: Titel, Laufzeit, Plakat.
- Mitwirkende zu einer Ausstellung hinzufügen oder entfernen.
- User als Kurator:innen freischalten.

### 4. Admin
- Alle Rechte eines Profs, für alle Projekte.
- Benutzerverwaltung: Rollen vergeben.
- Systemcheck der Installation einsehen.
- Ausstellungen für die Startseite als "Featured" markieren.

## Notfall-Login
Neben dem HSBI-Login gibt es lokale Admin-Konten mit eigenem Passwort. Sie werden bei der Einrichtung angelegt und funktionieren auch dann, wenn der HSBI-Login ausfällt. Auf der Login-Seite erreichst du sie über **Notfall-Login**.
