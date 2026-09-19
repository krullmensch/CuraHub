# Rahmen von Max Aab (aab-bilderrahmen.com) + Custom Frame

Stand: 2026-09-19. Recherche auf https://www.aab-bilderrahmen.com (Produktseiten, Querschnittsfotos,
Farbmuster, Passepartout-Seiten, FAQ). Grundlage ist das HALBE-System, siehe CLAUDE.md →
"Picture Frames & Passepartouts" und `src/lib/frameStyles.ts`.

**Umsetzungsstand**
- **Umgesetzt (2026-09-19):** die vier Aab-Profile inkl. Objektrahmen 111 mit weißer Innenleiste, alle
  13 Farben mit Verfügbarkeit je Profil, neue Holzarten + Lackoberfläche, Hersteller-Ebene im Panel,
  Formathinweis, Server-Validierung, kalibrierte Farben (Abschnitt 5).
- **Offen:** farbige Aab-Passepartouts (Abschnitt 4), Glas (6.3), Custom Frame (7).

## 1. Hersteller

- Max Aab Bilderrahmen, Würmstraße 43, 75181 Pforzheim. Familienunternehmen, eigene Fertigung.
- Nur **Massivholz**. Vier Profile, alle als Wechselrahmen: Glas (2 mm), Rückwand und Andruckfedern
  werden mitgeliefert. Formatangaben beziehen sich immer auf das **Bildmaß**, wie bei uns.
- Ecken mit **45°-Gehrung** (Farbmuster zeigen das deutlich), also passt die vorhandene Geometrie
  (`frameProfileGeometry.ts`: Eckstück + gestreckte Kante).
- Maßanfertigung: jedes Maß bis 70 × 100 cm mit Normalglas, bis 80 × 110 cm mit Acrylglas.
  Mindestmenge 3 Stück bei lackiert/lasiert, 1 Stück bei Natur-/Edelholz, ca. 14 Werktage.
- Lackierte und lasierte Rahmen sind aus wechselnden Naturhölzern gefertigt; die Holzart ist nicht
  festgelegt (FAQ). In den Mustern sieht man bei Schwarz, Anthrazit und Weiß lasiert trotzdem offene
  Poren (eschenartig).

## 2. Profile

Maße aus den bemaßten Querschnittsfotos (`/media/image/product/<id>/lg/bilderrahmen-profil<nr>~4.webp`)
und den Produkttexten ("Aufsichtsbreite", "Glasauflage im Falz").

| Profil | Aufsicht | Tiefe | Körper hinten | Falztiefe | Lippe (vorn) | Glasauflage | Formate (Bildmaß) | Hinweis |
|---|---|---|---|---|---|---|---|---|
| **116** | 15 mm | 19 mm | 11 mm | 15,5 mm | 3,5 mm | 3,5 mm | 9×9 bis 40×40 cm | gerade geschnitten, für kleine Formate |
| **102** | 20 mm | 24 mm | 13 mm | 18 mm | 6 mm | 6 mm | 35×50 bis 70×100 cm | auch in Edelholz (Ahorn, Kirsche, Eiche) |
| **107** | 35 mm | 19 mm | 28 mm | 15 mm | 4 mm | 6 mm | 40×50 bis 70×100 cm | extrabreite Aufsicht, flach |
| **111** Objektrahmen | 20 mm | 40 mm | 13 mm | — | ca. 7 mm (Foto geschätzt, nachmessen) | 6 mm | 30×30 bis 70×100 cm | 15 mm Abstand Glas → Rückwand, weiß lackierte Innenleiste |

- "Falztiefe" = Höhe des Falzes von hinten, "Lippe" = Tiefe − Falztiefe (Holz vor dem Glas).
- Alle Profile haben leicht gebrochene Kanten (~1 mm) und hinten eine Längsnut (für Einsteck-Aufsteller /
  Aufhänger) — die Nut liegt an der Wand und muss nicht modelliert werden.
