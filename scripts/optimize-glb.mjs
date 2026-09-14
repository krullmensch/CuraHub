#!/usr/bin/env node
/**
 * Optimizes public/models/Satellit_new.glb for the web:
 *   textureCompress(webp, max 1024px, quality 85) — geometry is written untouched,
 *   with a SEPARATE (non-interleaved) vertex layout.
 *
 *   IMPORTANT: gltf-transform's NodeIO writes INTERLEAVED vertex buffers by default.
 *   three's GLTFLoader turns those into InterleavedBufferAttributes whose `.array` is the
 *   whole mixed position/normal/uv buffer, and @react-three/rapier builds trimesh colliders
 *   from `geometry.attributes.position.array` — so an interleaved GLB produces phantom
 *   collision triangles (player spawned inside walls and could not move). dedup()/prune()
 *   were removed as well: the gain is negligible (size is dominated by textures) and the
 *   room geometry must stay identical to the Blender export.
 *
 * Uses the @gltf-transform/* packages and sharp that are already installed
 * as server-side dependencies (server/node_modules) — no new packages are
 * added to the frontend. No Draco/Meshopt/KTX2 is used here (those need
 * decoders from an external CDN, which this project avoids).
 *
 * Usage: node scripts/optimize-glb.mjs
 *
 * Related: docs/performance-audit-2026-09-13.md LOAD-03.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const serverPkg = path.join(repoRoot, 'server', 'package.json');

// Load the gltf-transform + sharp packages from server/node_modules without
// adding a dependency to the frontend package.json.
const requireFromServer = createRequire(serverPkg);
const { NodeIO, VertexLayout } = requireFromServer('@gltf-transform/core');
const { ALL_EXTENSIONS } = requireFromServer('@gltf-transform/extensions');
const { textureCompress } = requireFromServer('@gltf-transform/functions');
const sharp = requireFromServer('sharp');

// The unoptimized Blender export lives in _archive/ (moved out of public/, LOAD-09).
const INPUT = path.join(repoRoot, '_archive', 'models', 'Satellit_new.glb');
// Imported via src/lib/modelUrls.ts (?url) so Vite adds a content hash — do not move to public/.
const OUTPUT = path.join(repoRoot, 'src', 'assets', 'models', 'Satellit_new-optimized.glb');

// Node/mesh/material names referenced by src/components/Satellit.tsx.
// gltfjsx sanitizes node property keys by stripping non-word characters
// (e.g. glTF node "Decke.001" -> generated property "Decke001"), so we
// compare against a sanitized form of the node names read back from the
// output file. Material keys are used verbatim (bracket access), so those
// are compared as-is.
const EXPECTED_NODE_KEYS = [
  'Decke001',
  'Grundriss002',
  'Boden001',
  'Fenster001',
  'Traversen',
  'Tür2001',
  'Tür1001',
  'Fensterbank',
];
const EXPECTED_MATERIAL_NAMES = [
  'Material.005',
  'Wall Paint (White Wall Paint)',
  'Glass',
  'Material.004',
  'Material.006',
  'Black marble.001',
];

function sanitizeNodeName(name) {
  // Mirrors gltfjsx's identifier sanitization closely enough for our
  // comparison purposes: strip characters that aren't part of a valid JS
  // identifier segment (dots, spaces, etc.), keep any Unicode letters
  // (e.g. "Tür2.001" -> "Tür2001", matching the generated `Tür2001` key).
  return name.replace(/[^\p{L}\p{N}_$]/gu, '');
}

function fmtMB(bytes) {
  return (bytes / 1e6).toFixed(2) + ' MB';
}

async function main() {
  if (!fs.existsSync(INPUT)) {
    console.error(`Input not found: ${INPUT}`);
    process.exit(1);
  }

  const inputSize = fs.statSync(INPUT).size;
  console.log(`Input:  ${INPUT}`);
  console.log(`        ${fmtMB(inputSize)}`);

  // SEPARATE vertex layout is required for correct trimesh colliders (see header).
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setVertexLayout(VertexLayout.SEPARATE);
  const document = await io.read(INPUT);

  // Snapshot texture sizes before compression for the report.
  const beforeTextures = document
    .getRoot()
    .listTextures()
    .map((t) => ({ name: t.getName(), mime: t.getMimeType(), bytes: t.getImage()?.byteLength ?? 0 }));

  // NOTE: resize target is 1024px, not the 2048px initially attempted.
  // At 2048px + quality 85 the output was 5.76 MB (over the 2.5 MB budget)
  // because one roughness map (`garage_floor_rough_4k`) stores its data in
  // the alpha channel with a flat white RGB; sharp's webp encoder keeps
  // `alphaQuality` at its own default (100) regardless of the `quality`
  // option gltf-transform forwards for color data, so that channel barely
  // shrinks at any `quality` setting. Dropping to 1024px (textures tile via
  // KHR_texture_transform, so texel density stays adequate for architectural
  // surfaces viewed at room scale) resolves this and lands at ~2.2 MB.
  await document.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [1024, 1024],
      quality: 85,
      effort: 6,
    }),
  );

  const glb = await io.writeBinary(document);
  fs.writeFileSync(OUTPUT, glb);
  const outputSize = fs.statSync(OUTPUT).size;

  console.log(`\nOutput: ${OUTPUT}`);
  console.log(`        ${fmtMB(outputSize)}`);
  console.log(
    `\nTotal size: ${fmtMB(inputSize)} -> ${fmtMB(outputSize)} (${(100 * (1 - outputSize / inputSize)).toFixed(1)}% smaller)`,
  );

  const afterTextures = document
    .getRoot()
    .listTextures()
    .map((t) => ({ name: t.getName(), mime: t.getMimeType(), bytes: t.getImage()?.byteLength ?? 0 }));

  console.log('\nTextures:');
  const n = Math.max(beforeTextures.length, afterTextures.length);
  for (let i = 0; i < n; i++) {
    const b = beforeTextures[i];
    const a = afterTextures[i];
    console.log(
      `  ${a?.name ?? b?.name ?? '?'}: ${b ? `${b.mime} ${fmtMB(b.bytes)}` : '—'} -> ${a ? `${a.mime} ${fmtMB(a.bytes)}` : '—'}`,
    );
  }

  // ---- Verification: re-parse the written GLB's JSON chunk directly ----
  const outBuf = fs.readFileSync(OUTPUT);
  if (outBuf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error('Output is not a valid GLB (bad magic).');
  }
  const jsonChunkLength = outBuf.readUInt32LE(12);
  const jsonChunkType = outBuf.readUInt32LE(16);
  if (jsonChunkType !== 0x4e4f534a /* 'JSON' */) {
    throw new Error('Expected first GLB chunk to be JSON.');
  }
  const json = JSON.parse(outBuf.toString('utf8', 20, 20 + jsonChunkLength));

  const actualNodeNames = (json.nodes ?? []).map((n) => n.name).filter(Boolean);
  const actualSanitizedNodeKeys = new Set(actualNodeNames.map(sanitizeNodeName));
  const actualMaterialNames = new Set((json.materials ?? []).map((m) => m.name).filter(Boolean));

  console.log('\nVerification (parsed from output GLB JSON chunk):');

  let ok = true;
  for (const key of EXPECTED_NODE_KEYS) {
    const found = actualSanitizedNodeKeys.has(key);
    console.log(`  node "${key}": ${found ? 'OK' : 'MISSING'}`);
    if (!found) ok = false;
  }
  for (const name of EXPECTED_MATERIAL_NAMES) {
    const found = actualMaterialNames.has(name);
    console.log(`  material "${name}": ${found ? 'OK' : 'MISSING'}`);
    if (!found) ok = false;
  }

  const extensionsUsed = json.extensionsUsed ?? [];
  const hasTextureTransform = extensionsUsed.includes('KHR_texture_transform');
  console.log(`  KHR_texture_transform present: ${hasTextureTransform ? 'OK' : 'MISSING'}`);
  if (!hasTextureTransform) ok = false;

  // Confirm at least one material actually carries KHR_texture_transform data
  // (not just declared in extensionsUsed), matching "Black marble.001" in the source.
  const materialsWithTransform = (json.materials ?? []).filter((m) => {
    const info = m.pbrMetallicRoughness?.baseColorTexture;
    return info?.extensions?.KHR_texture_transform;
  });
  console.log(`  materials with KHR_texture_transform data: ${materialsWithTransform.length}`);
  if (materialsWithTransform.length === 0) ok = false;

  // Guard against regressions of the collider bug: no position buffer may be interleaved.
  const positionViews = new Set();
  for (const mesh of json.meshes ?? []) for (const prim of mesh.primitives) positionViews.add(json.accessors[prim.attributes.POSITION].bufferView);
  // A dedicated FLOAT vec3 view has byteStride 12 (or none); anything else means the view is interleaved.
  const interleaved = [...positionViews].filter((v) => { const stride = json.bufferViews[v].byteStride; return stride != null && stride !== 12; });
  console.log(`  position buffers interleaved: ${interleaved.length === 0 ? 'none (OK)' : interleaved.length + ' (BROKEN colliders)'}`);
  if (interleaved.length > 0) ok = false;

  if (outputSize > 2.6e6) {
    console.warn(`\nWARNING: output (${fmtMB(outputSize)}) exceeds the 2.5 MB target.`);
  }

  if (!ok) {
    console.error('\nVerification FAILED — see MISSING entries above.');
    process.exit(1);
  }
  console.log('\nVerification passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
