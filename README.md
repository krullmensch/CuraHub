# CuraHub

CuraHub ist eine Plattform zur Planung und Visualisierung von Ausstellungen in einem digitalen Raum. Ich habe das Projekt während meines Studiums entwickelt, um Kuratoren Werkzeuge für die virtuelle Raumgestaltung zur Verfügung zu stellen. Das System nutzt das Modell "Satellit" als Basisraum und erlaubt die Platzierung von Kunstwerken sowie die Erstellung modularer Wände.

## Kernfunktionen

### 3D-Editor und Visualisierung
- Raumplanung durch interaktive Platzierung von Objekten an Wänden (Raycasting).
- Modulare Wand-Elemente mit Anpassung der Position, Rotation und Dimension.
- Multi-Mode Kamera für den Wechsel zwischen Planer-Ansicht (Orbit/Top-Down) und First-Person-Perspektive.
- Physik-Engine Rapier für die Kollisionsabfrage und realistische Fortbewegung im Raum.

### Asset-Pipeline
- Support für Bilder, Videos (MP4) und 3D-Modelle (GLB/GLTF).
- Automatisierte Skalierung und Kompression von Bildern mit Sharp.
- Video-Transcoding und Extraktion von Thumbnails via FFmpeg.
- Extraktion von physischen Dimensionen und Metadaten zur korrekten Maßstabsdarstellung.

### Architektur und Sicherheit
- Integration von HSBI SSO zur Authentifizierung mit Hochschul-Accounts.
- Rollenbasiertes Rechtesystem (RBAC) mit den Stufen User, Curator, Prof und Admin.
- Versionskontrolle für Ausstellungsentwürfe mit Veröffentlichungs-Workflow.

## Technischer Stack

Ich habe für CuraHub einen modernen Full-Stack gewählt:
- Frontend: React, TypeScript, Vite.
- 3D-Rendering: Three.js, React Three Fiber (R3F), React Three Drei.
- State-Management: Zustand.
- Backend: Node.js, Express, Prisma ORM.
- Datenbank: MariaDB (via Docker).
- Styling: TailwindCSS, shadcn/ui.

## Projektstruktur

```text
├── server/               # Express Backend & Prisma Schema
│   ├── prisma/           # Datenbank-Migrationen und Seeding
│   └── src/              # API-Routen, Middleware und Asset-Logik
├── src/                  # React Frontend
│   ├── components/       # 3D-Komponenten und UI-Elemente
│   ├── store/            # Zustand-Stores (Editor, Auth)
│   └── pages/            # Routen-Views (Editor, Dashboard, Public)
└── public/               # Statische Assets und 3D-Modelle (GLB)
```

## Setup

### Voraussetzungen
Du brauchst Node.js (v18+), Docker für die Datenbank und FFmpeg für die Video-Verarbeitung auf deinem System.

### Installation
1. Repository klonen.
2. Dependencies im Hauptverzeichnis und im server-Ordner installieren: `npm install && cd server && npm install`.
3. Docker-Container für die Datenbank starten: `docker-compose up -d`.
4. Umgebungsvariablen in `server/.env` setzen (DATABASE_URL, JWT_SECRET).
5. Prisma-Migrationen ausführen: `npx prisma migrate dev`.

### Start
- Server: `cd server && npm run dev`
- Frontend: `npm run dev`

## Entwicklung (AI-Driven Development)
Das Projekt nutzt einen KI-gestützten Workflow. Die KI diente als Junior-Entwickler für die Implementierung technischer Details und Boilerplate-Code, während ich die Architektur entworfen und die logische Struktur des Codes validiert habe. Dieser Ansatz ermöglichte eine schnelle Umsetzung komplexer 3D-Features in einem modernen Tech-Stack.
