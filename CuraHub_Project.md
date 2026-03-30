# CuraHub Project Summary

A 3D exhibition planner for HSBI (Hochschule Bielefeld) built with React, Three.js, and Express. Curators plan artwork placements in virtual exhibition rooms with real-time 3D preview, version history, and public viewer links.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 5.9, Vite |
| 3D Engine | Three.js 0.181 via @react-three/fiber + @react-three/drei |
| Physics | @react-three/rapier |
| State | Zustand 5 (with persist middleware for auth) |
| Styling | Tailwind CSS 3.4, Radix UI primitives, CVA + clsx + tailwind-merge |
| Routing | React Router DOM 7 |
| Backend | Express 5, TypeScript, CommonJS modules |
| Database | MySQL via Prisma 5.22 |
| Auth | JWT + bcryptjs |
| Validation | Zod 4 |
| Media | Sharp (images), fluent-ffmpeg (video), exif-parser |
| Upload | Multer with per-type size limits |

---

## Project Structure

```
CuraHub/
├── src/
│   ├── components/         # React + Three.js components
│   ├── pages/              # Route pages (Editor, Login, Home, Viewer)
│   ├── store/              # Zustand stores (editorStore, authStore)
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities (cn(), imageUtils)
│   ├── assets/             # Static assets, fonts
│   └── App.tsx             # Router with protected routes
├── server/
│   ├── src/
│   │   ├── routes/         # Express route handlers (per resource)
│   │   └── index.ts        # Server entry, middleware, static serving
│   ├── prisma/
│   │   └── schema.prisma   # Database schema
│   └── uploads/            # User-uploaded files
├── public/                 # Static 3D models, assets
├── vite.config.ts          # Dev proxy to Express, @ alias
├── tailwind.config.js      # Design tokens via CSS variables
└── docker-compose.yml      # MySQL container
```

---

## Coding Conventions

### TypeScript

- **Strict mode** enabled (`noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`)
- Union types for enums: `type PlannerViewMode = 'orthographic' | 'perspective' | 'firstPerson'`
- Zod schemas for all API request validation
- Path alias `@/*` maps to `src/*`

### Naming

- **PascalCase** for components: `ProjectSelector`, `ArtworkPlacement`
- **camelCase** for hooks, functions, variables: `useEditorStore`, `fetchProjects`
- **UPPER_SNAKE_CASE** for constants: `GL_CONFIG`, `JWT_SECRET`, `SIZE_LIMITS`
- **kebab-case** for file slugs and URL paths

### Components

- Functional components with hooks (no class components)
- Selective Zustand subscriptions to minimize re-renders:
  ```tsx
  const isDragging = useEditorStore((state) => state.dragState.isDragging);
  ```
- Radix UI primitives wrapped with CVA variants (shadcn/ui pattern):
  ```tsx
  const buttonVariants = cva("inline-flex items-center...", { variants: { ... } });
  ```
- `cn()` utility for conditional class merging (clsx + tailwind-merge)

### Styling

- Tailwind with CSS variable design tokens (`hsl(var(--primary))`)
- Dark mode via `class` strategy
- Custom fonts: Funnel Display (headings), Albert Sans (body)
- Semantic color scale: primary, secondary, muted, accent, destructive

---

## Architecture

### Frontend Data Flow

```
EditorLayout
├── Header (ProjectSelector, user menu)
├── Canvas (Three.js)
│   └── Scene
│       ├── PlannerCameraSystem (ortho/perspective/first-person)
│       ├── Lighting (ambient + directional + point, shadows)
│       ├── Grid (infinite grid, mode-dependent)
│       ├── PlacedArtworks → SelectableInstance → ModelInstance / VideoInstance
│       ├── ModularWallsController → ModularWallMesh
│       ├── RestrictionZones (OBB visualization)
│       └── ArtworkPlacement (ghost preview during drag)
├── AssetSidebar (left, collapsible)
├── PropertiesPanel (right, collapsible)
└── VersionPanel (center overlay)
```

### State Management

- **editorStore** — large single store covering UI state, camera, selection, transforms, instances, walls, restriction zones, undo/redo history, and drag state
- **authStore** — JWT token + user info with `persist` middleware (localStorage key: `curahub-auth`)
- **Auto-sync**: Zustand subscription watches `localInstances` changes, debounces (150ms), then diffs against previous state to PATCH/POST/DELETE only what changed
- **Undo/Redo**: full snapshot stacks (`pastInstances[][]`, `futureInstances[][]`)

### Transform System (Blender-style)

Keyboard shortcuts: `G` grab, `R` rotate, `S` scale, `X/Y/Z` axis lock, `Shift` fine-tune, `Esc` cancel. Implemented via Three.js TransformControls + custom ModalTransformSystem.

### Backend API

Routes mounted per resource at `/auth`, `/upload`, `/assets`, `/instances`, `/projects`, `/walls`, `/restrictions`, `/public`. Each route file defines its own `authenticate` middleware (JWT verification). Access control uses nested Prisma queries to verify ownership:

```ts
exhibition: { project: { ownerId: userId } }
```

### Database Schema (key models)

```
User → Project → Exhibition → ExhibitionVersion → ArtworkInstance
                    └→ Asset → Artwork ──────────────┘
ExhibitionVersion → ModularWall → ArtworkInstance (wall-mounted)
ExhibitionVersion → RestrictionZone
```

Versions support a `parent_version_id` for branching history.

### Media Pipeline

- **Images**: client-side resize to 2500px max as WebP 80%, server extracts EXIF
- **Video**: server transcodes to H.264 MP4 via ffmpeg, generates thumbnails
- **3D Models**: direct upload (GLB/GLTF/OBJ/FBX), 50MB limit
- Size limits: image 10MB, video 200MB, model 50MB

---

## Key Patterns

| Pattern | Implementation |
|---------|---------------|
| Selective store selectors | Individual property selectors instead of destructuring |
| Ref maps for 3D objects | `instanceRefMap`, `videoRefMap` (Map<number, THREE.Group>) |
| Debounced auto-sync | 150ms timeout, diff-based PATCH/POST/DELETE |
| Slug generation | Sanitize + collision avoidance + blocked slug list |
| Functional state updates | `set((state) => ({ ... }))` for immutability |
| Compound UI components | Card, Dialog, DropdownMenu via Radix + forwardRef |
| Protected routes | `<ProtectedRoute>` wrapper checking auth store |
| Vite dev proxy | All API paths proxied to `localhost:3000` |
