# CuraHub: Performance- & Workflow-Audit (Produktion)

**Datum:** 13.09.2026
**Getestet:** https://curahub.krullmann.com, Kuration **„Yol“** (Projekt-ID 5, Version 15, 136 Assets, ~72 platzierte Werke, 2 Videos)
**Ziel:** Der komplette Workflow muss funktionieren, mit möglichst kurzen Ladezeiten, **vor allem auf schwächerer Hardware** (iGPU-Laptops, ältere Uni-Rechner, Tablets).
**Status:** Analyse abgeschlossen. Wellen 1 + 2 sind umgesetzt, aber noch nicht committed, siehe **Abschnitt 8**. Dieses Dokument ist die Arbeitsgrundlage für nachfolgende Agents.

---

## 0. Anleitung für Agents

1. Arbeite die Punkte **nach Phase** ab (Abschnitt 5). Innerhalb einer Phase nach Priorität: P0 > P1 > P2 > P3.
2. Jeder Punkt hat eine **ID** (z. B. `SEC-01`, `LOAD-03`). Referenziere die ID in Commits und PRs.
3. Die Zeilennummern gelten für Commit `bc6d538` plus die uncommitteten Änderungen vom 13.09.2026. Vor dem Editieren prüfen, ob sie noch stimmen.
4. Nach jedem Punkt das **Akzeptanzkriterium** prüfen und mit dem Messprotokoll (Abschnitt 6) nachmessen. Verbesserungen immer mit Vorher- und Nachher-Zahl belegen.
5. Regeln aus `CLAUDE.md` gelten weiter: minimale, gezielte Änderungen, UI-Texte auf Deutsch, `npm run lint` vor Abschluss, nach Licht- oder Video-Änderungen im First-Person-Modus testen.
6. **Achtung:** `CLAUDE.md` weicht an mehreren Stellen vom echten Code ab (siehe Abschnitt 7). Im Zweifel gilt der Code.

---

## 1. Testumgebung & Grenzen der Messung

| Parameter | Wert |
|---|---|
| Browser | Chrome (Claude-in-Chrome-Extension), Fenster 1800×927 CSS-px, DPR 2 |
| Hardware | Apple M2 Pro, 10 Kerne, 16 GB (**High-End**, alle Zeiten auf schwacher Hardware deutlich schlechter) |
| Netzwerk | Cloudflare, HTTP/3, Brotli |
| Cache | Überwiegend **warm** (Assets schon im Browser-Cache). Kaltstart-Werte sind schlechter. |

**Nicht messbar bzw. nicht getestet:**
- CPU-/GPU-Throttling war über die Extension nicht möglich. Aussagen zu schwacher Hardware sind **Hochrechnungen**, keine Messungen.
- Pointer-Lock (First-Person-Laufen) ließ sich nicht automatisieren (`WrongDocumentError`). Die Viewer-Szene wurde hinter dem „Klicken zum Betreten“-Overlay gemessen, sie rendert dort bereits.
- HTML5 Drag & Drop (Asset auf Wand ziehen) ist mit synthetischen Maus-Events nicht auslösbar. Platzierung, Transform und Versionsspeichern wurden **nur per Code-Review** geprüft.
- Login wurde nicht durchgespielt (bestehende Session).
- Test-Upload: `curahub-upload-test.jpg` (6000×4000) wurde in das Projekt **„test“** hochgeladen. Dieses Asset kann gelöscht werden.

---

## 2. Kennzahlen (gemessen)

### 2.1 Netzwerk & Bundle

| Messpunkt | Wert | Bewertung |
|---|---|---|
| JS-Bundle (ein einziger Chunk) | **1,56 MB** Brotli / **4,75 MB** entpackt | Kein Code-Splitting, Home und Login laden Three/Drei/Rapier/React-Flow mit |
| davon Base64-Blob (Rapier-WASM) | **2,04 MB** (43 % des entpackten Bundles) | Wird auch auf Startseite und Login geparst |
| Startseite lädt 3D-Modelle | `Satellit_new.glb` **16 MB** + `Monitor65.glb` + `Halbe_Classic_Alu8.glb` | Ursache: `useGLTF.preload` auf Modul-Ebene, dazu eager Imports |
| Startseite Hintergrundvideo | `BG_Video_CuraHub.webm` **6,3 MB**, Autoplay | Auf Mobil/schwachem Netz teuer |
| Cache-Header gehashte Assets (`/assets/*.js`) | `max-age=14400`, `cf-cache-status: REVALIDATED` | Sollte `immutable, max-age=31536000` sein |
| Cache-Header `/models/*.glb` | `max-age=0`, `cf-cache-status: DYNAMIC` | Wird bei jedem Besuch revalidiert, kein Edge-Cache |
| Editor-Load Yol: API-Duplikate | `/api/projects` ×2, `/api/exhibitions/5/versions` ×3, `/api/instances` ×2, `/api/walls` ×2 | Unnötige Roundtrips |
| Editor Yol: Bild-Requests | **134 WebP, 42 MB**. Einzelne Dateien wurden doppelt geladen (`<img>` ohne CORS + Texture-Loader mit CORS) | Sidebar zeigt Originale als 105-px-Thumbnails |
| Viewer Yol: Gesamt-Payload | JS 1,56 MB + GLB 16 MB + 72 WebP ≈ 20 MB + Video-Ranges ≈ **38 MB** | Kaltstart bei 20 Mbit/s ≈ 15 s nur Download (Schätzung) |

### 2.2 Laufzeit / Rendering

| Messpunkt | Editor (Yol) | Viewer (Yol) |
|---|---|---|
| Zeit bis „fertig“ (warmer Cache, M2 Pro) | **9,3 s** nach Projektwechsel | **8,1 s** bis zum ersten Draw |
| Längster eingefrorener Frame (Long Animation Frame) | **8,4 s** am Stück | **7,5 s** am Stück (4,0 s React-Commit via `MessagePort` + 3,5 s erster R3F-Frame) |
| Draw Calls pro Frame | **661** | **579** |
| Meshes in Szene | 661 | 660 (davon 586 mit `castShadow`) |
| Texturen / geschätzter GPU-Speicher (RGBA8 + Mipmaps) | 76 / **≈ 1,6 GB** | 82 / **≈ 1,76 GB** |
| Materialien | – | 81× `MeshStandardMaterial` + 2× `RectAreaLight` |
| Canvas-Auflösung | 3600×1854 (DPR 2, **6,7 MP**) | 3600×1972 |
| Render-Schleife im Leerlauf | Dauerhaft 120 fps, auch ohne Interaktion | 93 fps (Raycaster kostet mit) |
| Raycasts (FPV-Info-Overlay) | – | **20.446 Mesh-Raycasts/s**, ≈ 7 ms CPU/s |
| Rendert Editor hinter Asset-Library-Overlay? | **Ja**, 240 Frames/2 s mit 661 Draw Calls | – |
| Sidebar-Thumbnails dekodiert | 136 Bilder à Ø 2027×2032 px, angezeigt 105×105 px, ≈ **2,2 GB** Bitmap (Obergrenze) | – |
| JS-Heap | 199–206 MB | 154–199 MB |
| VersionPanel öffnen | 406 ms Long Frame | – |

### 2.3 Upload (Bild)

| Messpunkt | Wert |
|---|---|
| 6000×4000 JPEG (489 KB) → Server-WebP | 2500×1667, 13,7 KB, **706 ms** Roundtrip. Funktioniert. |
| Client-seitiges Resize (`src/lib/imageUtils.ts`) | **Wird nirgends verwendet.** Originale gehen ungekürzt über die Leitung. |

### 2.4 Hochrechnung schwache Hardware (nicht gemessen)

Ein Intel-iGPU-Laptop (z. B. i5 8. Gen, 8 GB, UHD 620) ist grob 3–6× langsamer auf dem Main Thread und hat 1,5–3 GB geteilten GPU-Speicher. Daraus folgt:
- Eingefrorener Tab beim Laden: **20–45 s**. Chrome zeigt dann eventuell „Seite reagiert nicht“.
- ≈ 1,6–1,8 GB Texturen plus 6,7-MP-Canvas mit Standard-PBR und RectAreaLights führen mit hoher Wahrscheinlichkeit zu **WebGL Context Lost** oder einstelligen FPS.
- Tablets/Handys (`MAX_TEXTURE_SIZE` oft 4096, wenig RAM): Absturz des Tabs ist wahrscheinlich.

