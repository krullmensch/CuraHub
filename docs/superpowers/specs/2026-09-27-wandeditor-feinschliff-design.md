# 2D-Wandeditor: Feinschliff — Design Spec
**Datum:** 2026-09-27
**Status:** Freigegeben (Design), Spec in Review

Teil 1 von 3. Die anderen beiden bekommen eigene Specs:
2. Maßstabsfigur (schwarz, Lowpoly, 1,73 m)
3. Maße aus dem 2D-Wandeditor im 3D-Raum (ohne Überschneidungen, mit Maßhilfslinien)

---

## Überblick

Vier Änderungen am 2D-Wandeditor (`src/components/wall-editor/`, `src/lib/wallEditor/`, `src/store/wallEditorViewStore.ts`):

1. **Hängehöhe** pro Ausstellungsversion in der DB, Standard **145 cm**, einstellbar per Feld und durch Ziehen der Hängelinie.
2. **Hilfslinien** richtig herum: oberes Lineal → waagrechte Linie, linkes Lineal → senkrechte Linie. Pro Wandseite in der DB gespeichert.
3. **Tab „Linien"** im rechten Panel zum Verwalten der Hilfslinien (anlegen, Wert eintippen, Richtung wechseln, löschen, ein-/ausblenden, sperren, Wandmitte, alle löschen).
4. **Tab „Werk"** im rechten Panel mit den Eigenschaften der ausgewählten Werke (Größe, Rahmen, Passepartout, Monitor/Beamer) und **Skalieren** per `S`, Eck-Griffen, Feldern und ±5 %-Knöpfen.

### Ist-Stand (vor dieser Änderung)

- Hängehöhe: `wallEditorViewStore.hangingHeight`, Standard 1,5 m, nur in localStorage (`curahub-hanging-height`). Feld im Panel-Abschnitt „Hängung".
- Hilfslinien: `guides: RulerGuide[]` mit `axis: 'x' | 'y'` (`'x'` = senkrechte Linie bei `u`). Das obere Lineal erzeugt `'x'`, also eine senkrechte Linie. `resetForWall()` löscht sie beim Wandwechsel, nichts wird gespeichert.
- Rechtes Panel: Bei offenem Editor ersetzt `WallEditorPanel` das `PropertiesPanel` vollständig. `selectedInstanceId` ist im Editor null, Rahmen/Passepartout/Größe sind nicht erreichbar.
- Tastatur: `EditorPage` ignoriert bei offenem Editor alles außer Undo/Redo; das Overlay kennt kein Skalieren.

---

## 1. Datenmodell & Sync

### Prisma (`server/prisma/schema.prisma`, Modell `ExhibitionVersion`)

```prisma
hanging_height Float @default(1.45)   // Bildmitte über Boden, Meter
wall_guides    Json?                  // { [faceKey]: { axis: 'h' | 'v', value: number }[] }
```

- Migration setzt bestehende Versionen auf 1,45.
- `faceKey` ist der bestehende `targetKey()` aus `src/lib/wallEditor/faces.ts`: `wall:<wallId>:<side>` oder die Raumwand-ID `room:<key>:<idx>`.
- `axis: 'h'` = waagrechte Linie, `value` = Meter über der Unterkante der Wandseite (`wallRect.y`).
- `axis: 'v'` = senkrechte Linie, `value` = Meter ab der linken Kante der Wandseite (`wallRect.x`).
- Werte sind relativ zur Wandseite gespeichert, damit Anzeige, Menü und DB dieselbe Zahl zeigen.

### Server

Neue reine Funktionen in `server/src/lib/wallGuides.ts`:

- `wallGuidesSchema` (Zod): Keys als String, pro Key höchstens 200 Linien, `axis ∈ {'h','v'}`, `value` endlich und 0–100 m.
- `hangingHeightSchema`: 0,01–9,99 m.
- `guidesToIndexKeys(guides, wallIdToIndex)`: `wall:<id>:<side>` → `wallIndex:<i>:<side>`. Keys unbekannter Wände fallen weg, Raum-Keys bleiben unverändert.
- `guidesFromIndexKeys(guides, newWallIds)`: `wallIndex:<i>:<side>` → `wall:<neueId>:<side>`.
- `dropWallGuides(guides, wallId)`: entfernt alle `wall:<wallId>:*`.

Routen:

