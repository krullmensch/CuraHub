# Live collaboration over WebSockets — Design Spec
**Date:** 2026-10-03
**Status:** Approved (in chat); step 1 (PR #10) and step 2 built

---

## Overview

Several curators can work on the same exhibition at once, but today nobody sees anybody else: auto-sync only writes (PATCH/POST/DELETE), never reads, so two people in the same version overwrite each other and only notice after a reload. This spec adds one WebSocket channel per browser tab that carries presence, edit claims ("Sperren") and live changes.

Decisions taken in chat:

- **Full collaboration.** Presence, claims and live changes, plus the others' selections, live drags and avatars in the 3D scene.
- **Presence on two levels.** In the editor: who is in which version (version graph) and who is in my version (header), with their mode (orbit, first person, 2D wall editor). In the public viewer: the number of visitors, and every visitor sees the others as **slimy blobs that trail behind when they move**.
- **Claim on select.** Selecting an artwork (single, multi, marquee, 2D wall editor) claims it; others cannot select or edit it until it is released.
- **Claimable:** artworks, modular walls, scale figures. Version actions (publish, merge, delete) are not blocked.
- **Release only by timeout** (besides deselect / leave / disconnect). No manual takeover, no "request release".

Out of scope: chat, comments, cursors on the 2D DOM panels, offline editing, operational transforms / CRDTs (claims make concurrent edits of one object impossible, so last-write-wins per object is enough), horizontal scaling (one Node process — see §1).

Delivery in steps, one PR each:

1. Channel + presence (editor and public visitor count), deployment config.
2. Claims, enforced on the server (423).
3. Live changes, undo history that only contains your own edits, resync on reconnect.
4. Others' selections and live drags, avatars in the editor scene.
5. Public viewer blobs.

---

## 1. Channel

- Library **`ws`** on the existing HTTP server (`server/src/live/`), path `/api/live` (and `/live`, which is what the Vite proxy forwards after stripping `/api`). No socket.io: we run exactly one Node process, so rooms and state live in memory and its fallbacks/adapters buy nothing.
- **One process ⇒ in-memory state.** Presence and claims are runtime state; after a server restart every client reconnects and re-announces. Should CuraHub ever run several instances, the hub would need a shared store (Redis pub/sub) — not planned.
- **Messages** are JSON objects `{ t: '<type>', … }`, validated with Zod on the server (`live/protocol.ts`). The client mirrors the types in `src/lib/live/protocol.ts`.
- **Handshake.** The upgrade is accepted unauthenticated (setup gate: 503 until setup is complete; Origin must be same-host, in `allowedOrigins`, or any origin outside production). The first message must be `hello` within 5 s: `{ t: 'hello', session, token? }`. The JWT travels in the message, never in the URL (URLs end up in proxy logs). Without a token the connection is anonymous and may only `visit`.
- **Session = tab.** The client creates `session` (UUID) once per page load and reuses it for every reconnect. Claims belong to sessions, so the same person in two tabs locks themselves out like anyone else. A session id is bound to the user who first used it; a different user presenting it gets refused.
- **Liveness.** The server pings every 15 s and terminates sockets that missed a pong. A closed session stays in presence for **10 s** (grace) so a reconnect doesn't flicker avatars or drop claims.
- **Reconnect.** Exponential backoff 1 → 15 s with jitter; on `open` the client sends `hello` and its current location again.
- REST requests from the editor carry `X-Live-Session: <session>` so the server can tell which tab made a change (claims in step 2, echo suppression in step 3).

### Messages (step 1)

Client → server:

| `t` | payload | who |
|---|---|---|
| `hello` | `session`, `token?` | everyone, first message |
| `where` | `exhibitionId`, `versionId \| null`, `mode` (`orbit` \| `firstPerson` \| `wallEditor`) | signed-in users with access to the exhibition |
| `visit` | `slug` | everyone (public viewer) |
| `leave` | — | leaves the current exhibition / visit |

Server → client:

| `t` | payload |
|---|---|
| `welcome` | `session`, `user` (`{ id, name, color }` or `null`) |
| `presence` | `exhibitionId`, `members: { session, userId, name, color, versionId, mode }[]`, `publicVisitors` |
| `visitors` | `count` (to visitors of a published exhibition) |
| `error` | `code`, `message` (German) |

Close codes: `4401` bad/missing token where one is needed, `4403` no access, `4408` no `hello` in time, `4409` session id belongs to someone else.

`name` is the local part of the e-mail (as in the header), `color` is picked from a fixed palette by user id (same person, same colour in every tab).

---

## 2. Presence (step 1)

- **Editor:** `startEditorPresence()` (started by EditorLayout) watches `activeExhibitionId`, `activeVersionId`, `plannerViewMode` and `wallEditor` and sends `where` when they change. Members arrive as one `presence` list per exhibition (small: a handful of people).
- **Header:** avatar stack of the other people in my version (initial + colour, tooltip name + mode), then "+N in anderen Versionen", then "N im Viewer" when visitors are in the published version. One avatar per person even with several tabs.
- **Version graph:** `VersionNode` shows up to three small avatars of the people in that version (read straight from `liveStore`, no change to `buildVersionGraph`).
- **Public viewer:** `ViewerPage` sends `visit` with its slug and shows "N Personen in der Ausstellung" (including you) once more than one person is there. The server resolves the slug to the published version; unpublished exhibitions are refused.
- **Store:** `src/store/liveStore.ts` (Zustand) holds `status`, `self`, `members`, `publicVisitors`, `visitorCount`. Pure helpers (grouping by version, dedupe by user, labels) in `src/lib/live/presence.ts` with Vitest.

---

## 3. Claims (step 2)

Named **claims** in code because `ModularWall.isLocked` ("Wand fixieren") already exists.

- Keys: `instance:<id>`, `wall:<id>`, `figure:<id>`. Temp ids (negative, not yet POSTed) are never claimed — nobody else knows them yet; the claim is taken when the id is remapped.
- One message, `claim { seq, groups: string[][] }`: the **full set** the tab wants, in all-or-nothing groups (keys left out are released, so there is no separate `release` and a reconnect simply re-sends the set). Answer `claimed { seq, granted, denied: { key, holder }[] }` (`granted` = everything the tab holds afterwards); the server broadcasts `claims { versionId, entries: { key, session, userId, name, color }[] }` to the version's editors on every change and to each editor entering the version. A refused group keeps the keys the tab already held in it (a claimed wall stays claimed when someone else's artwork is hung on it later). New keys are checked against the version (`keysInVersion`), so nobody can lock objects of exhibitions they cannot see. Messages of one socket are handled in order, so a `claim` right behind a `where` sees the new location.
- **Select = claim.** All selection actions (`setInstanceSelection`, `pickInstance`, marquee, ⌘A, sidebar list, wall editor selection, `selectWall`, `selectFigure`) filter out keys held by others before they change the selection, and show a toast "Wird gerade von Anna bearbeitet". The request is optimistic: the selection is applied at once, and keys the server denies (race) are removed again.
- **Walls carry their artworks.** Claiming a wall also claims the instances hanging on it (`wallId`); a wall cannot be claimed while another session holds one of its instances.
- **Release:** deselect, version switch, leaving, disconnect after the 10 s grace, and **5 min without input** in the tab (pointer/key/wheel activity resets it; the client clears its selection). No manual takeover. Deselected keys linger 800 ms (and while auto-sync is still saving, `ClaimSync`) so the last PATCH reaches the server before someone else can claim the object.
- **Server enforcement:** `PATCH`/`DELETE` on `/instances/:id`, `/walls/:id`, `/scale-figures/:id` answer **423** `{ error: 'Wird gerade von … bearbeitet' }` when another session holds the key. Requests without `X-Live-Session` (old tabs, scripts) are treated as "no session" and also refused on claimed objects. Auto-sync treats 423 like a conflict: it drops its local change for that object and takes the server state (step 3 delivers it).
- **Undo/redo** skip objects claimed by others: the restored snapshot keeps those artworks as they are now (`keepHeldInstances`).
- **UI:** a click on a held object changes nothing and shows a warning toast (same hint at most every 2.5 s); the sidebar's "Im Raum" list dims held artworks and shows the holder's avatar. Avatars (header, version graph, holder badges) are `boring-avatars` "beam" faces seeded by name, in tints of the person's colour with a ring in that colour; the own avatar sits next to the name in the header.

