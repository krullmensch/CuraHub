# Auswahl-Kontur und Wandmaße im 3D-Editor

Stand: 2026-09-29. Zwei Teile: (1) ausgewählte Werke im 3D klarer markieren, (2) Hängehöhe, Höhen über
Boden und Abstände aus dem 2D-Wand-Editor auch im 3D an den Wänden zeigen.

## Ziel und Rahmen

- **Problem Teil 1:** Die Auswahl ist schwer zu sehen. Bilder bekommen heute eine blaue Box mit 25 %
  Deckkraft (`SelectableInstance`), Modelle eine Emissive-Tönung plus dünnen Wireframe, Videos
  Emissive-Blau, Splats eine Box.
- **Problem Teil 2:** Maße, die man im 2D-Wand-Editor einschaltet, sind im 3D unsichtbar. Beim Blick auf
  den Raum fehlt die Hängehöhe und die Verbindung jedes Werks zum Boden.
- **Erfolg:** Ein ausgewähltes Werk ist aus jeder Distanz sofort erkennbar, ohne dass das Werk selbst
  eingefärbt wird. In der 3D-Orbitansicht stehen die eingeschalteten Maße an allen Wänden mit Werken und
  verschwinden, sobald eine Wand davor steht.

Nicht Teil davon: Maße in First-Person, im Grundriss (ortho) oder im öffentlichen Viewer; Wandmaße
(Breite/Höhe) im 3D; live mitlaufende Maße während eines 3D-Drags; Mehrfachauswahl im 3D.

---

## Teil 1 — Auswahl-Kontur

**Aussehen:** Blaue Kontur `#3b82f6` (`WE_COLORS.select`), ca. 2,5 px, konstante Bildschirmbreite
unabhängig von Entfernung und Zoom, immer über allem gezeichnet (kein Tiefentest).

- Bild/Video an der Wand: Rechteck um das Außenmaß. Gerahmte Bilder nehmen es aus
  `framedArtworkLayout` (Rahmen + Passepartout), alles andere aus den Mesh-Bounds wie
  `lib/wallEditor/footprint.ts`.
- 3D-Modell/Splat: die 12 Kanten der lokalen Bounding-Box.

**Entfällt:** Halo-Box in `SelectableInstance`, Emissive-Blau und Wireframe in `ModelInstance`,
Emissive-Blau der Auswahl in `VideoInstance`, Auswahl-Box in `SplatInstance` (die Lade-Box von
`SplatInstance` bleibt).

**Umsetzung:** Eine Komponente `SelectionOutline` (`src/components/SelectionOutline.tsx`), einmal im
Editor-Canvas statt pro Instanz.

1. Liest `selectedInstanceId` aus `editorStore`, holt die Gruppe aus `instanceRefMap`.
2. Berechnet die lokalen Ecken einmal bei Auswahlwechsel bzw. Änderung der Instanz.
3. Projiziert die Ecken in `useFrame` auf den Bildschirm und schreibt das `d`-Attribut eines SVG-Pfads
   über dem Canvas direkt (kein React-State pro Frame).

SVG statt 3D-Linien, weil es echte Pixelbreite hat und auf WebGPU und WebGL identisch läuft; drei
`<Line>` benutzt `ShaderMaterial`, das auf dem WebGPU-Pfad nicht erlaubt ist.

**Nicht aktiv:** bei offenem Wand-Editor (eigene Auswahl), in First-Person, im Viewer.

---

## Teil 2 — Wandmaße im 3D

### Umfang

| Anzeige | Toggle | 3D | 2D |
|---|---|---|---|
| Hängehöhe-Linie | `showHangingLine` | neu | unverändert |
| Höhen über Boden | `showFloorDistances` | neu | geändert: senkrechter Strich zum Boden |
| Abstände zwischen Werken | `showGaps` | neu | unverändert |

Sichtbar nur in der Editor-Ansicht `plannerViewMode === 'perspective'` bei geschlossenem Wand-Editor
(`phase === 'idle'`). An allen Wandflächen, auf denen mindestens ein Werk hängt — modulare Wände (jede
der vier Seiten) und Raumwände.

### Daten und Store