- **111 Objektrahmen**: Zwischen Glas und Rückwand sitzt eine herausnehmbare, **weiß lackierte
  Abstandsleiste**, 15 mm tief. Von vorn sieht man: Holzlippe → Glas → ringsum 15 mm weiße Innenleiste →
  Objekt/Bild auf der Rückwand (weißer Karton + HDF). Wird nur mit Normalglas oder Acrylglas UV97
  angeboten (Entspiegelung wirkt bei Objektrahmen nicht).

Standardformate (Bildmaß, cm):
- 116: 9×9, 10×15, 13×18, 15×21, 18×24, 20×20, 21×29,7, 21×30, 24×30, 24×32, 25×60, 28×35, 30×30, 30×40, 40×40
- 102: 35×50, 40×50, 40×60, 40×100, 45×60, 50×50, 50×60, 50×65, 50×70, 56×71, 60×60, 60×80, 70×70, 70×90, 70×100
- 107: 40×50, 50×60, 50×70, 60×80, 70×100
- 111: 30×30, 30×40, 40×40, 40×50, 50×50, 50×60, 50×70, 60×80, 70×90, 70×100

### Vorschlag für `FrameProfileSpec` (mm)

`reveal` = Lippe + 2 mm Glas (wie bei HALBE). Radien nach Fotos geschätzt.

| id | label | width | depth | reveal | body | innerRadius | outerRadius | backRadius |
|---|---|---|---|---|---|---|---|---|
| `aab116` | Aab 116 | 15 | 19 | 5,5 | 11 | 1 | 1 | 1 |
| `aab102` | Aab 102 | 20 | 24 | 8 | 13 | 1,2 | 1,2 | 1 |
| `aab107` | Aab 107 | 35 | 19 | 6 | 28 | 1,5 | 1,5 | 1 |
| `aab111` | Aab 111 Objektrahmen | 20 | 40 | 9 (Lippe ~7 + Glas) | 13 | 1,2 | 1,2 | 1 |

Das 111 braucht mehr als eine neue Zeile: siehe 6.2.

## 3. Farben / Oberflächen

13 Ausführungen. Farbwerte gemessen aus den Farbvarianten-Bildern von Profil 102
(`/media/image/variation/<id>/md/bilderrahmen-profil102_farbe_<name>.jpg`, Rand des Rahmens, hellstes
Achtel verworfen), als 30./50./70. Perzentil. Das ist das **Aussehen im Foto**, nicht die Albedo — vor dem
Eintragen genauso kalibrieren wie bei HALBE (Abschnitt 5).

| Farbe | Art | p30 | p50 | p70 | Charakter (aus den Musterecken) |
|---|---|---|---|---|---|
| Weiß | deckend lackiert | `#dedad7` | `#e2dedc` | `#e3dfde` | glatt, keine Maserung |
| W. Lasiert (weiß lasiert) | Lasur | `#dacecc` | `#ded2d0` | `#e1d5d3` | Weiß mit deutlich dunklen, offenen Poren (Striche) |
| Lichtgrau | deckend lackiert | `#b6b6b8` | `#b9b9bb` | `#bbbbbd` | glatt |
| Anthrazit | deckend lackiert | `#5c5b61` | `#626166` | `#67666c` | leichte Porenstruktur sichtbar |
| Schwarz | deckend lackiert | `#28282b` | `#302f32` | `#363639` | Poren-/Maserungsrelief sichtbar |
| Aspe | Natur | `#d9cab9` | `#dbcfc0` | `#e2d5c6` | sehr hell, cremig, fast ohne Maserung |
| Fichte | Natur | `#dabb99` | `#dbbfa0` | `#d7c3ac` | hell, **regelmäßige, deutliche Jahresringlinien** (~2 mm) |
| Ayous | Natur | `#d8b481` | `#dab98a` | `#dcbd90` | hell gelblich, feine offene Poren |
| Mahagoni-Sipo | Natur | `#a26b47` | `#a9734f` | `#b17d57` | rotbraun, wechselnde Streifen (Wechseldrehwuchs) |
| Esche Dunkel | gebeizt | `#764624` | `#7e4c27` | `#85532d` | dunkel, kräftige, fließende Maserung mit Poren |
| Ahorn (Edelholz) | Natur | `#d8c2ac` | `#d7c5b3` | `#d9c9b8` | hell, wenige feine gerade Linien |
| Kirsche (Edelholz) | Natur | `#ae7c57` | `#b4825b` | `#b78761` | warm rötlich, weiche wellige Linien |
| Eiche (Edelholz) | Natur | `#a98057` | `#af865d` | `#b58d64` | mittelbraun, feine, dichte Linien |