| Methode | Pfad | Änderung |
|---|---|---|
| `PATCH` | `/exhibitions/:eid/versions/:vid/wall-layout` | **neu.** Body `{ hangingHeight?: number, guides?: WallGuides }`, ersetzt die übergebenen Felder vollständig. Rechteprüfung wie bei Instanz-Änderungen. |
| `GET` | `/exhibitions/:eid/versions/:vid` | liefert `hanging_height` und `wall_guides` mit |
| `POST` | `/exhibitions/:eid/versions` | Body bekommt optional `hangingHeight` und `wallGuides`. Der Client schickt die Guides schon mit `wallIndex:`-Keys (gleiche Reihenfolge wie `wallIndex` der Instanzen), der Server wandelt sie mit `guidesFromIndexKeys` um. Im Deep-Copy-Zweig (ohne Client-Daten) kopiert der Server `hanging_height` und wandelt `wall_guides` über das vorhandene `oldWallIdToIndex` → Index → neue IDs um. |
| `POST` | `/exhibitions/:eid/versions/:vid/merge` | wie Deep-Copy: Hängehöhe kopieren, Keys umschreiben |
| `DELETE` | `/walls/:id` | `dropWallGuides` auf `wall_guides` der Version anwenden |

### Client

`wallEditorViewStore`:

- `hangingHeight` Standard 1,45; der localStorage-Key `curahub-hanging-height` entfällt.
- `guides: RulerGuide[]` wird ersetzt durch `guidesByFace: Record<string, RulerGuide[]>`; die Guides der offenen Seite kommen über einen Selektor (`guidesOf(faceKey)`).
- `RulerGuide.axis` wird `'h' | 'v'`, `value` relativ zur Wandseite (siehe oben). Das Overlay rechnet für Zeichnen und Einrasten in Wandkoordinaten um (`u = wallRect.x + value` bzw. `v = wallRect.y + value`).
- `resetForWall()` löscht nur noch Messungen.
- Neu: `loadWallLayout({ hangingHeight, guides })` beim Laden bzw. Wechsel der Version (aus der GET-Antwort, im Client mit Zod geprüft).

Speichern: `subscribe` auf `hangingHeight` und `guidesByFace` außerhalb von React, 300 ms Debounce, dann `PATCH …/wall-layout` mit dem vollständigen Stand. Die Speicherfunktion schreibt nur und löst keine Store-Aktionen aus (Regel aus Bug 1). Beim Laden einer Version wird der Subscriber übersprungen, damit das Laden keinen PATCH auslöst.

Undo: Hilfslinien und Hängehöhe sind **nicht** im Instanz-Undo-Stack. „Alle löschen" zeigt einen Toast mit „Rückgängig", der die vorherige Liste wiederherstellt.

---

## 2. Hilfslinien & Hängelinie im Canvas

### Lineale (`WallEditorRulers.tsx`, `WallEditorOverlay.tsx`)

- Ziehen aus dem oberen Lineal legt eine **waagrechte** Linie (`'h'`) an, aus dem linken eine **senkrechte** (`'v'`). Die Cursor (`row-resize` oben, `col-resize` links) passen schon.
- Marker: waagrechte Linie → Dreieck im linken Lineal auf ihrer Höhe, senkrechte → im oberen Lineal.
- Eine Linie zurück aufs Lineal gezogen wird gelöscht (wie bisher; nicht bei gesperrten Linien).
- Einrasten der Linien an Werkkanten/Wandmitte und das Einrasten der Werke an Linien bleiben wie bisher.

### Ausblenden / Sperren

Pro Browser in localStorage (`curahub-wall-guides-view`: `{ hidden, locked }`), da es Ansichtssache ist.

- **Ausgeblendet:** Linien werden nicht gezeichnet, Werke rasten nicht an ihnen ein. Ziehen aus einem Lineal blendet sie wieder ein.
- **Gesperrt:** vorhandene Hilfslinien und die Hängelinie sind im Canvas nicht greifbar (kein Hover, kein Ziehen). Neue Linien aus dem Lineal und Eingaben im Menü funktionieren weiter.

### Hängelinie ziehbar

- Im Auswahl-Werkzeug trifft die gestrichelte Hängelinie mit ±4 px; Cursor `row-resize`.
- Beim Ziehen: Pill „Hängehöhe 145,0 cm", Einrasten auf 1 cm, Alt = frei auf 1 mm, Esc bricht ab.
- Loslassen → `setHangingHeight` → Auto-Sync.
- Werke bewegen sich dabei nicht. Dafür bleiben „Mitten auf Linie" / „Gruppe auf Linie".
- Treffer-Priorität bei Überlagerung: Werk > Hängelinie > Hilfslinie.

---

## 3. Panel: Tabs „Anordnen | Werk | Linien"