- Die drei Toggles bleiben in `wallEditorViewStore` — eine Quelle für 2D und 3D.
- **Persistenz** (Helfer in `lib/wallEditor/measureToggles.ts`, Zod-validiert): `toggle()` schreibt `showHangingLine`, `showFloorDistances`, `showGaps` als JSON nach
  localStorage (`curahub-wall-measures`); beim Start werden sie gelesen, mit try/catch und Fallback auf
  die Defaults wie `readHangingHeight`. Defaults unverändert (Hängehöhe an, Rest aus).
  `showRulers` und `snapping` bleiben unpersistiert.
- **Flächen sammeln:** neue pure Funktion
  `collectMeasuredFaces(instances, walls, roomFaces): WallFace[]` in `lib/wallEditor/annotations.ts`:
  1. pro Instanz `targetForInstance` → nach `targetKey` gruppieren,
  2. pro Gruppe `resolveFace` + `collectWallFace` (gleiche Rects wie im 2D, inkl. Rahmen/Passepartout),
  3. Flächen ohne Werke fallen weg, Werke ohne Fläche werden ignoriert.
- Aufruf per `useMemo` auf `localInstances`, `localWalls`, `roomFaces`, nur wenn mindestens ein Toggle
  an ist. Raumwände erscheinen, sobald `Satellit` sie veröffentlicht hat.
- 3D-Drags (Gizmo, `G`) ändern `localInstances` erst beim Loslassen; die Maße springen dann auf den
  neuen Stand.

### Geometrie

Neue Datei `src/lib/wallEditor/annotations.ts`, ohne Three.js:

```ts
faceAnnotations(face: WallFace, toggles: MeasureToggles, hangingHeight: number): {
    segments: AnnotationSegment[]; // u1, v1, u2, v2, width, color
    labels: AnnotationLabel[];     // u, v, text, color, textColor
}
floorLeaders(items: WallArtwork[], floorY: number): FloorLeader[]
```

Alles in Wandkoordinaten (`u` ab linker Kante, `v` Höhe über Boden). Formatierung mit `formatCm`.

- **Hängehöhe:** horizontal von `u = 0` bis Flächenbreite bei `v = bottom + hangingHeight`, gestrichelt
  (6 cm Strich, 4 cm Lücke). Label „Hängehöhe 150 cm“ am linken Ende. Farbe `WE_COLORS.hanging`,
  Text dunkel (`#1c1917`) wie im 2D. Liegt die Hängehöhe über der Fläche (größer als ihre Höhe),
  entfallen Linie und Label auf dieser Fläche.
- **Höhen über Boden (`floorLeaders`):** pro Werk senkrechte Linie mittig von der Unterkante des
  Außenmaßes bis zum Boden (`v = bottom`), kurze Querstriche an beiden Enden. Label
  „Mitte 148 cm“ (Bildmitte über Boden) auf halber Strecke. Pill-Farbe wie 2D
  (`rgba(24,24,27,0.85)`), Linie dunkel `#18181b` (`WE_COLORS.floor` ist halbtransparentes Weiß
  und wäre auf weißen Galeriewänden unsichtbar). Werke, deren Unterkante am oder unter dem Boden
  liegt, bekommen keinen Strich. Hängen zwei Werke übereinander, läuft der Strich
  des oberen hinter dem unteren durch.
- **Abstände:** `rowGaps(rects)` wie im 2D → horizontale Maßlinien mit Endstrichen, Label mittig,
  Farbe `WE_COLORS.spacing`.
- **Tiefe:** Linien 3 mm vor der Wand (Werke verdecken, was hinter ihnen liegt), Labels 2 cm davor.
- **Linienbreite:** 5 mm in Weltmaß (Quads).

### Rendering

Komponente `WallMeasurements3D` (`src/components/WallMeasurements3D.tsx`), einmal in der Editor-Szene;
gibt `null` zurück, wenn die Sichtbarkeitsbedingung oben nicht erfüllt ist.

- **Linien:** alle Segmente aller Flächen → eine zusammengeführte `BufferGeometry` pro Farbe (Quads in
  Wandkoordinaten, mit `worldToWallMatrix(face.frame)` invertiert in die Welt). Höchstens drei
  Draw-Calls. `useMemo`, alte Geometrie im Cleanup `dispose()`. Material `MeshBasicMaterial`,
  `toneMapped: false`, `depthWrite: false`, `polygonOffset`, leicht transparent.