Verfügbarkeit je Profil:

| Profil | Farben |
|---|---|
| 116 | Schwarz, Lichtgrau, Weiß, Anthrazit, W. Lasiert, Ayous, Fichte, Aspe, Mahagoni-Sipo, Esche Dunkel (10) |
| 102 | wie 116 + Ahorn, Kirsche, Eiche (13) |
| 107 | Schwarz, Weiß, W. Lasiert, Ayous (4) |
| 111 | Schwarz, Weiß, W. Lasiert, Ayous (4) |

### Was die Textur-Erzeugung dafür braucht (`src/lib/frameTextures.ts`)

Vorhanden: Arten `eiche`, `ahorn`, `erle`, `nussbaum`. Neu nötig:
- `fichte` — Nadelholz: regelmäßige, scharf abgesetzte dunklere Spätholzlinien, wenig Poren. Eigene
  Parameter (kleiner Abstands-Spielraum, `late` hoch, `darkMin` hoch, keine Poren).
- `ayous` — hell, gleichmäßig, feine Porenstriche (diffus porig, `pores` ~0.5, niedrige Linien-Dunkelheit).
- `aspe` — fast strukturlos: sehr niedriger Kontrast, keine Poren.
- `sipo` — Wechseldrehwuchs: breite, abwechselnd helle/dunkle Längsstreifen (`bands` hoch) statt
  feiner Linien, dazu leichter Glanz.
- `esche` — ringporig wie Eiche, aber kräftigere, weiter geschwungene Linien (`wave` hoch).
- `kirsche` — wenige weiche, wellige Linien, warmer Grundton.
- Deckende Lacke mit Porenbild (Schwarz, Anthrazit): im Farbfeld fast einfarbig, aber Poren als
  Normal-/Rauheitsdetail und ganz leicht in der Farbe → vorhandenes Holz-Modell mit niedrigem `contrast`
  und Esche-Poren reicht vermutlich (wie HALBE "Eiche schwarz").
- Weiß und Lichtgrau: glatt lackiert, keine Maserung → neue Oberflächenart `lacquer` (einfarbig,
  Rauheit ~0.5, ohne Texturen) oder `wood` mit `contrast: 0` und `relief: 0` (dann aber unnötige
  Worker-Arbeit — besser eigene Art ohne Texturen).

## 4. Passepartouts bei Aab

- **Standard**: Museumskarton **gebrochen weiß, 1,6 mm**, chlor- und säurefrei, 100 % gebleichter Zellstoff,
  pH 8,0–9,5, Puffer > 4 % Calciumcarbonat, DIN ISO 9706. Schrägschnitt, computergesteuert geschnitten.
  Ohne Angabe wird der Ausschnitt **zentriert**.
- **Farbig**: **1,4 mm**, 100 % Alphazellulose, UV-beständig, PAT-Test. 19 Farben (Name + Code); gemessen aus
  den Farbmustern (Kartonfläche, Mittelwert). Die Muster zeigen einen **weißen Kern** im Schrägschnitt.

  | Farbe | gemessen | Farbe | gemessen |
  |---|---|---|---|
  | Weiß FAY 10 | `#f4f3f4` | Braun COFFEE13 | `#88766d` |
  | Grau EVEREST12 | `#6c6e6b` | Braun COFFEE15 | `#c6b9b1` |
  | Grau EVEREST15 | `#cdcec9` | Braun SIERRA13 | `#d0b58e` |
  | Grau LAOTSE15 | `#b4b1a8` | Türkis PELOSA11 | `#306462` |
  | Grau MOUNTBLANC15 | `#d4d1ca` | Grün MOSS11 | `#535c28` |
  | Gelb BURMA11 | `#f3ba2b` | Grün MOSS15 | `#c6d1b4` |
  | Blau SKY14 | `#c7ccd2` | Grün LHASA12 | `#748171` |
  | Blau ATLANTIC11 | `#2b454e` | Rosa ROSE13 | `#c8939b` |
  | Blau ATLANTIC15 | `#c2d0d3` | Rot WINE12 | `#5f1c1e` |
  | Braun AFRICA15 | `#d2c8b9` | | |

