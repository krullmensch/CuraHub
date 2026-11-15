# Raum-Shading: Licht mit Richtung — Design (kleine Änderung)

**Stand:** 2026-11-15 · **Status:** zur Freigabe
**Bezug:** `src/components/Scene.tsx`, `src/components/Satellit.tsx`, `src/lib/renderQuality.ts`, `docs/frames-aab-bilderrahmen.md` §5, `docs/superpowers/specs/2026-09-30-tag-nacht-licht-grobplan.md`

## Warum

Der Raum wirkt flach: Wandecken, Wandenden und Stellwand-Kanten verschwinden, weil fast jedes Licht richtungslos ist (Ambient 0,4, RectAreaLight nach unten 3,5 und nach oben 1,2, Fill 0,3; bei „Niedrig“ Hemisphere 1,7). Zwei rechtwinklige weiße Flächen bekommen dadurch fast gleich viel Licht. Am meisten stört das beim Durchlaufen (Ich-Perspektive, Editor und Viewer), aber es gilt überall.

## Ziele

- Flächen mit unterschiedlicher Ausrichtung unterscheiden sich sichtbar in der Helligkeit, sodass Ecken, Wandenden und Stellwand-Kanten lesbar werden, in allen Ansichten und Qualitätsstufen.
- Im Mittel ist der Raum so hell wie heute.

## Nicht-Ziele

- Keine Verdunkelung in Ecken (AO), keine Schatten, kein gebackenes Licht und keine Nachbearbeitung. Das sind die Wege B/C, zurückgestellt.
- Keine neuen Einstellungen in der Oberfläche.

## Anti-Ziele

- Wirkt der Raum dunkler, schmutziger oder dramatisch, ist das Ziel verfehlt: Er soll ruhig und hell bleiben, nur mit Form.
- Die Rahmenfarben dürfen nicht spürbar wegdriften. Sie sind kalibriert auf `render = ACES(albedo_lin × 1,7)` unter RectAreaLight 3,5.
- Es darf keine messbaren Kosten beim Rendern geben, auch nicht auf Handys.

## Ansätze

| | Weg | Abwägung |
|---|---|---|
| **A (gewählt)** | Licht neu verteilen: weniger richtungsloses Licht, mehr gerichtetes | günstig, beide Renderer, keine Assets; keine Eckverdunkelung |
| B | AO als Nachbearbeitung in Echtzeit | dynamisch und echt, aber zwei Umsetzungen (TSL/GLSL), Kosten, auf Handys aus |
| C | AO/Licht in Blender backen + Stellwand-Fasen | zur Laufzeit gratis, aber Blender-Arbeit, nur für den statischen Raum |

Gewählt hat der Nutzer A, „erstmal nur A“. B/C bleiben als Folgeschritt offen.

## Design

1. **Richtungsloses Licht runter:** Ambient von 0,4 auf ≈ 0,15. Bei „Niedrig“ die Hemisphere so absenken, dass ihr Boden-/Himmelskontrast die Arbeit macht und keinen flachen Sockel liefert.
2. **Fensterlicht als Schlüssel:** ein `directionalLight` aus Richtung der Fensterwand (−Z), leicht von oben und seitlich versetzt (nicht exakt entlang einer Achse), damit die vier Wandrichtungen vier verschiedene Helligkeiten bekommen. Warmweiß ähnlich `#fff5e0`, ohne Schatten.
3. **Gegenlicht schwach:** Das bestehende Fill-Light (`[-6, 6, -4]`, 0,3) wird zum schwachen Gegenlicht aus der Gegenrichtung, damit die abgewandten Wände nicht absaufen.
4. **Deckenlicht bleibt die Basis:** Das RectAreaLight nach unten bleibt (es gibt den natürlichen Verlauf von oben). Das Bounce-Licht nach oben (1,2) wird gesenkt, weil es die Decke und die oberen Wandbereiche gleichmäßig aufhellt.
5. **Helligkeit halten:** Die Stärken werden so abgestimmt, dass die mittlere Beleuchtung einer Wand-Vorderseite ≈ heute ist. Ziel-Spreizung zwischen den Wandrichtungen etwa ±15–25 %; der genaue Wert wird am Bild entschieden.
6. **Ort:** Alle Lichtwerte kommen als benannte Konstanten in ein kleines Modul (z. B. `src/lib/roomLighting.ts`), damit der Tag/Nacht-Plan sie später übernimmt. Keine neue Logik in den Komponenten.
7. **Prüfung:** Vorher/Nachher-Screenshots auf dem Test-Stack (headless Chrome über CDP, WebGPU und `?renderer=webgl`, alle drei Qualitätsstufen): Ich-Perspektive in eine Raumecke, ein Stellwand-Ende vor weißer Wand, Orbit-Gesamtansicht, ein Aab-Weiß- und ein Alu-Rahmen nah. Lokal wird nicht getestet.

## Folgen, die man kennen muss

- Werke sind bei „Hoch“ beleuchtet (`MeshStandardMaterial`). Sie werden je nach Wandrichtung leicht heller/dunkler, bei „Niedrig“/„Mittel“ (unbeleuchtet) nicht. So bleibt es bis zum Material-Umbau des Tag/Nacht-Plans.
- Rahmen auf verschiedenen Wänden sehen dadurch ebenfalls leicht verschieden aus, so wie in echt. Auf der Wand mit mittlerer Helligkeit muss die Kalibrierung halten.

## Dem Umsetzer überlassen

Die genauen Richtungen, Stärken und Farbtemperaturen der Lichter, abgestimmt am Screenshot innerhalb der Grenzen oben.