---

## 4. Live changes (step 3)

- After every successful write the server sends `changed { versionId, kind: 'instance' | 'wall' | 'figure' | 'wallLayout', op: 'upsert' | 'delete', data }` to the version room, **except the session named in `X-Live-Session`**. `data` is the same row shape the REST routes return. Version-level events (`version.created/deleted/published/merged`) go to the exhibition room so every open version graph refreshes.
- Client: `applyRemoteChange` in editorStore, pure logic in `src/lib/live/remoteChanges.ts`:
  - writes the row into `localInstances` **and** into auto-sync's `prevInstances` snapshot, so the change is not sent back;
  - writes it into **every** snapshot of `pastInstances`/`futureInstances` (upsert = replace or insert, delete = remove). Undo can then never revert, resurrect or delete someone else's work — the history only ever differs in your own edits. Same for walls and figures.
  - leaves objects alone that the local tab currently claims (cannot happen for upserts thanks to claims; a remote delete of a claimed object can — the delete wins, the selection is dropped with a toast).
- **Reconnect / missed events:** every `changed` carries a per-version sequence number. A gap or a reconnect makes the client fetch the version again and merge it through the same function (no history reset).
- Version deleted while you are in it → toast and back to the version list. Version published / merged → the graph refreshes.

---

## 5. Others in the editor scene (step 4)

