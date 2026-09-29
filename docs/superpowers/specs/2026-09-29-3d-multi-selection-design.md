# Mehrfachauswahl im 3D-Editor — Design

Stand: 2026-09-29. Vorbild ist die Mehrfachauswahl des 2D-Wandeditors (`wallEditorSelection`,
`src/components/wall-editor/`, `src/lib/wallEditor/operations.ts`).

## Ziel

Kuratorinnen und Kuratoren sollen im 3D-Editor (Perspektive) mehrere Werke gleichzeitig auswählen
und gemeinsam bearbeiten können:

- gemeinsam verschieben und drehen (Gizmo und Blender-Tasten G/R/S),
- gemeinsam löschen und duplizieren,
- Eigenschaften gemeinsam ändern (Rahmen, Passepartout, Größe),
- ausrichten und verteilen (Höhe, Weltachsen).

Erfolg: Eine Werkgruppe lässt sich mit einem Handgriff auswählen, als starre Gruppe bewegen, und
jede Gruppenaktion ist genau ein Undo-Schritt.

## Umfang

Drin:

- Nur **Werke** (Bilder, Videos, 3D-Modelle, Splats). Wände und Sperrzonen bleiben einzeln
  auswählbar; eine Wand oder Zone auszuwählen leert die Werkauswahl (wie heute).
- Auswahl per ⇧-Klick, ⇧-Ziehen (Auswahlrahmen), Cmd/Strg+A und über eine Werkliste „Im Raum“.
- Drehen/Skalieren einer Gruppe um die **Gruppenmitte** (siehe Abschnitt 3).
- Übergabe der Auswahl zwischen 3D- und 2D-Editor.
- Duplizieren (Cmd/Strg+D) — neu, gilt auch für ein einzelnes Werk.

Nicht drin:

- Wände/Zonen in der Mehrfachauswahl, umschaltbarer Pivot,
- Ausrichten entlang einer Wand im 3D-Editor (bleibt Aufgabe des 2D-Editors),
- Hover-Hervorhebung aus der Liste, dauerhaftes „Gruppieren“.

## 1. Auswahl-Modell (`src/store/editorStore.ts`)

- Neu: `selectedInstanceIds: number[]`.
- `selectedInstanceId` bleibt bestehen und ist das **primäre** Werk: das zuletzt angeklickte bzw.
  hinzugefügte. Invariante: `selectedInstanceId === null` genau dann, wenn
  `selectedInstanceIds.length === 0`, sonst `selectedInstanceIds.includes(selectedInstanceId)`.
- Beide Felder werden nur über `setInstanceSelection(ids: number[], primary?: number)` gesetzt
  (`primary` fehlt → letztes Element von `ids`). Dazu `toggleInstanceInSelection(id)`.
- `selectInstance(id)` bleibt und ruft `setInstanceSelection(id === null ? [] : [id])`. Alle
  heutigen Aufrufer funktionieren dadurch unverändert.
- Jede Stelle, die heute `selectedInstanceId: null` setzt (Projekt-/Versionswechsel,
  `selectWall`, `selectZone`, Löschen, `openWallEditor`), leert auch `selectedInstanceIds`.
- Auto-Sync: Wird eine Temp-ID durch die echte ID ersetzt (heute Z. ~914), wird sie auch in
  `selectedInstanceIds` ersetzt — wie bei `wallEditorSelection`.
- Einzelobjekt-Konsumenten (Video-Steuerung im Panel, „Wand öffnen“-Button, Monitor-Prüfung,
  Textur-`forceMax`) lesen weiter `selectedInstanceId`. Gruppenrelevante Konsumenten (Gizmo,
  G/R/S, Entf, Panel, Hervorhebung, Toolbar-Aktivierung) lesen `selectedInstanceIds`.

## 2. Eingabe

| Geste | Wirkung |
|---|---|
| Klick auf Werk | Auswahl = nur dieses Werk (unverändert) |
| ⇧-Klick auf Werk | Werk hinzufügen/entfernen; ein hinzugefügtes wird primär |
| ⇧-Ziehen ≥ 4 px | Auswahlrahmen, ergänzt die bestehende Auswahl |
| Cmd/Strg+A | alle Werke der aktiven Version |
| Esc / Klick ins Leere | alles abwählen (unverändert) |

Auswahlrahmen (`SelectionMarquee`, DOM-Overlay über dem Canvas):

- Solange ⇧ gedrückt ist, sind die OrbitControls deaktiviert (heute verschiebt ⇧-Linksziehen die
  Kamera; Verschieben bleibt per Rechtsziehen möglich).
- Treffer: die Welt-Bounding-Box jedes Werks wird auf den Bildschirm projiziert; getroffen ist ein
  Werk, dessen projiziertes Rechteck den Rahmen schneidet.
- Ausgeschlossen sind Werke hinter der Kamera und **verdeckte** Werke: Ein Strahl von der Kamera
  zur Werkmitte, der vorher eine Wand oder das Raum-Mesh trifft (BVH vorhanden), schließt das Werk
  aus. Gewählt wird, was man sieht.
