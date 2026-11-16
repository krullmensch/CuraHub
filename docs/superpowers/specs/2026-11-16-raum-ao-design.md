# Raum-Shading B: Eckverdunkelung (GTAO) — Design

**Stand:** 2026-11-16 · **Status:** gebaut (Branch `feat/room-ao`). Abweichungen: nur „Hoch“, weil AO ~3 ms pro Bild kostet; nur in der Ich-Perspektive (im Orbit-Editor würden Gizmo, Maße und Vorschauen mitverdunkelt); Radius 0,3 m statt 0,6 m.
**Bezug:** `docs/superpowers/specs/2026-11-15-raum-shading-design.md` (Weg A, gebaut auf `feat/room-shading`), Spike `test/room-shading-light` (`AmbientOcclusionSpike.tsx`, `createAmbientOcclusionPipeline` in `webgpuSupport.ts`), Vergleichsbild `2026-11-15-gtao-spike-vergleich.png`

## Warum

Nach Weg A (Licht mit Richtung) wirkt der Raum immer noch „glattgebügelt“. Gerichtetes Licht färbt nur ganze Flächen unterschiedlich hell. Was fehlt, ist der weiche Übergang dort, wo Flächen aneinanderstoßen: in Raumecken, am Wandfuß, an Stellwand-Enden und hinter Rahmen. Der Spike mit GTAO hat genau das gezeigt, und der Nutzer will diese Richtung.

## Ziele

- Weiche Eckverdunkelung (Ambient Occlusion) in Raumecken, am Wandfuß, an Stellwänden und um Rahmen. Sie wird live berechnet und wirkt deshalb auch bei verschobenen Stellwänden.
- Gilt in der Ich-Perspektive (Editor und Viewer) und in der Orbit-Ansicht.
- Kantenglättung und Helligkeit wie ohne AO, außer in den Ecken.

## Nicht-Ziele

- Kein AO auf dem WebGL-Fallback (Nutzerentscheidung: Weg 1). Dort bleibt es bei Weg A.
- Kein AO bei „Niedrig“, also meist nicht auf Handys.
- Kein gebackenes Licht und keine Schatten.
- Kein neuer Schalter in der Oberfläche.

## Anti-Ziele

- Der Raum wirkt schmutzig, fleckig oder dunkler als heute. Gewollt ist ein ruhiger, heller Raum, nur mit Form.
- Fotos oder Videos werden sichtbar abgedunkelt, oder die Rahmenfarben verschieben sich (Kalibrierung `docs/frames-aab-bilderrahmen.md` §5).
- Treppige Kanten, Rauschen oder Flimmern beim Gehen.
- Die Decke wird überbelichtet oder bekommt einen hellen Schein um die Traversen (Fehler aus dem Spike).
- Die Bildrate auf einem Mittelklasse-Rechner fällt spürbar.

## Ansätze

| | Weg | Abwägung |
|---|---|---|
| **1 (gewählt)** | GTAO (three `ao()` + `denoise()`, TSL) nur auf WebGPU, bei „Mittel“ und „Hoch“ | eine Umsetzung. Wer im WebGL-Fallback landet, sieht nur Weg A. |
| 2 | Weg 1, dazu N8AO auf WebGL | beide Renderer gleich, aber zwei Umsetzungen, neue Abhängigkeit und R3F-Update |
| 3 | AO in Blender backen, GTAO nur für Stellwände | zur Laufzeit gratis, aber Blender-Arbeit und zwei Systeme, die gleich aussehen müssen |

## Design

1. **Qualitätsstufe:** `RenderQualitySettings` bekommt `ambientOcclusion: boolean`: `low` false, `medium` und `high` true. AO läuft nur, wenn diese Einstellung an ist und `isWebGPURenderer(gl)` gilt. Mit `?ao=0|1` lässt sich das zum Vergleichen übersteuern, ohne Oberfläche.
2. **Pipeline:** Aus dem Spike wird eine feste Komponente (z. B. `RoomAmbientOcclusion`) in `Scene`. Der TSL-Code bleibt in `webgpuSupport.ts`. Sie übernimmt das Rendern (`useFrame`, Priorität 1), solange sie an ist. Ist sie aus, rendert R3F wie heute.
3. **Kantenglättung:** Die Szene behält MSAA. GTAO bekommt einen eigenen Tiefen-Durchgang ohne Multisampling in halber Auflösung, aus dem auch die Normalen kommen. Erst wenn das nicht geht oder zu teuer ist, kommt FXAA/SMAA nach dem Komponieren in Frage.
4. **Tone Mapping:** Die Szenenfarbe muss genauso tone-gemappt aus dem Pass kommen wie ohne AO, auch die Decke und die RectAreaLight-Flächen. Ursache des Decken-Fehlers finden, beheben und mit einem Helligkeitsvergleich belegen.
5. **Bilder und Videos:** werden von der AO ausgenommen, Wand und Rahmen nicht. Wie, entscheidet der Umsetzer, z. B. über eine Maske per Layer.
6. **Werte:** Radius ≈ 0,6 m, Stärke ≈ 1, halbe Auflösung und 16 Samples als Start. Endgültig wird am Screenshot abgestimmt, als benannte Konstanten in einem kleinen Modul (z. B. `src/lib/ambientOcclusion.ts` mit Vitest für die reine Logik: Einstellung → an/aus, Parameter).
7. **Aus in:** 2D-Wandeditor (orthografische Kamera, unbeleuchtet), AR-Export-Seite, Screenshots/Offscreen-Renders (z. B. Glasreflexion), Mobile-Planungsansicht.
8. **Größe beim Größenändern / dpr:** Die Pipeline folgt Canvas-Größe und dpr. Beim Wechsel der Qualitätsstufe wird sie auf- bzw. abgebaut, ohne Neuladen.
9. **Bundle:** `tsl/display`-Addons bleiben im Chunk `vendor-three-webgpu` (`vite.config.ts`), sonst stürzt die Seite beim Laden ab („Class extends value undefined“).
10. **Prüfung auf dem Test-Stack:** nur dort, lokal wird nicht getestet. Headless Chrome über CDP, WebGPU, „Mittel“ und „Hoch“, vorher/nachher:
    - Raumecke in der Ich-Perspektive
    - Stellwand-Ende
    - Orbit-Ansicht
    - Decke (Helligkeit gemessen)
    - Foto nah
    - Aab-Weiß-Rahmen nah

    Dazu Bildrate mit und ohne AO, gemessen auf dem Rechner des Nutzers bzw. im Testbrowser, und `?renderer=webgl` unverändert.
11. **Doku:** Abschnitt in CLAUDE.md (Render Backends / Phase 7).

## Dem Umsetzer überlassen

- Wie Bilder ausgenommen werden.
- Ob der Tiefen-Durchgang ein eigener `pass()` mit Override-Material ist oder anders gebaut wird.
- Die genauen AO-Werte innerhalb der Anti-Ziele.