---

## 3. Workflow-Durchlauf (Schritt für Schritt)

| # | Schritt | Ergebnis | Befunde (IDs) |
|---|---|---|---|
| 1 | Startseite `/` aufrufen | Lädt (DCL 194 ms warm), lädt aber 16 MB GLB + 6 MB Video + 4,75 MB JS | LOAD-01, LOAD-02, LOAD-03, LOAD-08 |
| 2 | Link „Ausstellungen“ | `/exhibition` funktioniert. **Direktaufruf/Reload von `/exhibitions` → „Cannot GET /exhibitions“** | FUNC-02 |
| 3 | Deep-Link `/exhibition/yol/edit` | **Landet im falschen Projekt „test“** (URL wird umgeschrieben) | FUNC-01 |
| 4 | Projekt „Yol“ über Selector wählen | Funktioniert, aber 9,3 s bis fertig, 8,4 s eingefroren, 42 MB Bilder | LOAD-04, LOAD-05, RND-01…RND-06, API-01 |
| 5 | Asset-Sidebar | Zeigt Originalbilder, kein Lazy Loading | LOAD-04 |
| 6 | Versionshistorie öffnen | Funktioniert (React Flow), 406 ms Long Frame | LOAD-03 |
| 7 | „Viewer testen“ | Popover funktioniert, Link korrekt | – |
| 8 | Tab „Assets“ | Funktioniert. Editor-Canvas rendert unsichtbar weiter (120 fps, 661 Draws) | RND-02, LOAD-04 |
| 9 | Bild-Upload im Projekt „test“ | **Funktioniert** (Preview-Modal → Upload → WebP 2500 px) | SEC-01, UPL-01…UPL-06 |
| 10 | Asset auf Wand ziehen, G/R/S, Undo | Nicht automatisierbar, Code-Review siehe RND-07, STATE-01…STATE-04 | STATE-* |
| 11 | First-Person-Vorschau im Editor | **Nicht erreichbar**: `ViewModeControls` ist auskommentiert, keine Taste V | FUNC-03 |
| 12 | Öffentlicher Viewer `/exhibition/yol` | Funktioniert. 8,1 s bis erster Draw, 7,5 s Freeze, 579 Draws | LOAD-*, RND-*, VID-* |
| 13 | Viewer-Button „Ausstellungen“ | Öffnet `/exhibitions` in neuem Tab → **404** | FUNC-02 |

---

## 4. Befunde & Lösungen

Legende: **P0** = kritisch (Sicherheit/Datenverlust/Workflow kaputt), **P1** = hoher Nutzen für Ladezeit/schwache Hardware, **P2** = mittel, **P3** = Aufräumen.
„Gemessen“ heißt live verifiziert. „Code“ heißt aus dem Quelltext abgeleitet.

---

### 4.1 Sicherheit & Datenintegrität

#### SEC-01: Upload-Endpoint ohne Authentifizierung und ohne Größenlimit (P0, Code)
- **Beleg:** `server/src/routes/upload.ts:142` `uploadRouter.post('/', …)` hat kein `authenticate`. `upload.ts:81` `fileSize: Infinity`, `upload.ts:56` `video: Infinity`.
- **Folge:** Jeder im Internet kann beliebig große Dateien hochladen. Das füllt die Platte (DoS) und startet ffmpeg/Blender/Assimp auf dem Server.
- **Lösung:** `authenticate, requireCurator` vor Multer einhängen, damit vor dem Speichern geprüft wird. Projektzugriff prüfen (`projectId` gehört dem User oder er ist Collaborator). Multer-`fileSize` hart begrenzen (z. B. 2 GB) und Typ-Limits **vor** dem Schreiben prüfen.
- **Akzeptanz:** `curl -F file=@x.jpg https://…/upload` ohne Token → 401. Mit Token eines fremden Projekts → 403/404.

#### SEC-02: `DELETE /assets/:id`, `POST/PUT/GET /artworks` ohne Auth (P0, Code)
- **Beleg:** `server/src/routes/assets.ts:101`, `server/src/routes/artworks.ts:30`, `:79`, `:89`.
- **Folge:** Unauthentifiziertes Löschen beliebiger Assets per ID-Enumeration. Metadaten fremder Werke lassen sich ändern.
- **Lösung:** `authenticate` + Ownership-Check wie in `assets.ts` PATCH (`:51`). **Client anpassen:** `AssetLibrary.tsx:211` sendet beim DELETE keinen `Authorization`-Header.
- **Akzeptanz:** Alle mutierenden Routen liefern ohne Token 401. Löschen in der Asset-Library funktioniert weiter.

#### SEC-03: `GET /api/assets` ohne Auth (P1, gemessen)
- **Beleg:** `assets.ts:12`. Ein `fetch('/api/assets?projectId=5')` ohne Header lieferte alle 136 Assets inkl. Metadaten und `fileHash`.
- **Lösung:** `authenticate` + Projektzugriffsfilter. Client `AssetSidebar.tsx:58` und `AssetLibrary.tsx:153` müssen dann den Token mitsenden. Für den öffentlichen Viewer reicht `/public/exhibition/:slug`.

#### SEC-04: Dateinamen-Kollision überschreibt fremde Uploads (P0, Code)
- **Beleg:** `upload.ts:75` speichert als `${sanitizedTitle}${ext}` ohne eindeutigen Suffix. `upload.ts:277` schreibt `…​.webp` mit demselben Basisnamen. Die Duplikaterkennung per Hash greift nur bei **identischem Inhalt im selben Projekt**.
- **Folge:** Zwei verschiedene Dateien mit gleichem Namen (z. B. `DSC01426.jpg` von zwei Studierenden oder in zwei Projekten) → die zweite überschreibt die erste auf der Platte. Die bestehende Ausstellung zeigt dann das falsche Bild.
- **Lösung:** Dateiname = `${uuid}-${sanitizedTitle}${ext}` (oder Hash-basiert). Originalnamen nur in der DB (`filename`) halten.
- **Akzeptanz:** Zwei unterschiedliche Dateien gleichen Namens hochladen → zwei unterschiedliche `path`-Werte, beide korrekt sichtbar.

#### SEC-05: Asset-Löschen löscht nie die Datei (verwaiste Dateien) (P1, Code)
- **Beleg:** `assets.ts:126` nutzt `asset.filename` (Originalname, z. B. `Abla_Luca Grommel-9.webp`; laut uncommitteter Änderung künftig ohne Endung) statt `path.basename(asset.path)` (`abla-luca-grommel-9.webp`).
- **Folge:** Die Uploads-Platte wächst unbegrenzt. Nach SEC-04 könnte die falsche Datei gelöscht werden.
- **Lösung:** `path.basename(asset.path)` verwenden. Prüfen, ob noch andere Assets dieselbe Datei referenzieren. Einmaliges Aufräum-Skript für verwaiste Dateien.

#### SEC-06: Login-Proxy ohne Rate-Limit, JWT 365 Tage (P1, Code)
- **Beleg:** `server/src/routes/auth.ts:30` leitet Zugangsdaten an `hsbi.de/cms-ajax-login` weiter, ohne Rate-Limit. `auth.ts:76` `expiresIn: '365d'`. `EditorLayout.tsx:51` holt bei jedem Fenster-Fokus einen neuen Token.
- **Folge:** CuraHub kann als Brute-Force-Proxy gegen HSBI-Accounts dienen. Gestohlene Tokens gelten ein Jahr.
- **Lösung:** `express-rate-limit` auf `/auth/login` (z. B. 5/min pro IP+User). Token-Laufzeit 7–30 Tage. `refreshAuth` höchstens alle 5 min.

#### SEC-07: Globale Body-Limits 50 MB, CORS `*` (P2, Code)
- **Beleg:** `server/src/index.ts:22-23`.
- **Lösung:** `express.json({ limit: '1mb' })` global, größeres Limit nur auf der Versions-Route. CORS auf eigene Origin beschränken.

---

### 4.2 Funktionale Workflow-Bugs

