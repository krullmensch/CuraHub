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

## Rahmen
Jedes Bild kann **gerahmt** oder **ohne Rahmen** hängen — im Properties-Panel unter "Rahmen". Ungerahmt liegt das Werk wie ein aufgezogener Druck flach auf der Wand.

Die Rahmen folgen dem Sortiment der HALBE-Magnetrahmen:
- **Profil:** Alu 6, 7, 8, 12, 14 und 18 sowie Holz 10, 16, 20 und 22 — mit HALBEs Aufsichtsmaß und Profiltiefe (z.B. Alu 8: 9 × 27 mm, Holz 22: 21 × 41,5 mm). Alu 6 ist leicht abgerundet, Alu 12 hat einen Radius nach außen.
- **Farbe:** je Profil nur die Farben, die HALBE dafür anbietet. Aluminium in Silber, Weiß, Schwarz, Mittelgrau matt, Edelstahl gebürstet, Chrom glänzend und Gold matt. Holz in Eiche natur, weiß, grau und schwarz, Ahorn natur und weiß, Erle dunkel und braun sowie Nussbaum natur — mit Furniermaserung, die an der 45°-Gehrung die Richtung wechselt.

Wechselst du das Profil, bleibt die Farbe erhalten, wenn es sie dort gibt; sonst nimmt CuraHub die nächstliegende.

## Passepartout
Gerahmte Bilder können ein **Passepartout** bekommen: weißer Museumskarton, 1,5 mm stark, mit Schrägschnitt. Du stellst die **Breite** an den Seiten in Zentimetern ein und die **Platzierung** des Ausschnitts:
- **Mittig:** alle Ränder gleich breit.
- **Optische Mitte:** der untere Rand etwas breiter als der obere, damit das Bild für das Auge mittig wirkt.
- **Goldener Schnitt:** der untere Rand deutlich breiter.

Das Bild bleibt exakt so groß und genau dort, wo es hängt — der Rahmen wächst um das Passepartout nach außen. Das Panel zeigt das **Außenmaß** des ganzen Rahmens.

Der Bildausschnitt bleibt immer exakt so groß wie das Werk. Das zuletzt gewählte Profil, die Farbe und das Passepartout gelten auch für neu abgelegte Werke, die Drag-Vorschau zeigt sie bereits. Im 2D-Wandeditor rechnen Ausrichten, Abstände und Warnungen mit der Außenkante des Rahmens.

## 2D-Wandeditor
Zum genauen Hängen öffnest du eine Wand frontal im **2D-Wandeditor** – per Doppelklick auf die Wandfläche, mit **E** oder über das Properties-Panel. Dort richtest du Werke aus, stellst Abstände ein und misst Höhen über dem Boden. Das eigene Wiki-Kapitel "2D-Wandeditor" beschreibt ihn im Detail.