- **Labels:** ein `THREE.Sprite` pro Label, `SpriteMaterial` mit `sizeAttenuation: false`,
  `depthTest: true`, `depthWrite: false`, hohe `renderOrder`. Die Textur ist eine Pill (abgerundet,
  Farben wie die 2D-`Pill`, Albert Sans, doppelte Auflösung) aus einem Canvas, gecacht pro
  Text + Farbe in `src/lib/measureLabelTextures.ts`, gezeichnet nach `document.fonts.ready`
  (danach `invalidate()`).
- **Größe:** `scale = px · 2 · tan(fov / 2) / viewportHeight`, neu berechnet bei Resize oder
  FOV-Änderung, nicht pro Frame.
- **Interaktion:** `raycast` auf Linien und Sprites ist leer — sie blockieren weder Werk-Klicks noch
  Doppelklicks auf Raumwände noch die Drop-Platzierung.
- Keine Arbeit in `useFrame`.
- Die Glasreflexion (`Satellit`) wird nur in der Ego-Perspektive aufgenommen, wo keine Maße gezeichnet
  werden — kein Ausblenden nötig.

### Bedienung

- **3D-Toolbar:** Button „Maße“ (Lucide `Ruler`) in der unteren Editor-Toolbar vor dem Zahnrad,
  gleicher Stil und Tooltip wie „Darstellung“, blau hinterlegt, wenn mindestens ein Toggle an ist.
  Popover mit:
  - „Hängehöhe anzeigen“, „Höhen über Boden anzeigen“, „Abstände zwischen Werken anzeigen“ — gleiche
    Labels und Icons wie `WallEditorChrome`,
  - Feld „Hängehöhe (Bildmitte über Boden)“ mit `CmInput` aus `WallEditorPanel` (dafür exportiert),
  - Hinweis „Nur in der 3D-Ansicht sichtbar“, wenn Grundriss oder First-Person aktiv ist.
- Eigene Datei `src/components/MeasurementsControl.tsx`. Button und Tooltip des Zahnrads werden in eine
  gemeinsame `ToolbarPopoverButton` ausgelagert und von beiden benutzt.
- **2D-Editor:** Bei „Höhen über Boden“ zeichnet `WallEditorOverlay` für nicht ausgewählte Werke statt
  der Pill auf der Bildmitte den Strich aus `floorLeaders` mit dem vorhandenen `MeasureLine`, Label auf
  halber Strecke. Die Maßkette der Auswahl (`FloorChain`) bleibt.

Alle neuen Texte auf Deutsch.

---

## Tests und Verifikation

- **Test-Runner:** `vitest` als devDependency, Skript `npm test` im Root.
- **Unit-Tests** (`src/lib/wallEditor/annotations.test.ts`, `src/store/wallEditorViewStore.test.ts`):
  - `collectMeasuredFaces`: Werke auf verschiedenen Seiten einer modularen Wand und auf einer Raumwand
    werden richtig gruppiert; leere Flächen fehlen; Werk ohne Fläche wird ignoriert.
  - `faceAnnotations`: ausgeschalteter Toggle → keine Elemente dieser Art; Hängehöhe liegt bei
    `bottom + hangingHeight`, Striche decken die Breite ab.
  - `floorLeaders`: Linie von Unterkante bis Boden, Wert = Bildmitte über Boden, Label auf halber
    Strecke.
  - Abstände entsprechen `rowGaps`.
  - Persistenz: `toggle` schreibt localStorage; fehlender oder kaputter Wert → Defaults.
- **Visuell** mit Headless-Chrome über CDP (`--headless=new --enable-unsafe-webgpu`), jeweils WebGPU
  und `?renderer=webgl`:
  - Kontur an gerahmtem Bild, Video und Modell, nah und fern.
  - Orbit mit allen drei Toggles; Kamera hinter einer modularen Wand → Maße der verdeckten Fläche weg.
  - Grundriss und First-Person → keine Maße.
  - 2D-Editor → Strich zum Boden mit Label auf halber Höhe.
  - Klick auf ein Werk durch ein Label hindurch wählt das Werk aus.
- **Abschluss:** `npm run lint`, `npm run build`, `npm test`.