#### FUNC-01: Deep-Link `/exhibition/:slug/edit` öffnet falsches Projekt (P0, gemessen)
- **Beleg:** Aufruf `/exhibition/yol/edit` → Umleitung auf `/exhibition/test/edit`. Ursache: `ProjectSelector.tsx:50`, die Regex `^\/([^/]+)\/(edit|assets)` erwartet `/<slug>/edit`, die Route ist aber `/exhibition/<slug>/edit`. Deshalb greift der Fallback `data[0]` (`:53`).
- **Folge:** Geteilte Links, Reloads und Lesezeichen landen im falschen Projekt. Wer dort weiterarbeitet, ändert per Auto-Sync das falsche Projekt.
- **Lösung:** Slug über `useParams()`/`matchPath('/exhibition/:projectSlug/:mode')` lesen statt Regex auf `window.location`. Unbekannter Slug → Hinweis-Toast statt stillem Fallback.
- **Akzeptanz:** Reload auf `/exhibition/yol/edit` und `/exhibition/yol/assets` bleibt in Yol.

#### FUNC-02: Direktaufruf `/exhibitions` → Express 404 (P0, gemessen)
- **Beleg:** `curl /exhibitions` → 404 „Cannot GET /exhibitions“. `server/src/index.ts:78`, die SPA-Fallback-Skip-Liste enthält `/exhibitions` (API-Prefix), und `req.path.startsWith` trifft auch die Frontend-Route. Betroffen: `ViewerPage.tsx:175` (`window.open('/exhibitions')`), Header-Link im Editor bei Reload.
- **Lösung (empfohlen):** API ausschließlich unter `/api/*` mounten (die Doppel-Mounts ohne Prefix in `index.ts` entfernen). Alle Client-Fetches nutzen dann `/api/...`. Aktuell benutzen z. B. `/public/featured`, `/upload` und `/auth/me` noch keinen Prefix. Kurzfristig reicht: Skip-Check exakt auf Segmentgrenzen und `/exhibitions` nicht mehr skippen, wenn `Accept: text/html`.
- **Akzeptanz:** Alle Frontend-Routen aus `src/App.tsx` liefern bei Direktaufruf `index.html` (Status 200).

#### FUNC-03: First-Person-Vorschau im Editor nicht erreichbar (P1, Code)
- **Beleg:** `EditorLayout.tsx:17`, der Import von `ViewModeControls` ist auskommentiert („white screen crash“). Kein anderer Code setzt `plannerViewMode = 'firstPerson'`. Außerdem kennt `PlannerCameraSystem` keinen orthografischen Modus, obwohl `ViewModeControls` `'orthographic'` setzen würde.
- **Folge:** Kuratierende können nur über den öffentlichen Viewer testen, und der braucht eine veröffentlichte Version.
- **Lösung:** Crash-Ursache finden (vermutlich zirkulärer Import oder die fehlende Ortho-Kamera). Toggle in die Toolbar von `EditorPage` integrieren. `'orthographic'` entfernen oder implementieren. Escape → `'perspective'`.

#### FUNC-04: `hasUnsavedChanges` wird nach Auto-Sync nie zurückgesetzt (P2, Code, verifizieren)
- **Beleg:** `editorStore.ts:426` setzt `true`. `syncToBackend` (`:519` ff.) setzt es nie zurück. `EditorPage.tsx` `beforeunload` fragt dann nach jeder Änderung.
- **Lösung:** Nach erfolgreichem Sync aller Requests auf `false` setzen. Bei Fehlern `true` lassen und einen Toast zeigen (siehe STATE-02).

---

### 4.3 Ladezeit & Netzwerk

#### LOAD-01: Kein Code-Splitting (P1, gemessen)
- **Beleg:** Ein Chunk mit 1,56 MB br / 4,75 MB. `src/App.tsx` importiert alle Seiten eager. Rapier-WASM (2 MB Base64), React Flow (`VersionPanel.tsx:14`), `react-markdown` + Wiki-`?raw` (`WikiView.tsx:7`) landen auf jeder Seite.
- **Lösung:**
  1. `React.lazy` pro Route: `HomePage`, `LoginPage`, `ExhibitionsPage` ohne Three.js. `ViewerPage` und `EditorLayout` jeweils lazy.
  2. `VersionPanel`, `WikiModal`, `MetadataDialog`, `ProjectSettingsDialog`, `UploadPreviewModal` erst beim Öffnen laden.
  3. `@react-three/rapier` nur im Viewer bzw. im FPV-Modus laden (dynamischer Import). Der Editor im Orbit-Modus braucht keine Physik (siehe RND-08).
  4. `build.rollupOptions.output.manualChunks`: `three`, `drei`, `rapier`, `xyflow`, `markdown` getrennt.
- **Akzeptanz:** Startseite lädt < 250 KB br JS, keine `.glb`-Requests, kein Rapier. Lighthouse Mobile TBT < 300 ms.

#### LOAD-02: Modul-Level-Preloads laden 16 MB GLB auf jeder Seite (P1, gemessen)
- **Beleg:** `Satellit.tsx:95`, `VideoInstance.tsx:9`, `ModularFrame.tsx` (`useGLTF.preload(FRAME_MODEL)` am Dateiende). Das triggert beim Import, also auch auf der Startseite.
- **Lösung:** Preloads in einen `useEffect` des Editors/Viewers verschieben oder erst nach LOAD-01 wirken lassen. Alternativ auf der Startseite per `<link rel="prefetch">` erst nach Idle.

#### LOAD-03: Raum-Modell `Satellit_new.glb` 16 MB (P1, gemessen)
- **Beleg:** 29.352 Dreiecke, aber 7 unkomprimierte Texturen (3× PNG à ~3,8 MB, 1× JPEG 2,4 MB). `Satellit_new-transformed.glb` (1,6 MB) stammt vom **alten** Modell (391.784 Dreiecke) und ist **nicht** austauschbar.
- **Lösung:** Mit `gltf-transform` (liegt serverseitig schon als Dependency vor) `resize --width 2048`, `webp` oder `ktx2 --uastc/etc1s`, `draco`/`meshopt`, `dedup`, `prune`. Ziel < 2 MB. Drei: `useGLTF(url, true /*draco*/, true /*meshopt*/)` bzw. KTX2Loader konfigurieren. Draco-Decoder lokal hosten, nicht vom gstatic-CDN.
- **Akzeptanz:** GLB < 2 MB, visuell gleichwertig (Screenshot-Vergleich Editor + Viewer).

#### LOAD-04: Originalbilder als Thumbnails (Sidebar & Asset-Library) (P1, gemessen)
- **Beleg:** `AssetSidebar.tsx:272` und `AssetLibrary.tsx:1017` nutzen `src={asset.path}` (bis 2500 px, ~0,3–1,2 MB je Bild) für 105-px- bzw. ~220-px-Kacheln. 136 Bilder, 42 MB, kein `loading="lazy"`, keine Virtualisierung. Zusätzlich doppelte Downloads, weil `<img>` (no-cors) und `TextureLoader` (cors) verschiedene Cache-Einträge nutzen.
- **Lösung:**
  1. Server generiert beim Upload `thumbnailPath` auch für Bilder (Feld existiert im Schema): 256 px und 512 px WebP/AVIF (`sharp`). Backfill-Skript für bestehende Assets.
  2. `<img loading="lazy" decoding="async" srcset=… sizes=…>` und `crossOrigin="anonymous"` einheitlich, damit Cache-Einträge geteilt werden.
  3. Grids mit > 100 Einträgen virtualisieren (`@tanstack/react-virtual`).
- **Akzeptanz:** Projektwechsel zu Yol lädt < 3 MB Thumbnails. Sidebar-Bitmap-Speicher < 100 MB.

#### LOAD-05: Szenen-Texturen in voller Auflösung, synchroner Upload (P1, gemessen)
- **Beleg:** 76–82 Texturen bis 2500×2000 px (≈ 1,6–1,76 GB GPU geschätzt). Erster R3F-Frame 3,5 s (Texture-Uploads + Shader-Compile). `SelectableInstance.tsx:28` `useTexture(asset.path)`, `:35` max. Anisotropie.
- **Lösung (Stufenplan):**
  1. **LOD:** Server erzeugt pro Bild zusätzlich `-1024.webp` (und `-512.webp`). Die Szene lädt zuerst 512/1024, High-Res (2048) nur bei Nähe < ~3 m (FPV) oder bei Auswahl.
  2. **Off-Thread-Decode:** `THREE.ImageBitmapLoader` (`createImageBitmap`, `imageOrientation: 'flipY'`) statt `<img>`-Decode auf dem Main Thread.
  3. **Upload verteilen:** `renderer.initTexture(tex)` in einer Queue mit max. 2–4 Texturen pro Frame, dazu `renderer.compileAsync(scene, camera)` vor dem Einblenden.
  4. **Optional GPU-Kompression:** KTX2/Basis (UASTC/ETC1S) serverseitig per `gltf-transform`/`toktx` → 4–8× weniger GPU-Speicher.
  5. Anisotropie auf 4 begrenzen, im Low-Preset 1.
