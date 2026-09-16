# 3D-Editor (Planer-Modus)

Der 3D-Editor ist dein Hauptwerkzeug zur Einrichtung der virtuellen Ausstellungen im Raum "Satellit".

## Ansichten & Kamera
Du kannst jederzeit zwischen verschiedenen Ansichten wechseln:
- **Planer-Ansicht (Orbit / Top-Down):** Eine übersichtliche Vogelperspektive. Perfekt, um viele Kunstwerke schnell anzuordnen.
- **First-Person-Ansicht:** Bewege dich wie ein Besucher durch den Raum. Ideal, um die Wirkung der Ausstellung zu testen.

## Kunstwerke & Wände platzieren
Ziehe ein Asset aus der Bibliothek per Drag & Drop in den Raum. Das smarte **Raycasting** sorgt dafür, dass Objekte automatisch an Wänden oder auf dem Boden einrasten.
Zusätzlich kannst du modulare Messewände frei im Raum aufstellen, um neue Raumstrukturen zu schaffen.

3D-Modelle und Gaussian Splats stehen auf dem Boden. Ein Splat wird beim Laden aufgerichtet und mit der Mitte seiner Unterseite auf den Ablagepunkt gestellt. Steht ein Scan trotzdem auf dem Kopf, drehst du ihn mit **R** und **X** um 180°. Während ein Splat lädt, zeigt ein blauer Rahmen seinen Platz an.

## Grafik
Unten in der Werkzeugleiste stellst du **Qualität** und **Renderer** ein. CuraHub zeichnet mit **WebGPU**, wenn dein Browser es unterstützt, sonst mit **WebGL**. Sieht etwas falsch aus oder ruckelt es, kannst du den Renderer dort von Hand wechseln. Die Seite lädt dabei neu.

## Transform-System (Blender-Style)
Wenn du ein Objekt auswählst, erscheinen 3D-Gizmos. Du kannst aber auch Tastenkürzel nutzen:
- **G (Grab):** Verschieben
- **R (Rotate):** Rotieren
- **S (Scale):** Skalieren
- **X, Y, Z:** Achse sperren

Für exakte Einstellungen (z.B. "Zentrum des Bildes genau auf 1,45m Höhe") nutzt du das **Properties-Panel** auf der rechten Seite.