`WallEditorPanel` bekommt unter der blauen Kopfzeile drei Tabs. Der aktive Tab liegt in `wallEditorViewStore.panelTab` (nicht gespeichert).

- **Anordnen:** heutiger Inhalt (Auswahl, Ausrichten, Abstände, Position, Hängung, Tastenkürzel, Entfernen).
- **Werk:** siehe Abschnitt 4.
- **Linien:** siehe unten.

Automatischer Wechsel: Geht die Auswahl von leer auf nicht leer, springt der Tab auf „Werk", solange in dieser Editor-Sitzung noch kein Tab von Hand gewählt wurde (`panelTabPinned`, beim Öffnen des Editors zurückgesetzt).

### Tab „Linien" (`WallEditorGuidesTab.tsx`)

- **Kopfzeile:** 👁 ein/aus · 🔒 sperren · 🗑 alle löschen (Toast mit „Rückgängig").
- **Anlegen:** „+ Waagrecht", „+ Senkrecht", „Wandmitte".
  - Neue Linien starten in der Mitte des sichtbaren Ausschnitts, auf cm gerundet und auf die Wandseite begrenzt; ihr Feld bekommt sofort den Fokus.
  - „Wandmitte" legt eine senkrechte Linie auf halbe Wandbreite an; existiert dort schon eine (±0,5 mm), passiert nichts.
- **Liste:** zuerst waagrechte (oben → unten), dann senkrechte (links → rechts). Pro Zeile:
  - Symbol ― bzw. │
  - `CmInput` (akzeptiert „152,5"; waagrecht = cm über Boden, senkrecht = cm ab linker Kante)
  - ⇄ Richtung wechseln (Wert bleibt, auf das Wandmaß der neuen Richtung begrenzt)
  - 🗑 löschen
- Hover über einer Zeile hebt die Linie im Canvas hervor (`hoverGuideId` wandert vom Overlay-State in den Store).
- Leere Liste: kurzer Hinweis „Aus dem Lineal ziehen oder hier anlegen."

### Tastenkürzel-Liste

Einträge anpassen bzw. ergänzen: „Lineal oben ziehen → waagrechte Hilfslinie", „Lineal links ziehen → senkrechte Hilfslinie", „S → Skalieren", „Hängelinie ziehen → Hängehöhe".

---

## 4. Tab „Werk" & Skalieren

### Vorbereitendes Refactoring

Nötig, weil `PropertiesPanel` an `selectedInstanceId` hängt, das im Editor null ist. Nur verschieben, kein Verhalten ändern:

- `FrameControls` (samt `PassepartoutValue`, `passepartoutOf`, `finishSwatch`) → `src/components/properties/FrameControls.tsx`.
- Berechnung von `baseCm` → reine Funktion `artworkBaseCm(inst, modelSize?)` in `src/lib/artworkSize.ts`.
- `PropertiesPanel` importiert beides und verhält sich wie vorher.

### Tab „Werk" (`WallEditorArtworkTab.tsx`)

Arbeitet auf `wallEditorSelection`. Jede Aktion ist ein `commitLocalChange` (ein Undo-Schritt), Auto-Sync patcht.

**Einzelauswahl**
- Titel, Künstler:in, Jahr
- Breite × Höhe in cm (Bildmaß ohne Rahmen) mit Seitenverhältnis-Schloss, Standard an
- „Außenmaß mit Rahmen" nur zur Anzeige (aus `framedArtworkLayout`)
- Knöpfe −5 % / +5 %
- Bilder: `FrameControls` (Rahmen, Passepartout)
- Videos: Auswahl Monitor/Beamer. Monitor nicht skalierbar (Felder und Knöpfe deaktiviert), Beamer immer mit festem Seitenverhältnis

**Mehrfachauswahl**
- Rahmen, Passepartout und ±5 % wirken auf alle Bilder der Auswahl; Videos werden übersprungen (Hinweis „gilt für N Bilder").
- Unterschiedliche Werte zeigen „Gemischt".
- Breite × Höhe ausgeblendet.

**Ohne Auswahl:** Hinweis „Wähle ein Werk aus."

Rahmen- und Passepartout-Wahl setzen wie im 3D auch `defaultFrameStyle` / `defaultPassepartout`.

### Skalieren im Canvas

Reine Mathematik in `src/lib/wallEditor/scale.ts`, Interaktion im Overlay (neue `Interaction`-Art `'scale'`).

- **Anker:** immer die Bildmitte (Instanzposition), damit das Werk auf der Hängelinie bleibt. Bei Mehrfachauswahl skaliert jedes Werk mit demselben Faktor um seine eigene Mitte.
- **`S` (modal wie im 3D):**
  - Faktor = Abstand Maus ↔ Mitte der Auswahlbox / Abstand beim Start; ⇧ = fein (Änderung ×0,1)
  - Einrasten: Bildbreite des zuerst ausgewählten Werks (erstes Element von `wallEditorSelection`) auf ganze cm; ⌘/Strg kehrt das Einrasten um (wie beim Verschieben)
  - Klick oder Enter bestätigt, Esc oder Rechtsklick bricht ab
  - `EditorPage` lässt `S` bei offenem Editor weiterhin unbehandelt; das Overlay verarbeitet es.
- **Eck-Griffe** an der Auswahlbox, nur im Auswahl-Werkzeug und nur wenn mindestens ein skalierbares Werk gewählt ist:
  - Ziehen skaliert um die Mitte (Faktor aus der Projektion auf die Diagonale).
  - Alt bei Einzelauswahl: gegenüberliegende Ecke bleibt fest (Mitte wandert mit).
- **Vorschau:** Während der Geste zeichnet das Overlay live den neuen Umriss (inkl. Rahmen) und eine Pill „60,0 × 80,0 cm · 112 %". Die 3D-Objekte werden erst beim Loslassen aktualisiert, mit einem einzigen Commit. Grund: Die Rahmenprofile entstehen aus den Instanzdaten (`framedArtworkLayout`); eine direkt skalierte Three.js-Gruppe würde die Profilbreite mit verzerren.
- **Grenzen:** Bildkante mindestens 1 cm, Faktor > 0. Boden-Clamp wie im 3D (`artworkMinY`). Die Warnungen „außerhalb der Wand" und „Überlappung" werden mit dem Vorschau-Umriss live berechnet.
- Monitore werden bei `S`, Griffen und ±5 % übersprungen; besteht die Auswahl nur aus Monitoren, passiert nichts.

---

## 5. Fehlerfälle

- **PATCH fehlgeschlagen:** Toast „Hängehöhe/Hilfslinien konnten nicht gespeichert werden". Der lokale Stand bleibt; die nächste Änderung sendet ohnehin den vollständigen Stand.
- **403 (kein Schreibrecht):** kein Toast, Änderungen bleiben lokal.
- **Ungültiges `wall_guides` aus der DB:** Zod im Client → leere Liste plus `console.warn`, kein Absturz.
- **Keys ohne passende Seite** (Wand gelöscht, Raummodell geändert): werden ignoriert und bleiben in der DB unangetastet; Wand-Löschen räumt serverseitig auf.
- **Skalieren:** Faktor ≤ 0 oder Bild < 1 cm wird begrenzt.

---

## 6. Tests & Verifikation

**Server (Jest):** `server/src/tests/wallGuides.test.ts`
- `guidesToIndexKeys` / `guidesFromIndexKeys`: Round-Trip, Raum-Keys unverändert, unbekannte Wände fallen weg
- `dropWallGuides`
- Zod-Schemas: Grenzen, maximal 200 Linien, falsche Achse

**Client (Vitest, neu):** Dev-Dependency `vitest`, Skript `npm run test` im Root, Tests neben der Logik in `src/lib/`.
- `src/lib/wallEditor/scale.test.ts`: Faktor aus Mausweg, Mitte bleibt fest, Alt-Ecke, cm-Einrasten, Untergrenze
- `src/lib/wallEditor/guides.test.ts`: Umrechnung Hilfslinie ↔ Wandkoordinaten, Sortierung, Richtung wechseln mit Begrenzung, Wandmitte ohne Duplikat

**Verifikation vor Abschluss:**
- `npm run build`, `npm run lint`, `npm run test`, `cd server && npm test`
- Migration lokal anwenden (`npx prisma migrate dev`)
- 2D-Editor im Browser-Pane durchgehen: Lineal-Richtungen, Tab „Linien" (alle Aktionen), Hängelinie ziehen, `S` und Griffe (einzeln, mehrfach, Alt), Tab „Werk" (einzeln, mehrfach, Video), Neuladen → Linien und Hängehöhe noch da, Version speichern → Linien in der neuen Version an den richtigen Wänden
- Rendern nach dem Skalier-Commit per headless Chrome prüfen (Browser-Panes laufen ohne rAF)

---

## Nicht in diesem Teil

- Maße im 3D-Raum (Teil 3), Maßstabsfigur (Teil 2)
- Hängehöhe pro Wand
- Undo/Redo für Hilfslinien im Instanz-Stack
- Hilfslinien im Viewer