- **Akzeptanz:** Längster Long Animation Frame beim Laden < 200 ms (M2) bzw. < 1 s (Low-End). GPU-Texturbudget Low-Preset < 300 MB.

#### LOAD-06: Cache-Header (P1, gemessen)
- **Beleg:** Gehashte JS/CSS nur `max-age=14400`, GLB `max-age=0`, `cf-cache-status: DYNAMIC`. `server/src/index.ts:27` `express.static` ohne Optionen.
- **Lösung:** `express.static(dist, { setHeaders })`: `/assets/*` → `public, max-age=31536000, immutable`. `index.html` → `no-cache`. `/models/*` mit Content-Hash im Namen oder `max-age=86400, stale-while-revalidate`. `/uploads/*` (Dateinamen nach SEC-04 eindeutig) → `immutable`. Cloudflare Cache Rule für `.glb`/`.webp`/`.mp4`.

#### LOAD-07: Suspense-Struktur blockiert die ganze Szene (P1, gemessen + Code)
- **Beleg:** Viewer: erster Draw erst nach 8,1 s, zeitgleich mit „alle Assets geladen“. `Scene.tsx:57`: `Satellit` samt Trimesh-Collider liegt **ohne eigene Suspense-Grenze** im Canvas-Root. Der Loader-Overlay (`ViewerPage.tsx:98`) wartet auf `useProgress` = 100 %.
- **Lösung:** Raum (Satellit) zuerst zeigen, Werke progressiv einblenden (eigene Suspense pro Wand bzw. Batch mit Platzhalter-Fläche in Bildfarbe/Blurhash). Viewer-Overlay nach „Raum + sichtbare Werke im Frustum“ freigeben, nicht nach 100 % aller Assets.
- **Akzeptanz:** Viewer ist < 3 s nach API-Antwort begehbar (M2), Rest lädt im Hintergrund.

#### LOAD-08: Startseite: Video, Google Fonts, Sprache (P2, gemessen)
- **Beleg:** `HomePage.tsx:69` 6,3 MB WebM Autoplay. `fonts.googleapis.com` wird geladen. `index.html:2` `lang="en"`.
- **Lösung:** Video als 720p AV1/H.264 ≤ 1,5 MB mit `poster`, `preload="metadata"`, bei `prefers-reduced-motion` oder `navigator.connection.saveData` nicht abspielen. Google Fonts **selbst hosten** (DSGVO: dynamische Einbindung von Google Fonts ist in DE abmahnrelevant). Das gilt auch für Drei-`Environment preset="warehouse"`, das HDRs von `raw.githack.com` lädt (`ModelPreviewCard.tsx:102`, `MetadataDialog.tsx:190`). HDR lokal ablegen und per `files=` einbinden. `lang="de"`.

#### LOAD-09: Ungenutzte Riesen-Modelle werden ausgeliefert (P3, gemessen)
- **Beleg:** `public/models/Satellit.glb` 68 MB (nur von ungenutztem `Satellit_old.tsx` referenziert), `Halbe_Classic_Maple20.glb` 39 MB (nirgends referenziert). Beide sind öffentlich abrufbar und im Docker-Image enthalten.
- **Lösung:** Aus `public/` entfernen (Archiv/LFS außerhalb des Build-Kontexts), `.dockerignore` prüfen, `Satellit_old.tsx` löschen.

---

### 4.4 Rendering & Laufzeit (schwache Hardware)

#### RND-01: 579–661 Draw Calls, weil jeder Rahmen aus 8 Meshes besteht (P1, gemessen)
- **Beleg:** `ModularFrame.tsx:65` ff.: 4 Ecken + 4 Kanten als eigene `<mesh>` pro Werk, dazu die Bildfläche = 9 Draws je Werk.
- **Lösung:** Alle Rahmenteile aller Werke über **zwei `THREE.InstancedMesh`** (Ecke, Kante) mit einer Instanz-Matrix pro Teil. Drei `<Instances>/<Merged>` oder ein eigener `FrameInstancer`, der aus `localInstances` Matrizen berechnet. Selektion/Transform: Matrix des betroffenen Werks live aktualisieren. Alternative: Rahmen pro Werk per `BufferGeometryUtils.mergeGeometries` zu einem Mesh zusammenführen (1 Draw statt 8).
- **Akzeptanz:** Draw Calls Yol < 120 (Editor und Viewer).

#### RND-02: Dauer-Rendering im Leerlauf und hinter Overlays (P1, gemessen)
- **Beleg:** Editor rendert konstant 120 fps mit 661 Draws, auch auf der Asset-Library-Route (`EditorLayout.tsx:271`, `<EditorPage />` bleibt gemountet).
- **Lösung:** Editor-Canvas `frameloop="demand"` und `invalidate()` bei Kamera-/Store-Änderungen (OrbitControls von Drei invalidiert selbst, Damping berücksichtigen). Auf `/assets` `frameloop="never"` oder Canvas per `display:none` + `setFrameloop('never')`. Viewer: bei `document.hidden` bzw. wenn Pointer-Lock verloren geht und nichts animiert → `demand`.
- **Akzeptanz:** Editor im Leerlauf 0 Frames/s. Asset-Library: 0 GPU-Frames im Hintergrund.

#### RND-03: DPR 2 ungebremst (6,7 MP) (P1, gemessen)
- **Beleg:** `EditorPage.tsx:402`, `ViewerPage.tsx:135` ohne `dpr`, daher R3F-Default `[1, 2]`.
- **Lösung:** `dpr={[1, 1.5]}` als Default. Drei `<PerformanceMonitor onDecline={() => setDpr(1)} />` + `<AdaptiveDpr pixelated />` für automatische Absenkung. Low-Preset: DPR 1, `antialias: false`, dafür ggf. FXAA.

#### RND-04: Teure Materialien: 81× Standard-PBR + 2 RectAreaLights (P1, gemessen)
- **Beleg:** `SelectableInstance.tsx:92` `meshStandardMaterial` pro Werk (roughness 1, metalness 0). `Satellit.tsx:66` zwei `rectAreaLight` (LTC-Shading, teuer pro Fragment auf 6,7 MP).
- **Lösung:** Fotografien als `MeshBasicMaterial` rendern (farbtreu, kein Licht nötig, Galerie-Look). Alternativ ein geteiltes Material-Setup mit `onBeforeCompile`-Tönung. RectAreaLights durch gebakte Lightmap im Raum-GLB ersetzen (Blender-Bake) oder im Low-Preset durch `hemisphereLight` + `ambientLight`. `shadows` am Canvas deaktivieren, solange kein Licht `castShadow` hat (aktuell alle Schattenlichter auskommentiert, trotzdem 586 Meshes mit `castShadow`).
- **Akzeptanz:** GPU-Frame-Zeit Viewer im Low-Preset ≤ 16 ms auf iGPU-Referenzgerät.

#### RND-05: FPV-Raycaster über die komplette Szene (P1, gemessen)
- **Beleg:** `FPVArtworkRaycaster.tsx:55` `intersectObjects(scene.children, true)` jeden 3. Frame → 20.446 Mesh-Raycasts/s, auch im Viewer vor dem Betreten. Kein BVH (`three-mesh-bvh` ist **nicht** installiert, entgegen `CLAUDE.md`).
- **Lösung:** Nur gegen eine kleine Liste (Bildflächen + Wände + Raum-Wandmesh) casten, per `THREE.Layers` oder explizitem Array. `three-mesh-bvh` (`computeBoundsTree`) auf dem Raum-Mesh. Frequenz 10 Hz statt jeden 3. Frame. Im Viewer erst nach Pointer-Lock aktiv.
- **Akzeptanz:** Raycast-CPU < 0,5 ms/s im Leerlauf.