- Weitere Varianten: runder Ausschnitt (Durchmesser frei), 2 oder 3 Ausschnitte (Mehrfach-Passepartout),
  vorgefertigte "edle" Passepartouts in Silber, Gold und gebrochen weiß.
- FAQ-Empfehlung: Ausschnitt **0,5 cm je Seite kleiner** als das Bild, damit es befestigt werden kann.
  Bei uns bleibt das Bild bewusst ganz sichtbar (Nutzervorgabe), das bleibt so.

Für CuraHub heißt das: das vorhandene Passepartout (`Passepartout.tsx`, 1,5 mm, weiß) um **Farbe** und
**Stärke** erweitern (`passepartoutColor`, ggf. `passepartoutThickness`), Bevel-Flächen in Kernfarbe
(weiß) statt Kartonfarbe, Front in Kartonfarbe. Die Kartonfarben müssen wie die Holzfarben kalibriert
werden. Runder Ausschnitt / Mehrfach-Ausschnitte sind eigene, spätere Themen.

## 5. Kalibrierung der Farben (wie bei HALBE)

Die gemessenen Werte sind Fotoaussehen. HALBE wurde so kalibriert:
1. Testseite (nicht im Repo) mit `PlacedArtworks` + `FrameInstancerProvider`, weiße Wand, RectAreaLight
   12 × 6 m, Intensität 3,5, dazu ambient 0.4 + directional 0.3, Belichtung 1.1, ACES. Screenshots per
   Headless-Chrome über CDP (`--headless=new --enable-unsafe-webgpu`), WebGPU und `?renderer=webgl`.
2. Einen Rahmen mit bekannter Albedo rendern, Pixel der Vorderseite messen, daraus ein einfaches Modell
   fitten: `render = ACES(albedo_linear × L)` mit L ≈ 1,7 (neutral).
3. Für jede Zielfarbe (Foto p90 → `light`, p30 → `dark`) die Albedo per Iteration invertieren.
4. **Farben immer als sRGB-Bytes aus dem Hex bauen** (`rgbOf`), nie über `THREE.Color` — das rechnet in
   linear um und verfälscht alles.

Metalle gibt es bei Aab nicht; nur Holz, Lack, Lasur.

### So wurden die Aab-Farben kalibriert (2026-09-19)

- Testseite nachgebaut wie die HALBE-Seite: RectAreaLight 12 × 6 m, Intensität 3,5 bei (0, 3,6, 2,5) mit
  `rotation-x = −π/2` (strahlt nach unten), ambient 0.4, directional 0.3, weiße Wand #f2f0ec, Belichtung
  1.1. Rahmen Aab 102, Messung auf dem Vorderseiten-Ring, hellstes Achtel verworfen wie bei den Fotos.
- Das Modell `render = ACES(albedo_lin × 1,7)` (three ACESFilmic inkl. `exposure / 0.6`) reproduziert die
  HALBE-Katalogwerte aus ihren Fotozielen (RMS 4,7 von 255) — es ist also genau das HALBE-Verfahren.
