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

## 2D-Wandeditor
Im 2D-Wandeditor hängst du die Werke einer Wand millimetergenau, so als ständest du frontal davor. Die Kamera fliegt vor die Wand, schaltet auf eine verzerrungsfreie Frontalansicht, und alle anderen Wände mit ihren Werken werden ausgeblendet.

**Öffnen**
- Doppelklick auf eine Wand (die Seite, auf die du gerade schaust, wird geöffnet)
- Wand auswählen und **E** drücken, oder im Properties-Panel **Vorderseite** / **Rückseite** wählen
- Werk an einer Wand auswählen und **Wand im 2D-Editor öffnen** klicken

Oben wechselst du zwischen **Vorderseite** und **Rückseite**, benennst die Wand um und zoomst. **Fertig** oder **Esc** bringt dich zurück in die 3D-Ansicht. Werke ziehst du wie gewohnt aus der Bibliothek direkt auf die Wand (die Wand muss gesperrt sein).

**Auswählen und verschieben**
- Klick wählt ein Werk, **⇧ + Klick** fügt weitere hinzu, ein aufgezogener Rahmen wählt alle darin. **⌘/Strg + A** wählt alle Werke dieser Seite.
- Beim Ziehen rasten Werke an Kanten und Mitten anderer Werke, an Wandkanten, Wandmitte, Hängehöhe und Hilfslinien ein. Rote Linien zeigen die Ausrichtung, pinke Marken gleiche Abstände. **⌘/Strg** beim Ziehen schaltet das Einrasten kurz aus, **⇧** hält die Bewegung waagrecht oder senkrecht.
- Pfeiltasten verschieben um 1 cm, mit **⇧** um 10 cm, mit **Alt** um 1 mm. **Entf** entfernt die Auswahl (rückgängig mit **⌘/Strg + Z**).

**Ausrichten und Abstände** (rechtes Panel)
- Sechs Knöpfe richten links, mittig, rechts, oben, mittig oder unten aus – **zueinander** oder **an der Wand**. Ein einzelnes Werk richtet sich immer an der Wand aus.
- **Horizontaler / vertikaler Abstand** setzt den Abstand zwischen den ausgewählten Werken auf einen festen Wert (das linke bzw. obere Werk bleibt stehen). Der Verteilen-Knopf daneben verteilt drei oder mehr Werke gleichmäßig.
- Bei mehreren Werken in einer Reihe erscheinen zwischen ihnen pinke Abstandsmarken. Ziehst du eine davon, ändern sich alle Abstände gleichzeitig.
- Unter **Position** trägst du Abstand zur linken/rechten Wandkante sowie Unterkante, Mitte und Oberkante über dem Boden direkt in cm ein.
- **Hängung**: Die gestrichelte Linie zeigt die Hängehöhe (Bildmitte über dem Boden, Standard 150 cm). **Mitten auf Linie** setzt jede Bildmitte darauf, **Gruppe auf Linie** die Mitte der ganzen Gruppe (Petersburger Hängung).

**Lineal und Messen**
- Die Lineale oben und links zeigen Zentimeter ab linker Wandkante und ab Boden. Ziehst du aus einem Lineal, entsteht eine Hilfslinie; zurück aufs Lineal gezogen verschwindet sie wieder.
- Werkzeug **Messen (M)**: Fährst du über ein Werk, siehst du die Höhe von Unterkante (UK), Bildmitte und Oberkante (OK) über dem Boden sowie die Abstände zu den Nachbarn und zur Wandkante. Ziehen misst eine beliebige Strecke (mit **⇧** gerade); ein Klick auf den Messwert entfernt sie wieder.
- **Alt** halten zeigt die Abstände der Auswahl zu dem Werk unter dem Mauszeiger – oder zu Nachbarn, Wand und Boden.
- In der Werkzeugleiste blendest du Höhen über Boden, die Abstände zwischen allen Werken, die Hängehöhe und die Lineale ein oder aus.

**Ansicht**: Scrollen verschiebt die Ansicht, **⌘/Strg + Scrollen** oder Pinch zoomt, Leertaste oder mittlere/rechte Maustaste greifen die Ansicht, **⇧1** passt die Wand ein, **⇧2** die Auswahl. Der Maßstab oben (z. B. 1:20) gilt für einen Bildschirm mit 96 dpi.

Rote gestrichelte Rahmen markieren Werke, die sich überlappen, orange Rahmen Werke, die über die Wand hinausragen.