#### RND-06: Riesiger React-Commit beim Laden (4 s) (P1, gemessen + Code)
- **Beleg:** Long Animation Frame mit 4.011 ms `MessagePort.onmessage` (React Scheduler). `PlacedArtworks.tsx:95-102`: `ref={setInstanceRef(instance.id, instance)}` erzeugt **bei jedem Render neue Ref-Callbacks** → React ruft für alle ~72 Instanzen `ref(null)` + `ref(el)` (Map-Churn). `PlacedArtworks` abonniert `selectedInstanceId` und `localInstances`, daher rendert die ganze Liste bei jeder Auswahl neu. Instanz-Komponenten sind nicht memoisiert.
- **Lösung:** Ref-Callbacks pro ID cachen (`useMemo`/Map) oder Registrierung im Kind per `useEffect`. `SelectableInstance`/`VideoInstance`/`ModelInstance` mit `React.memo`. `selected` per eigenem Selector im Kind (`s => s.selectedInstanceId === id`), nicht als Prop von oben. Mounting in Batches (z. B. 10 Instanzen pro Frame per `startTransition`).

#### RND-07: `liveTransform` rendert PropertiesPanel mit Framerate neu (P2, Code)
- **Beleg:** `InstanceTransformControls.tsx:40` ruft `setLiveTransform({...})` in `useFrame` (jeder Frame, neues Objekt). `PropertiesPanel.tsx:93` abonniert `liveTransform` → Re-Render des 670-Zeilen-Panels mit 60–120 Hz während G/R/S.
- **Lösung:** Live-Werte per Ref/`subscribe` direkt in die DOM-Inputs schreiben oder auf 10 Hz drosseln. Store nur bei MouseUp committen.

#### RND-08: Physik läuft im Editor permanent, Trimesh-Collider für ganzen Raum (P2, Code)
- **Beleg:** `EditorPage.tsx:409` `<Physics>` immer aktiv. `Scene.tsx:57` `colliders="trimesh"` um die komplette Satellit-Gruppe (inkl. Decke, Fenster, Traversen).
- **Lösung:** Im Orbit-Modus `<Physics paused>` bzw. gar nicht mounten (siehe LOAD-01). Collider aus wenigen `CuboidCollider`n (Boden, 4 Außenwände, Innenwände) statt Trimesh.

#### RND-09: Eine WebGL-Context pro 3D-Asset-Kachel (P1, Code, Risiko)
- **Beleg:** `ModelPreviewCard.tsx:94` erzeugt ein eigenes `<Canvas>` pro Karte, das nach dem ersten Sichtbarwerden **nie wieder abgebaut** wird (`:81` `setHasLoaded(true)`). Genutzt in Sidebar und Asset-Library.
- **Folge:** Chrome erlaubt ca. 16 aktive WebGL-Contexts. Ab ~15 Modellen verliert der **Editor-Canvas** seinen Context (schwarze Szene). Yol hat keine Modelle, daher nicht reproduziert.
- **Lösung:** Einen einzigen Renderer verwenden: Thumbnails serverseitig oder einmalig clientseitig als PNG rendern und cachen (`thumbnailPath` für `model3d`). Live-Vorschau nur bei Hover über drei `<View>` in einem gemeinsamen Canvas. Canvas unmounten, wenn nicht sichtbar.

#### RND-10: Geteilte Materialien bei `ModelInstance` (P2, Code)
- **Beleg:** `ModelInstance.tsx:23` `scene.clone(true)` klont keine Materialien. `:56` setzt `emissive` beim Selektieren → alle Instanzen desselben Modells und der `useGLTF`-Cache leuchten mit.
- **Lösung:** Beim Klonen Materialien klonen (`mesh.material = mesh.material.clone()`) oder die Selektion über ein Overlay-Mesh/Outline anzeigen, ohne Materialmutation.

#### RND-11: Qualitäts-Presets / Hardware-Erkennung fehlen (P1, Konzept)
- **Lösung:** Store-Slice `renderQuality: 'low' | 'medium' | 'high'`, automatisch gewählt aus `renderer.capabilities.maxTextureSize`, `navigator.hardwareConcurrency`, `navigator.deviceMemory`, `WEBGL_debug_renderer_info` (iGPU-Heuristik) und Drei `PerformanceMonitor`. Manuell umschaltbar (Viewer-Info-Menü).

| Einstellung | Low | Medium | High |
|---|---|---|---|
| DPR | 1 | 1–1,5 | 1–2 |
| Max. Texturgröße Werke | 1024 | 2048 | 2500 |
| Material Werke | Basic | Basic | Standard |
| RectAreaLights | aus | aus/gebakt | an |
| Antialias | aus | an | an |
| Video | Poster, Play bei Nähe | 720p | 1080p |
| Raycast-Frequenz | 5 Hz | 10 Hz | 15 Hz |

---

### 4.5 Video

#### VID-01: Alle Videos laden mit `preload='auto'` (P1, gemessen + Code)
- **Beleg:** `VideoInstance.tsx:41`. Yol enthält ein **96 MB**-Video (1440×1080, 439 s) und 20 MB (1920×1080, 1401 s). Editor: MP4-Requests bis 19 s Dauer, obwohl Videos im Editor pausiert sind.
- **Lösung:** `preload='metadata'` + Poster-Textur (`thumbnailPath`). Laden/Abspielen erst bei Nähe/Sichtbarkeit im FPV. Im Editor nur auf Klick abspielen.

#### VID-02: `.mp4` wird ohne Codec-Prüfung durchgereicht (P1, Code)
- **Beleg:** `upload.ts:322`, bei Endung `.mp4` wird **nicht** transkodiert. In Yol liegen `Marmara_Satellit_H.265_CQ22.mp4` und `…_VP9.mp4`. Laut Dateinamen HEVC bzw. VP9, per `ffprobe` verifizieren.
- **Folge:** HEVC spielt in Firefox und in Chrome ohne Hardware-Decoder nicht (schwarze Fläche). Hohe Bitraten ruckeln auf schwacher Hardware.
- **Lösung:** Codec per `ffprobe` prüfen und nur `h264 + yuv420p + ≤1080p + faststart` durchreichen. Sonst transkodieren mit `-vf "scale='min(1920,iw)':-2" -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart` (`upload.ts:114` ff.). Zusätzlich eine 720p-Variante für das Low-Preset. Backfill-Job für bestehende Videos.

#### VID-03: Transkodierung synchron im Request (P1, Code)
- **Beleg:** `processVideo` wartet im Request auf ffmpeg. Cloudflare bricht Origin-Requests nach **100 s** ab (HTTP 524), und der Request-Body ist je nach Plan auf **100 MB** begrenzt (Free/Pro).
- **Lösung:** Upload annehmen → Asset mit `status: 'processing'` sofort zurückgeben → Transkodierung als Hintergrund-Job (Queue, z. B. `p-queue` im Prozess oder BullMQ) → Client pollt bzw. zeigt „wird verarbeitet“. Große Dateien per Chunked/Resumable Upload (tus) oder am Cloudflare-Proxy vorbei über eine Upload-Subdomain.

---

### 4.6 Upload-Pipeline

#### UPL-01: Client-Resize ungenutzt (P1, Code)
- **Beleg:** `src/lib/imageUtils.ts:1` `processImage` wird nirgends importiert. `UploadPreviewModal` sendet das Original.
- **Lösung:** Vor dem Upload im Web Worker per `createImageBitmap` + `OffscreenCanvas` auf max. 2500 px (bzw. 4096 für Druck-Metadaten) → WebP 0,85. EXIF/DPI vorher auslesen und als Feld mitsenden, da der Server aktuell DPI aus dem Original liest. Alternative laut Projektplan: Mediabunny-Pipeline. Spart bei DSLR-JPEGs (20–40 MB) massiv Upload-Zeit.

#### UPL-02: Blockierendes Hashing (P1, Code)
- **Beleg:** `upload.ts:194` `fs.readFileSync` für SHA-256, dazu erneut in `processImage`. Bei großen Videos blockiert das den Event-Loop, und **alle** anderen Nutzer warten.
- **Lösung:** Stream-Hash (`fs.createReadStream().pipe(crypto.createHash('sha256'))`). Bild-Metadaten per `sharp(file).metadata()` statt Buffer.