- **Belichtungsangleich:** Die Aab-Farbmuster sind dunkler fotografiert als HALBEs Produktfotos
  (Weiß p50 #e2dedc gegen HALBE-Weiß #efefed, bei Schwarz ähnlich). Ohne Angleich stünde Aab-Weiß grau
  neben HALBE-Weiß. Alle Aab-Fotowerte werden deshalb linear × 1,172 skaliert (Luminanz Aab-Weiß → HALBE-Weiß).
- Zuordnung: `light` ← p70, `dark` ← p30 (HALBE nahm p90; Aab hat keine Werte darüber — eine Extrapolation
  lag bei Aspe über dem Weiß), Lack ← p50. Poren = `dark` × 0,7 linear (HALBE-Verhältnis), bei
  W. Lasiert × 0,3 (deutlich dunkle Porenstriche), Anthrazit/Schwarz × 0,75.
- An der ACES-Schulter (sehr helle Ziele) würde die Inversion einzelne Kanäle an den Anschlag treiben und
  den Farbton kippen (W. Lasiert wurde rosa). Albedo daher auf ≤ #f5 je Kanal begrenzt; läuft ein Ton
  einer Farbe dagegen, behalten hell und dunkel die Chromatizität des Ziels und nur die Luminanz wird
  angepasst.
- Ergebnis in der Testseite: Aab Weiß rendert #f1efec (HALBE Eiche weiß #f0ece6), Aab Schwarz #5c5851
  (HALBE Eiche schwarz #5f5a51). Dunkle Oberflächen rendern bei beiden Herstellern heller als ihr
  Fotoziel (Glanz/Umgebung addiert sich), das Modell ignoriert das bewusst — gleich wie bei HALBE.
- Hinweis: Iteratives Anpassen an die *gerenderten* Perzentile der Textur wurde verworfen — die Maserung
  konzentriert die Variation in dünnen Linien, die Spannen hell↔dunkel explodieren (Fichte wurde türkis).
- Ablauf: temporäre Seite (`ModularFrame` pro Farbe, Farben per URL-Parameter überschreibbar, Texturen im
  Main-Thread statt Worker) mit `vite build --config` in ein Scratch-Verzeichnis bauen, per `file://` in
  Headless-Chrome (`--allow-file-access-from-files`) laden, Screenshot über CDP, PNG in Node dekodieren.
- Stolperfalle beim Nachbauen: eine orthografische Kamera exakt frontal auf die Wand lässt RectAreaLights
  wegfallen (V ∥ N, three's LTC-Basis degeneriert) — Kamera ein paar Grad neigen.
- In der App (`Satellit`) strahlt das 3,5er-Deckenlicht mit `rotation-x = +π/2` nach **oben**, nach unten
  nur das 1,2er-Licht. Rahmen sehen im Raum daher dunkler aus als in der Testseite — HALBE und Aab gleich.

## 6. Umsetzungsplan

### 6.1 Katalog (`src/lib/frameStyles.ts`, `server/src/lib/frameStyles.ts`)
- Hersteller-Ebene einführen: `manufacturer: 'halbe' | 'aab'` am Profil; Panel gruppiert Profile
  nach Hersteller → Material.
- Profil-IDs `aab116`, `aab102`, `aab107`, `aab111`; Finish-IDs mit Präfix, damit sie nicht mit
  HALBE-Farben kollidieren (`aab-schwarz`, `aab-weiss-lasiert`, `aab-fichte`, …). Style-ID bleibt
  `${profile}-${finish}` (z.B. `aab102-aab-kirsche`), `frameStyle()` schneidet am ersten `-`.
- `PROFILE_FINISHES` um die Aab-Tabelle aus Abschnitt 3 erweitern, Server-Spiegel ebenso. Keine
  DB-Migration nötig (String-Spalte).
- `styleForProfile` beim Wechsel HALBE → Aab: Farbfamilie über ein Mapping (Weiß ↔ weiss-matt/eiche-weiss,
  Schwarz ↔ schwarz-matt/eiche-schwarz, Eiche ↔ eiche-natur, Ahorn ↔ ahorn-natur).

### 6.2 Objektrahmen 111
- `FramedArtworkLayout.pictureZ` muss um den Abstand Glas → Rückwand (15 mm) tiefer liegen; neues
  Profilfeld `objectDepth` (mm).
- Innenleiste als eigene Geometrie: vier weiße Leisten (15 mm tief, ~3 mm stark) direkt hinter der Lippe
  entlang der Öffnung, oder als zweiter Profilquerschnitt in `frameProfileGeometry` (eigene Instanzen,
  Material weiß lackiert). Der Schatten der Lippe auf die Leiste ist wichtig für die Tiefenwirkung.
- Passepartout im Objektrahmen: liegt hinten auf der Rückwand (nicht direkt hinter der Lippe) —
  `passepartout.frontZ` entsprechend.

### 6.3 Glas (optional, beide Hersteller)
Aab: Normalglas/Floatglas 2 mm (durchsichtig), Acrylglas UV97, Acrylglas UV100 **blendfrei** (einseitig
matt). HALBE hat ebenfalls Glasoptionen. Glas wird bisher nicht gerendert. Falls gewünscht: dünne
transparente Ebene knapp hinter der Lippe mit schwacher Umgebungsspiegelung (`getFrameEnvironment`),
"blendfrei" = hohe Rauheit. Kostet eine transparente Fläche pro Bild → nur optional.

## 7. Custom Frame (vorgemerkt)

Ziel: Kurator:innen definieren einen eigenen Rahmen, der in keinem Katalog steht.

Mindestumfang:
- **Aufsicht** (mm), **Profiltiefe** (mm), optional **Lippe/Reveal** (Default: HALBE-Wert je Material).
- **Oberfläche**: Farbe (Farbwähler) + Art: matt lackiert, glänzend lackiert, Metall (eloxiert),
  Holzmaserung (Holzart aus den vorhandenen Arten wählen, Farbe tönt die Maserung).
- Kanten: kantig / leicht gerundet / Radius außen (wie Alu 12).

Datenmodell (Vorschlag):
- `frameStyle = 'custom'` plus neue JSON-Spalte `frameCustom` (Zod-validiert auf Client und Server:
  Zahlenbereiche z.B. Aufsicht 3–120 mm, Tiefe 5–120 mm, Farbe `#rrggbb`, Art-Enum).
  Alternative ohne neue Spalte: alles in `frameStyle` kodieren (`custom:w15:d27:#aabbcc:wood-eiche`) —
  kompakter, aber schlechter validier- und erweiterbar.
- Geometrie: `getFrameParts` bekommt einen Cache-Key aus den Custom-Maßen statt der Profil-ID
  (`buildOutline(profileCorners(spec))` funktioniert für jede `FrameProfileSpec`).
- Material: Cache-Key aus Oberfläche + Farbe; Holz-Texturen im Worker mit eingefärbter Basis.
- Instancing: `FrameInstancerRegistry` gruppiert nach Style-Schlüssel — für Custom den kanonischen
  Custom-Key verwenden, damit gleiche Custom-Rahmen sich einen Draw Call teilen.
- UI: im Profil-Dropdown ein Eintrag "Eigener Rahmen …", darunter Eingabefelder; die letzten Custom-Werte
  als Default für neue Drops (wie `defaultFrameStyle`).
- Wandeditor, Außenmaß und Bodenbegrenzung laufen schon über `framedArtworkLayout` — dort nur
  `frameStyle(...)` so erweitern, dass es für Custom ein Profil aus `frameCustom` liefert.

Offene Fragen an den Nutzer:
- Soll ein Custom Frame speicherbar/wiederverwendbar sein (z.B. pro Projekt eine Liste eigener Rahmen)
  oder nur pro Werk?
- Reicht Farbe + Oberflächenart, oder sollen auch eigene Texturen/Fotos einer Leiste hochgeladen werden?

## 8. Quellen

- Profile: https://www.aab-bilderrahmen.com/bilderrahmen-profil116, …-profil102, …-profil107, …-profil111
- Maßanfertigung: https://www.aab-bilderrahmen.com/anfertigungennachmass
- Passepartout weiß: https://www.aab-bilderrahmen.com/passepartout/innenausschnitt_33
- Passepartout farbig: https://www.aab-bilderrahmen.com/passepartout/farbig_580
- Gläser: https://www.aab-bilderrahmen.com/glas · FAQ: https://www.aab-bilderrahmen.com/FAQ
- Katalog (PDF, nicht ausgewertet): https://www.aab-bilderrahmen.com/mediafiles/Musik/Katalog.pdf