- Ausgeblendete Werke (2D-Editor offen) sind nie Treffer.

Hervorhebung: `InstanceSlot` (`PlacedArtworks.tsx`) liest `selectedInstanceIds.includes(id)`;
das primäre Werk sieht im 3D gleich aus. `forceMax` der Artwork-Textur bleibt beim primären Werk,
damit Cmd+A nicht alle Bilder in voller Auflösung lädt.

Toolbar und Tasten (`EditorPage.tsx`):

- G/R/X/Y/Z, Entf/Backspace und Toolbar-Buttons sind aktiv bei `selectedInstanceIds.length > 0`.
- S und der Skalieren-Button sind gesperrt, sobald **irgendein** Werk der Auswahl ein Monitor ist.
- E öffnet den 2D-Editor nur, wenn alle ausgewählten Werke auf derselben Fläche liegen.

## 3. Gruppen-Transform

Reine Funktionen in `src/lib/selectionTransform.ts`:

- `selectionPivot(boxes)` — Mitte der gemeinsamen Welt-Bounding-Box.
- `applyGroupDelta(start, pivotStart, pivotNow, mode)` — neue Welt-Matrix eines Werks:
  - `translate`: Positionsdelta des Pivots,
  - `rotate`: Rotation um den Pivot; Position und Ausrichtung jedes Werks drehen mit, die
    Anordnung bleibt starr,
  - `scale`: der Skalierfaktor des Pivots multipliziert die Skalierung jedes Werks um dessen
    eigene Mitte; Positionen bleiben (sonst wanderten Bilder aus der Wand).
- `clampGroupToFloor(...)` — begrenzt das Y-Delta, sodass das tiefste Werk nicht unter den Boden
  geht; die Gruppe bleibt starr.
- `finalizeInstanceTransform(inst, object, mode, walls)` — Boden-Clamp und Wand-Ablöse-Check für
  **ein** Werk. Heute inline in `InstanceTransformControls.handleMouseUp` und
  `commitActiveObjectTransform`; beide nutzen künftig diese Funktion, der Gruppenpfad auch.

Komponente `SelectionPivot` (gemountet bei > 1 ausgewähltem Werk):

- Unsichtbares `Object3D` in der Gruppenmitte; wird neu gesetzt, wenn sich die Auswahl ändert
  und kein Transform läuft.
- Transform-Start (Gizmo-mousedown oder G/R/S): Startmatrizen aller Werkgruppen und des Pivots
  merken.
- Pro Frame während des Transforms: `applyGroupDelta` direkt auf die Three.js-Gruppen aus
  `instanceRefMap`, dann `invalidate()`. Kein Store-Update pro Frame (Muster wie `applyDraft`
  im 2D-Editor).

Anbindung:

- `InstanceTransformControls`: bei einem Werk unverändert; bei mehreren hängt das Gizmo am
  Pivot. Der Live-Readout im Panel zeigt die Pivot-Werte.
- `ModalTransformSystem`: bei mehreren Werken ist `activeObjectRef` der Pivot. Linksklick
  bestätigt, Rechtsklick/Esc setzt alle Startmatrizen zurück.
- Commit: ein einziges `commitLocalChange` mit allen geänderten Werken → ein Undo-Schritt;
  der Auto-Sync-Diff PATCHt nur geänderte Werke.

## 4. Panel für mehrere Werke

Neue Komponente `MultiSelectionPanel`, von `PropertiesPanel` bei `selectedInstanceIds.length > 1`
statt des Einzelpanels gerendert.

- Kopf „N Werke ausgewählt“ mit Titel-Liste (primäres hervorgehoben). Klick = nur dieses Werk
  auswählen, ⇧/Cmd-Klick = aus der Auswahl entfernen.
- **Ausrichten**
  - Höhe: Unterkante / Mitte / Oberkante angleichen; Ziel ist der Wert des primären Werks.
    Zahlenfeld „Mittelhöhe (cm)“ setzt alle Mitten auf einen festen Wert.
  - Weltachsen X und Z: min / Mitte / max angleichen.
  - Verteilen entlang X oder Z: gleiche Abstände, die beiden äußeren Werke bleiben stehen;
    ab 3 Werken aktiv.
  - Maße: `artworkFrameLayout` (Rahmen und Passepartout zählen mit) bzw. Mesh-Bounds bei
    3D-Modellen und Splats — dieselbe Quelle wie der 2D-Editor-Footprint.
  - Verschiebt X/Z-Ausrichten ein Werk von seiner Wand weg, löst es sich über den bestehenden
    Wand-Ablöse-Check. Höhe angleichen ist immer wandsicher.
- **Rahmen & Passepartout**: nur sichtbar, wenn die Auswahl Bilder enthält; wirkt nur auf die
  Bilder. Verschiedene Werte → „Gemischt“; eine Änderung setzt den Wert für alle Bilder. Die
  Profil-/Farb-/Passepartout-Controls werden aus dem Einzelpanel in eigene Komponenten gezogen
  und in beiden Panels genutzt.