#### UPL-03: Sequentielle Uploads (P2, Code)
- **Beleg:** `UploadPreviewModal.tsx:206` `for … await uploadOne`.
- **Lösung:** Parallelität 3 (Promise-Pool), Abbruch per `xhr.abort()`.

#### UPL-04: Keine Bild-Thumbnails/LOD-Varianten beim Upload (P1): siehe LOAD-04/LOAD-05.

#### UPL-05: DB speichert Original-Pixelmaße (P3, Info)
- **Beleg:** `imgMaxDim` in der DB = 10.630 px, ausgeliefert werden max. 2500 px. `width/height` stammen aus dem Original-Buffer vor dem Resize.
- **Hinweis:** Für die physische Größe (DPI-Fallback) korrekt. Für Textur-/Speicherbudgets **nicht** die DB-Maße verwenden. Optional Felder `storedWidth/storedHeight` ergänzen.

#### UPL-06: Doppelte API-Aufrufe beim Projektwechsel (P2, gemessen) → siehe API-01.

---

### 4.7 State, Sync & API

#### API-01: Doppelte/dreifache Requests (P2, gemessen)
- **Beleg:** Projektwechsel: `projects` ×2, `versions` ×3, `instances` ×2, `walls` ×2. Ursachen: `ProjectSelector` fetcht beim Mount und beim Öffnen des Dropdowns. `selectProject` + `triggerRefresh()` + `activeVersionId`-Wechsel triggern `PlacedArtworks.tsx:57` bzw. den Walls-Effekt jeweils separat. `EditorLayout` holt Versions beim Popover erneut.
- **Lösung:** Datenschicht mit Dedupe/Cache (TanStack Query, `staleTime` 30 s) oder zumindest `AbortController` + gemeinsamer Loader. Ein Endpoint `GET /api/versions/:id/scene` für Instanzen + Wände in einem Request.

#### STATE-01: Undo-Historie unbegrenzt (P2, Code)
- **Beleg:** `editorStore.ts:426` hängt bei jeder Änderung einen vollständigen Snapshot an `pastInstances`.
- **Lösung:** Auf 50 Einträge begrenzen (`slice(-50)`), bei Projektwechsel leeren (passiert teilweise in `setLocalInstances`).

#### STATE-02: Auto-Sync ohne Fehlerbehandlung/Retry (P1, Code)
- **Beleg:** `editorStore.ts:515` ff.: `fetch(...).catch(console.error)`. HTTP-Fehler (401/500) werden bei PATCH/DELETE nicht ausgewertet. Kein Retry, kein Nutzerhinweis.
- **Folge:** Stiller Datenverlust bei Netzabbruch oder abgelaufenem Token.
- **Lösung:** `res.ok` prüfen, fehlgeschlagene Operationen in eine Retry-Queue (exponentielles Backoff), Status-Badge „Gespeichert / Speichert … / Offline“, Toast bei dauerhaftem Fehler. `prevInstances` erst nach Erfolg fortschreiben.

#### STATE-03: Temporäre IDs `-Date.now()` (P3, Code)
- **Beleg:** `EditorPage.tsx:133`. Kollision bei zwei Platzierungen in derselben Millisekunde (z. B. Multi-Drop), laut `CLAUDE.md` bekannte Duplikat-Ursache.
- **Lösung:** Negativer Zähler (`--tempIdCounter`) oder `crypto.randomUUID()` als clientId-Feld.

#### STATE-04: Versionsspeichern mit N+1-Queries (P2, Code)
- **Beleg:** `server/src/routes/versions.ts:179`, pro Instanz `findUnique` + `findFirst` + ggf. `create` sequentiell.
- **Lösung:** Alle `assetId`s sammeln → ein `findMany` → fehlende Artworks per `createMany` → `createMany` für Instanzen, alles in einer Transaktion.

---

### 4.8 Aufräumen (P3)

| ID | Was | Wo |
|---|---|---|
| CLN-01 | Toter Code: `Satellit_old.tsx`, `ArtworkInstances.tsx` + `ArtworkInstanceMesh.tsx` (hardcodiert `http://localhost:3000`, `ArtworkInstanceMesh.tsx:31`), `imageUtils.ts` (falls UPL-01 anders gelöst wird) | `src/components/`, `src/lib/` |
| CLN-02 | `console.log("DEBUG: Main.tsx executing...")` | `src/main.tsx:8` |
| CLN-03 | `Dockerfile:62` `prisma db push` beim Start → auf `prisma migrate deploy` umstellen (Datensicherheit in Produktion) | `Dockerfile` |
| CLN-04 | `castShadow`/`receiveShadow` überall gesetzt, ohne Schattenlicht | `Satellit.tsx`, `ModularFrame.tsx`, `ModelInstance.tsx` |
| CLN-05 | Große Modelle aus `public/models` entfernen (LOAD-09) | `public/models/` |

---

## 5. Umsetzungsreihenfolge (Roadmap)

### Phase 0: Sicherheit & kaputte Workflows (sofort, klein)
`SEC-01`, `SEC-02`, `SEC-04`, `FUNC-01`, `FUNC-02`, danach `SEC-03`, `SEC-05`.
*Erwartung:* Kein unauthentifizierter Schreibzugriff mehr, Deep-Links und Reloads funktionieren.

### Phase 1: Quick Wins Ladezeit (je < 1 Tag)
`LOAD-06` (Cache-Header), `LOAD-02` (Preloads), `RND-03` (DPR-Cap), `RND-02` (frameloop demand + kein Rendern hinter Overlay), `VID-01` (preload metadata), `LOAD-03` (Satellit-GLB komprimieren), `LOAD-08` (Fonts/HDR lokal, Video), `LOAD-09`.
*Erwartung:* Startseite −22 MB, Editor-Leerlauf-GPU ≈ 0, Viewer-GLB −14 MB.

### Phase 2: Asset-Varianten & Code-Splitting
`LOAD-04` (Thumbnails + Backfill), `LOAD-01` (Route-Splitting, Rapier lazy), `UPL-01`, `UPL-02`, `API-01`.
*Erwartung:* Projektwechsel < 3 MB statt 42 MB. Start-JS < 250 KB br.

### Phase 3: Render-Pipeline für schwache Hardware
`RND-01` (Instancing), `LOAD-05` (Textur-LOD, ImageBitmap, verteilter Upload), `LOAD-07` (progressives Laden), `RND-06` (React-Commit), `RND-04` (Materialien/Licht), `RND-05` (Raycaster), `RND-08`, `RND-11` (Presets).
*Erwartung:* Draw Calls < 120, kein Long Frame > 200 ms (M2), GPU-Texturen Low < 300 MB, Viewer begehbar < 3 s.

### Phase 4: Upload/Video-Backend & Robustheit
`VID-02`, `VID-03`, `UPL-03`, `STATE-02`, `STATE-04`, `FUNC-03`, `FUNC-04`, `RND-07`, `RND-09`, `RND-10`, `SEC-06`, `SEC-07`, `STATE-01`, `STATE-03`, `CLN-*`.

### Performance-Budgets (Zielwerte für CI/Review)

| Metrik | Budget |
|---|---|
| JS initial (Home/Login) | ≤ 250 KB br |
| JS Viewer gesamt | ≤ 900 KB br (ohne Rapier-WASM, das separat lazy) |
| Viewer Time-to-Walkable (Mid-Laptop, Fast 4G, kalt) | ≤ 6 s |
| Längster Long Animation Frame beim Laden | ≤ 200 ms (M2) / ≤ 1 s (Low-End) |
| Draw Calls (Yol) | ≤ 120 |
| GPU-Texturspeicher | Low ≤ 300 MB, High ≤ 800 MB |
| Editor Leerlauf | 0 Renders/s |
| Netzwerk Projektwechsel (Yol) | ≤ 5 MB |

---

## 6. Messprotokoll (zum Nachmessen)

**Referenzbedingungen:** Chrome DevTools → Performance: CPU 4× Slowdown, Network „Fast 4G“, Cache deaktiviert für Kaltstart. Zusätzlich einmal auf echter iGPU-Hardware. Immer dieselbe Kuration **Yol**.