- **Selections:** `SelectionOutline` draws other sessions' claims in their colour with a small name label; walls and figures likewise.
- **Live drags:** while transforming, the client sends `drag { keys, transforms }` at most 15 Hz (from `liveTransform` / group delta / wall editor draft); receivers move the Three.js groups directly (no store writes, like `applyDraft`) and drop the preview on the final `changed`.
- **Avatars:** camera pose (`pose { position, yaw, pitch }`, ≤ 10 Hz, only when it moved) — in first person as the scale figure model (`scale-figure.glb`) in the user's colour at the player's position; in orbit view as a small camera marker with name. Hidden in the 2D wall editor.

---

## 6. Public viewer blobs (step 5)

- Visitors send their position (`pose`, ≤ 10 Hz) inside `visit`; the server relays to the other visitors of that exhibition only. Anonymous: a random visitor id per connection, no names.
- Each blob: a soft, glossy, slightly translucent drop at about chest height. A few spheres (head + 3–4 trailing segments) follow each other with spring damping, so the body stretches and lags behind when it moves and wobbles back when it stops; merged into one smooth surface with a metaball/SDF shader (TSL on WebGPU, GLSL on WebGL) or, simpler first cut, overlapping spheres with a shared material.
- Positions are interpolated on the receiving side (≈100 ms buffer) so 10 Hz updates move smoothly. Blobs fade out after 10 s without updates.
- Counter "N Personen in der Ausstellung" stays.

---

## Testing

- Server (Jest): the hub is plain TypeScript with injected `send` and access resolvers (`live/hub.ts`) — handshake, access, presence lists, grace timers (fake timers), claims and enforcement without sockets. One integration test starts the real `ws` server on a random port and talks to it with a `ws` client.
- Client (Vitest): `src/lib/live/*` (presence grouping, protocol parsing, remote change merge into history snapshots, claim filtering of selections).
- Manual: two browsers on the dev stack, `?renderer=webgl` in one.

## Deployment

- Vite dev proxy: `ws: true` on `/api`.
- Apache: `ProxyPass / http://127.0.0.1:3000/ nocanon upgrade=websocket` (mod_proxy_http handles the upgrade since 2.4.47; older Apache needs `mod_proxy_wstunnel`). `docs/deployment.md` and `deploy/apache/curahub.conf` get the change.
- Cloudflare tunnels pass WebSockets without configuration.
