# Asset-Management & Medien

Die Asset-Bibliothek ist der zentrale Ort für all deine digitalen Kunstwerke. Einmal hochgeladen, kannst du sie in verschiedenen Versionen deiner Ausstellung wiederverwenden.

## Medien hochladen
Du kannst Dateien per Drag & Drop in die Bibliothek ziehen oder über **Dateien hochladen** auswählen. Mit **Ordner hochladen** oder einem hineingezogenen Ordner lädst du ganze Ordner samt Unterordnern auf einmal. Dateitypen, die CuraHub nicht kennt, listet das Upload-Fenster als Hinweis auf.

- **Bilder** (max. 200 MB): Werden automatisch skaliert (max. 2500 px) und für das Web optimiert (WebP-Format). Die realen Maße werden, falls vorhanden, aus Auflösung und DPI der Datei berechnet.
- **Videos** (MP4, MOV, M4V, WebM, MKV, AVI; max. 2 GB): Werden auf dem Server in das MP4-Format (H.264) umgewandelt, dazu entstehen Vorschaubilder. Solange die Umwandlung läuft, zeigt die Kachel den Fortschritt.
- **3D-Modelle** (GLB, GLTF, OBJ, FBX und weitere; max. 100 MB): Werden in ein komprimiertes GLB umgewandelt.
- **Gaussian Splats** (max. 1 GB): 3D-Scans aus Gaussian Splatting (z. B. aus Postshot, Polycam, Scaniverse oder Luma) als `.ply`, `.sog`, `.spz`, `.splat` oder `.ksplat`. CuraHub wandelt jeden Upload in `.spz` um, das ist etwa zehnmal kleiner als eine `.ply`, und rechnet ein Vorschaubild. Nur `.ksplat` bleibt, wie es ist. Einen entpackten SOG-Export (Ordner mit `meta.json` und WebP-Dateien) ziehst du als Ordner hinein.
- **Bücher** (PDF, max. 200 MB): Ein PDF wird zum Buch auf einem Sockel. Die erste Seite wird zum Umschlag, die Seitengröße bestimmt das Format des Buchs.

## Ordner
Links in der Bibliothek legst du Ordner an und sortierst deine Assets hinein. **Unsortiert** zeigt alles, was noch in keinem Ordner liegt.

## Metadaten verwalten
Jedes Kunstwerk besitzt wichtige Metadaten:
- Titel und Künstler
- Beschreibung und Jahr
- Reale Maße (Breite × Höhe in cm)

Diese Daten werden im Info-Overlay für die Besucher angezeigt. Halte sie aktuell, damit deine Ausstellung professionell wirkt!

## Bücher einstellen
Ein Doppelklick auf ein Buch in der Bibliothek öffnet seine Einstellungen; im Raum findest du dieselben Felder rechts im Properties-Panel:
- **Titel, Künstler:in** und **Jahr**.
- **Dicke:** automatisch aus der Seitenzahl oder von Hand in Zentimetern.
- **Umschlag:** die erste PDF-Seite oder ein eigenes Bild.
- **Im öffentlichen Viewer lesbar:** Nur dann können Besucher das Buch im öffentlichen Rundgang aufschlagen. Auf dem Sockel liegt es in jedem Fall.