### 6.1 three.js-Renderer & Szene abgreifen (ohne Code-Änderung)
Auf `/` laden (SPA), dann in der Konsole ausführen. Das Snippet navigiert clientseitig, damit der Hook vor dem Renderer existiert:
```js
window.__cap = { scenes: [], renderers: [] };
const et = new EventTarget();
et.addEventListener('observe', (e) => {
  const o = e.detail;
  if (o?.isScene) __cap.scenes.push(o);
  else if (o?.info && o?.domElement) __cap.renderers.push(o);
});
window.__THREE_DEVTOOLS__ = et;
history.pushState({}, '', '/exhibition/yol');
dispatchEvent(new PopStateEvent('popstate'));
// später:
const r = __cap.renderers.at(-1);
({ calls: r.info.render.calls, textures: r.info.memory.textures, geometries: r.info.memory.geometries, programs: r.info.programs.length, dpr: r.getPixelRatio() });
```

### 6.2 Main-Thread-Blockaden
```js
performance.getEntriesByType('long-animation-frame')
  .map(e => ({ dur: Math.round(e.duration), block: Math.round(e.blockingDuration),
               scripts: e.scripts.map(s => `${s.invoker} ${Math.round(s.duration)}ms`) }));
```

### 6.3 Netzwerk-Summe nach Typ
```js
const g = {};
for (const e of performance.getEntriesByType('resource')) {
  const ext = (e.name.split('?')[0].match(/\.([a-z0-9]+)$/i) || [, 'api'])[1];
  (g[ext] ??= { n: 0, mb: 0 }).n++; g[ext].mb += e.encodedBodySize / 1e6;
}
g;
```

### 6.4 Leerlauf-Rendering prüfen
```js
const r = __cap.renderers.at(-1); const f0 = r.info.render.frame;
await new Promise(res => setTimeout(res, 2000));
r.info.render.frame - f0; // Ziel im Editor-Leerlauf: 0
```

### 6.5 Routen-Smoke-Test (Direktaufruf)
```bash
for p in / /login /exhibitions /exhibition /exhibition/yol /exhibition/yol/edit /exhibition/yol/assets /project /users; do printf "%-26s " "$p"; curl -s -o /dev/null -w "%{http_code}\n" "https://curahub.krullmann.com$p"; done
```
Erwartung: überall `200` mit `text/html`.

### 6.6 Baseline (13.09.2026, M2 Pro, warm)

| Metrik | Editor Yol | Viewer Yol |
|---|---|---|
| Fertig | 9,3 s | 8,1 s |
| Längster LoAF | 8,4 s | 7,5 s |
| Draw Calls | 661 | 579 |
| Texturen (GPU geschätzt) | 76 (1,6 GB) | 82 (1,76 GB) |
| Bild-Traffic | 42 MB | 20 MB |
| JS | 1,56 MB br | 1,56 MB br |

---

## 7. Abweichungen `CLAUDE.md` ↔ Code (für Agents wichtig)

| `CLAUDE.md` sagt | Realität |
|---|---|
| Client-seitiges Resize auf 2500 px WebP 80 % | `imageUtils.processImage` ungenutzt, Server resized (`upload.ts:282`, WebP 75) |
| Limits: Bild 10 MB, Video 200 MB, Modell 50 MB | Bild 200 MB, Video **unbegrenzt**, Modell 100 MB (`upload.ts:53-57`), Multer `Infinity` |
| `three-mesh-bvh`, BVH für Raycasts | Nicht in `package.json`, keine BVH im Einsatz |
| Kamera-Modi ortho/perspective/firstPerson im Editor | Ortho nicht implementiert, FPV-Toggle deaktiviert |
| Jede Route hat eigenes `authenticate` | Upload, Assets GET/DELETE und Artworks ohne Auth |
| Bug 1 (Auto-Save-Duplikate) offen | Mit `subscribe` + Temp-ID-Guard weitgehend adressiert, nicht reproduziert |
| Bug 2 (BoundingBox sichtbar) offen | Selektions-Halo ist konditional gerendert, nicht reproduziert |
| Bug 3 (Video-Lag) offen | `requestVideoFrameCallback` implementiert. Offen: `preload='auto'`, fehlender 1080p-Cap, Codec (VID-01/02) |
| Bug 4 (Light Leak) offen | Aktuell kein Schatten werfendes Licht aktiv, daher gegenstandslos. Relevant erst, wenn Schatten zurückkommen |
| Feature: 3D-Preview im Asset-Browser | Implementiert, aber ein WebGL-Context pro Karte (RND-09) |

---

## 8. Umsetzungsstand

### Welle 1 (13.09.2026): Phase 0 + Phase 1, **nicht committed**, nicht deployed

| ID | Status | Anmerkung |
|---|---|---|
| SEC-01 | ✅ | `authenticate` + `requireCurator` vor Multer, Projektzugriff via `userCanAccessProject`, Upload-Cap `UPLOAD_MAX_BYTES` (Default 2 GB). **Verhaltensänderung:** Collaborators mit Rolle `user` können nicht mehr hochladen. |
| SEC-02 | ✅ | Asset-DELETE nur Owner/Admin. Artworks POST/PUT/GET mit Auth + Projektprüfung. Legacy-Inline-Asset-Anlage nur Admin. |
| SEC-03 | ✅ | `GET /assets` nur mit Token, Nicht-Admins brauchen eine zugängliche `projectId`. |
| SEC-04 | ✅ | Dateiname `${ts36}-${uuid8}-${name}${ext}`. Bestehende Dateien bleiben unverändert. |
| SEC-05 | ✅ | Löscht `basename(asset.path)` + Thumbnail nur ohne weitere Referenz, mit Path-Traversal-Guard. |
| SEC-07 | ✅ | JSON 2 MB global, 10 MB auf Versions-Routen. CORS eingeschränkt, sobald `CORS_ORIGINS` gesetzt ist. |
| FUNC-01 | ✅ | Slug via `matchPath`, unbekannter Slug → Toast + Fallback, Back/Forward wechselt das Projekt. |
| FUNC-02 | ✅ | SPA-Fallback per `req.accepts(['json','html']) === 'html'`, sonst JSON-404. |
| FUNC-03 | ✅ | Ursache: `'orthographic'` hatte keine Kamera. Jetzt Toolbar-Button + `V`/`Escape`, `ViewModeControls.tsx` gelöscht. |
| FUNC-04 | ✅ | `hasUnsavedChanges` wird nach erfolgreichem Batch zurückgesetzt (`localEditSeq`). |
| STATE-01 | ✅ | Undo/Redo auf 50 begrenzt. |
| STATE-02 | ✅ | `res.ok`-Prüfung, Retry mit Backoff, `syncStatus`, ein Toast pro Fehlerphase, Auto-Retry (15 s → 2 min, `online`-Event). **Zusätzlich:** `Idempotency-Key` pro logischem Create (`server/src/lib/idempotency.ts`, In-Memory-Cache, 15 min TTL, nur Single-Process). Verhindert Duplikate, wenn eine Antwort verloren geht. |
| STATE-03 | ✅ | `nextTempId()` statt `-Date.now()` (sonst Kollision + Key-Replay). |
| API-01 | 🟡 | Nur `ProjectSelector` (Projekt-Cache 30 s, gemeinsamer Version-Resolver, AbortController). `PlacedArtworks`/Walls-Doppel-Fetches sind noch offen. |
| RND-02 | ✅ | Editor `frameloop`: FPV `always` / sonst `demand` / Assets-Route `never`. `FrameloopController` invalidiert bei Store-Änderungen. Viewer `always` nur mit Pointer-Lock + sichtbarem Tab. |
| RND-03 | ✅ | `dpr={[1, 1.5]}` in Editor + Viewer. |
| LOAD-02 | ✅ | Keine Modul-Preloads mehr, Preload im `useEffect` von Editor/Viewer (inkl. Satellit). |
| LOAD-03 | ✅ ⚠️ | `Satellit_new-optimized.glb` **2,22 MB** (vorher 16 MB) via `scripts/optimize-glb.mjs`. **Abweichung:** Texturen 1024 px statt 2048 px, weil die Roughness-PNG (Daten im Alpha-Kanal) sonst 5,8 MB ergab. **Visuell prüfen**, ggf. Farb-/Normal-Maps bei 2048 lassen. |
| LOAD-06 | ✅ | `immutable` für `/assets/*`, `no-cache` für `index.html`, 1 Tag + SWR für übrige `dist`-Dateien, 7 Tage `/uploads`. Cloudflare-Cache-Rules für `.glb` separat prüfen. |
| LOAD-08 | 🟡 | Albert Sans selbst gehostet (OFL beigelegt), Startseiten-Video 720p **1,38 MB** + Poster, verzögerter Start, `prefers-reduced-motion`/`saveData`. **Offen:** Drei-`Environment preset="warehouse"` lädt HDR von `raw.githack.com` (→ Welle 2 mit RND-09). |
| LOAD-09 | ✅ | 125 MB nach `_archive/` verschoben (`.gitignore` + `.dockerignore`). |
| VID-01 | ✅ | `preload='metadata'`, `invalidate()` im `requestVideoFrameCallback`. |
| CLN-01 | 🟡 | `Satellit_old.tsx`, `ArtworkInstances.tsx`, `ArtworkInstanceMesh.tsx` gelöscht. **Offen:** unbenutzte Root-Dateien `Satellit_new.jsx` / `Satellit_new.tsx`. |
| CLN-02 | ✅ | Debug-Log entfernt, `lang="de"`. |