- **Größe**: gemeinsamer Faktor in % (absolute cm sind bei gemischten Formaten sinnlos).
- Position/Rotation-Felder und Video-Wiedergabe sind ausgeblendet.
- **Aktionen**: Duplizieren, Löschen, „Im 2D-Editor öffnen“ (nur wenn alle auf einer Fläche).

Reine Logik in `src/lib/selectionOperations.ts`: `alignHeight`, `alignAxis`, `distributeAxis`,
`scaleSelection`, `setSelectionFrame`, `duplicateSelection`. Jede nimmt `localInstances` und gibt
neue zurück; jede Aktion ist ein `commitLocalChange`.

Löschen: Entf/Backspace und Button löschen alle ausgewählten Werke in einem Commit.
`deleteSelectedInstance` arbeitet auf dem Array (Name bleibt, Konsumenten unverändert).

Duplizieren (Cmd/Strg+D und Button):

- Kopien bekommen Temp-IDs aus `nextTempId()` (wie platzierte Werke, `EditorPage.tsx`) und
  werden über den bestehenden Auto-Sync-POST-Pfad angelegt; dessen Idempotency-Keys verhindern
  doppelte Zeilen (CLAUDE.md, Bug 1).
- Versatz: die ganze Gruppe um (Breite der Gruppe + 10 cm) nach rechts, bezogen auf die
  Blickrichtung des primären Werks; Bilder bleiben so an ihrer Wand. Liegt eine Kopie außerhalb
  der Wand, greift der Wand-Ablöse-Check.
- Danach sind die Kopien ausgewählt (sofort mit G verschiebbar).

## 5. Werkliste „Im Raum“

- `AssetSidebar` bekommt oben einen Umschalter **Assets | Im Raum** (zwei Buttons; letzte Wahl in
  `localStorage`, Zugriff in try/catch).
- Neue Komponente `PlacedArtworkList`: eine Zeile pro Werk der aktiven Version mit Thumbnail,
  Titel, Typ-Icon und Ort („Wand 3 · Vorderseite“, „Raumwand“, „frei im Raum“).
- Gruppiert nach Fläche (`targetForInstance` / `instanceOnFace`), Gruppen einklappbar. Klick auf
  den Gruppenkopf wählt alle Werke dieser Fläche.
- Auswahl wie im Finder: Klick = nur dieses Werk, Cmd/Strg-Klick = umschalten, ⇧-Klick = Bereich
  vom primären Werk bis hier (in Listenreihenfolge).
- Die Liste spiegelt die Auswahl (markiert, primäres fett) und scrollt das primäre Werk in Sicht.
- Doppelklick fliegt die Kamera zum Werk, falls `cameraTransition.ts` das ohne Umbau hergibt;
  sonst entfällt es.

## 6. Übergabe 2D ↔ 3D

- 2D-Editor öffnen (E, Doppelklick, Panel-Button): die ausgewählten Werke, die auf der geöffneten
  Fläche liegen (`instanceOnFace`), werden zur `wallEditorSelection`.
- 2D-Editor schließen: `wallEditorSelection` wird zu `selectedInstanceIds` (primär = letztes
  Element).
- Während der 2D-Editor offen ist, bleibt `selectedInstanceId` wie heute `null`.

## 7. Tests

- Neue devDependency `vitest`, Script `npm test`, nur für reine Module:
  - `selectionTransform`: Verschieben, Drehen um den Pivot, Skalieren um eigene Mitten,
    Boden-Clamp der Gruppe.
  - `selectionOperations`: Höhe angleichen (inkl. Rahmen-/Passepartout-Maße), Achsen ausrichten,
    Verteilen, Rahmen setzen (nur Bilder), Duplizieren-Versatz.
  - Store-Invarianten: Primär ∈ Auswahl, Leeren bei Versions-/Projektwechsel und bei
    `selectWall`/`selectZone`, Temp-ID-Ersatz.
- Manuell über Headless-Chrome (CDP), weil Browser-Panes von Agents versteckt laufen: ⇧-Klick,
  ⇧-Rahmen inkl. verdeckter Werke, Cmd+A, Gruppe per Gizmo und G/R/S, Abbruch per Rechtsklick,
  Undo = ein Schritt, 2D↔3D-Übergabe, First-Person-Modus unberührt.
- `npm run lint` und `npm run build` ohne neue Fehler in geänderten Dateien.

## Reihenfolge

Jede Stufe ist für sich lauffähig:

1. Store + ⇧-Klick + Cmd+A + Hervorhebung + Entf
2. Gruppen-Transform (Gizmo und G/R/S)
3. Auswahlrahmen per ⇧-Ziehen
4. `MultiSelectionPanel`: Rahmen, Größe, Löschen, Duplizieren
5. Ausrichten/Verteilen
6. Werkliste „Im Raum“
7. Übergabe 2D ↔ 3D