**Verifikation Welle 1:**
- `npx tsc -p tsconfig.app.json --noEmit` ✅
- `cd server && npx tsc --noEmit` ✅
- `npm run build` ✅ (JS weiterhin **ein** Chunk, 4,76 MB / 1,61 MB gzip → LOAD-01)
- ESLint: **83 Errors** (HEAD-Baseline 87), keine neuen.
- **Nicht verifiziert:** Laufzeit im Browser (keine lokale DB/Docker aktiv), Messungen gemäß Abschnitt 6 nach Deploy wiederholen.

**Neue Hinweise aus Welle 1:**
- Root-`.env` enthält `NODE_ENV=production` → Vite-Warnung beim Build.
- `server/.env` ist in Git getrackt. Secrets prüfen, aus dem Repo entfernen und rotieren.
- `PlacedArtworks.tsx` rendert `InstanceTransformControls` auch im FPV-Modus (Gizmo eventuell sichtbar).
- Uploads > 100 MB scheitern hinter Cloudflare weiterhin (VID-03).
- Idempotency-Cache nur In-Memory: bei mehreren Server-Instanzen Redis/DB nötig.

### Welle 2 (13.09.2026): **nicht committed**, auf Testumgebung deployed

| ID | Status | Anmerkung |
|---|---|---|
| LOAD-01 | ✅ | Routen lazy. VersionPanel-Graph, Wiki und Dialoge laden erst beim Öffnen. Chunking per `advancedChunks` (`includeDependenciesRecursively: false`). **Startseite lädt ~148 KB gzip JS statt ~1.610 KB**, three/r3f/Rapier/xyflow/markdown lazy. |
| RND-08 | ✅ | `PhysicsLayer.tsx` ist der einzige Rapier-Import, im Editor nur in der Ego-Perspektive gemountet. Raum-Trimesh braucht `includeInvisible` (sonst kein Boden → Spieler fällt durch, bei der Integration gefunden und behoben). |
| RND-10 | ✅ | Materialien pro `ModelInstance` geklont + disposed. |
| LOAD-04 | ✅ | Server erzeugt `-thumb-256/512.webp`, Grids mit `srcSet`, `loading="lazy"`, `content-visibility`. Backfill `node dist/scripts/backfill-thumbnails.js --dry-run|--apply`: **Testumgebung 140/140 erzeugt (256er gesamt ≈ 1 MB statt 42 MB Originale)**. Produktion: nach Deploy ausführen. |
| UPL-01 | ✅ | Web-Worker verkleinert auf ≤ 2500 px (JPEG 0,92). `clientHash`, `originalWidth/Height`, `dpi` vom Original, Server nutzt sie für Duplikate + physische Größe. |
| UPL-02 | ✅ | Stream-Hash, `sharp().metadata()`. |
| UPL-03 | ✅ | 3 parallele Uploads, echtes `xhr.abort()`. |
| RND-09 | ✅ | Ein gemeinsamer Offscreen-Renderer + LRU-Cache für 3D-Vorschaubilder. |
| LOAD-08 | ✅ | Rest: kein externes HDR mehr, Draco-Decoder same-origin unter `public/draco/gltf/` (Thumbnail-Renderer, MetadataDialog, ModelInstance). |
| STATE-04 | ✅ | Versionsspeichern: Asset/Artwork-Abfragen gebündelt. |
| FUNC-02 (Nachtrag) | ✅ | SPA-Fallback pfadbasiert: Frontend-Routen liefern HTML für jeden `Accept`-Header (Link-Previews), API-Namespaces JSON-404. `X-Robots-Tag: noindex` für Editor/Assets/Projekt/Nutzer. |
| CLN-01 | ✅ | Root-Dateien `Satellit_new.jsx/.tsx` gelöscht, `.dockerignore` erweitert. |
| API-01 | ⏭️ | Rest verschoben auf Welle 3 (Konflikt mit Physik-Umbau in denselben Dateien). |

**Bei der Integration gefunden und behoben:**
- `manualChunks` ordnete React in `vendor-markdown` und den Scheduler in `vendor-r3f` ein, dadurch waren beide eager geladen → Umstellung auf `advancedChunks`.
- Raum-Collider leer (`traverseVisible`) → `includeInvisible`.
- Draco-Decoder kam noch von gstatic → lokal.
- Asset-Löschen hinterließ die 256er-Thumbnails → behoben.

**Verifikation Welle 2:**
- `npm run build` ✅, Server-`tsc` ✅.
- ESLint 85 Errors (Baseline 87). Neu: 2× `react-hooks/set-state-in-effect` in `VersionPanel.tsx`.
- Testumgebung: Routen-Matrix, 401, JSON-404, Draco-WASM, Thumbnails ✅.
- **Nicht verifiziert:** visuelles Laufen/Kollisionen und Editor-Flows. Automatisierte Browser-Tabs liefen unsichtbar (rAF/ResizeObserver gedrosselt), manueller Test nötig.

**Neu entdeckt (→ Welle 3):** Wird ein Viewer-Link in einem Hintergrund-Tab geöffnet, zeigt das Overlay sofort „Klicken zum Betreten“, obwohl die Szene noch nicht lädt (R3F startet erst bei sichtbarem Tab). Der Bereitschaftszustand sollte an den tatsächlichen Szenen-Ladezustand gekoppelt werden.

### Vorschlag Welle 3
Siehe Render-Pipeline: `RND-01`, `LOAD-05`, `LOAD-07`, `RND-06`, `RND-04`, `RND-05`, `RND-11`, `RND-07`, `API-01`, `VID-02/03`, `SEC-06` + Overlay-Bereitschaft (s. o.).

### (Archiv) Vorschlag Welle 2
`LOAD-01` (Route-Splitting, Rapier/React-Flow/Markdown lazy), `LOAD-04` (Bild-Thumbnails + Backfill-Skript, `loading="lazy"`, einheitlich `crossOrigin`), `UPL-01` (Client-Resize im Worker), `UPL-02` (Stream-Hash), `API-01` (Rest: Instances/Walls in einem Request), `RND-09` + lokales Environment-HDR, `CLN-01` (Rest).

### Später (nach Abschluss aller Wellen): WebGPU-Prototyp
Vom Nutzer vorgemerkt (13.09.2026). **Erst starten, wenn alle Performance-Wellen abgeschlossen sind.**
- Eigener Branch, Opt-in per `?renderer=webgpu` (three r181 `WebGPURenderer` über die asynchrone `gl`-Factory von R3F).
- Messung mit Yol auf M2 und iGPU-Laptop: Ladezeit, längster LoAF, FPS, GPU-Speicher, Draw Calls.
- Nur bei messbarem Vorteil per Feature-Erkennung aktivieren. Fallback bleibt der klassische `WebGLRenderer`, **nicht** das WebGL2-Backend des `WebGPURenderer`.
- Bekannte Hürden: drei `Grid` (Custom-Shader), RectAreaLight-Setup, `ShaderMaterial`/`onBeforeCompile`.
- Begründung für „später“: Die gemessenen Engpässe (React-Commit, Textur-Decode/-Upload, Texturspeicher) löst WebGPU nicht, und Geräte ohne WebGPU würden den weniger ausgereiften Pfad bekommen.
