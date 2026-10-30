import * as THREE from 'three'

export interface PrepareOptions {
  maxTexture: number
}

/** Size of an image whose longest side is at most `max`, aspect kept. */
export function cappedSize(w: number, h: number, max: number): [number, number] {
  const longest = Math.max(w, h)
  if (longest <= max) return [w, h]
  const k = max / longest
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}

function isDropped(o: THREE.Object3D): boolean {
  if (!o.visible) return true
  const u = o.userData
  if (u.splat || u.hitProxy || u.selectionBounds) return true
  const flags = o as unknown as Record<string, unknown>
  if (flags.isLine || flags.isPoints || flags.isSprite || flags.isLight || flags.isCamera) return true
  return o.type.endsWith('Helper')
}

function localMatrix(o: THREE.Object3D): THREE.Matrix4 {
  return o.matrixAutoUpdate
    ? new THREE.Matrix4().compose(o.position, o.quaternion, o.scale)
    : o.matrix.clone()
}

type Sized = { width?: number; height?: number }

type PixelData = { data?: unknown; width?: number; height?: number }

/**
 * A DataTexture with 8-bit RGBA pixels (generated frame grain, the passepartout's paper normals)
 * as a canvas texture: USDZExporter only reads images and canvases and throws on raw data. Row 0
 * of the data becomes the canvas' top row and flipY stays false, so the UVs keep their meaning.
 */
function canvasFromData(tex: THREE.Texture): THREE.Texture {
  const img = tex.image as PixelData | null | undefined
  if (!img || !(img.data instanceof Uint8Array || img.data instanceof Uint8ClampedArray)) return tex
  if (tex.format !== THREE.RGBAFormat || tex.type !== THREE.UnsignedByteType) return tex
  const { width, height } = img
  if (!width || !height || img.data.length < width * height * 4) return tex
  if (typeof document === 'undefined' || typeof ImageData === 'undefined') return tex
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) return tex
  const pixels = new Uint8ClampedArray(width * height * 4)
  pixels.set(img.data.subarray(0, width * height * 4))
  ctx.putImageData(new ImageData(pixels, width, height), 0, 0)
  const out = new THREE.Texture().copy(tex)
  out.source = new THREE.Source(canvas)
  out.needsUpdate = true
  return out
}

/** Redraws a texture at the capped size; returns the original where that is not possible (no DOM, no drawable image). */
function cappedTexture(original: THREE.Texture, max: number, cache: Map<THREE.Texture, THREE.Texture>): THREE.Texture {
  const hit = cache.get(original)
  if (hit) return hit
  const tex = canvasFromData(original)
  let out = tex
  const img = tex.image as (Sized & CanvasImageSource) | null | undefined
  if (img && typeof document !== 'undefined' && img.width && img.height) {
    const [w, h] = cappedSize(img.width, img.height, max)
    if (w !== img.width || h !== img.height) {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (ctx) {
        try {
          ctx.drawImage(img, 0, 0, w, h)
          // clone() shares the Source with the original; give the copy its own
          out = tex.clone()
          out.source = new THREE.Source(canvas)
          out.needsUpdate = true
        } catch {
          out = tex
        }
      }
    }
  }
  cache.set(original, out)
  return out
}

/** Whether the texture was a PNG to begin with (flag set by the texture manager, or the image's URL). */
function sourceIsPng(t: THREE.Texture): boolean {
  if (t.userData.mimeType === 'image/png') return true
  const src = (t.image as { src?: unknown } | null | undefined)?.src
  return typeof src === 'string' && (/^data:image\/png/i.test(src) || /\.png(\?|#|$)/i.test(src))
}

/**
 * The texture with an explicit `userData.mimeType`, so GLTFExporter never falls back to the
 * source's own format (WebP would add the required EXT_texture_webp, which Scene Viewer rejects).
 * Always a copy, so the live scene's texture keeps its userData; copies are shared per format.
 */
function withMimeType(
  t: THREE.Texture,
  png: boolean,
  variants: Map<THREE.Texture, THREE.Texture>,
): THREE.Texture {
  const hit = variants.get(t)
  if (hit) return hit
  const out = t.clone()
  out.userData = { ...t.userData, mimeType: png ? 'image/png' : 'image/jpeg' }
  variants.set(t, out)
  return out
}

function convertMaterial(
  mat: THREE.Material,
  max: number,
  textures: Map<THREE.Texture, THREE.Texture>,
  variants: { png: Map<THREE.Texture, THREE.Texture>; jpeg: Map<THREE.Texture, THREE.Texture> },
): THREE.Material {
  let out: THREE.Material
  if ((mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
    const b = mat as THREE.MeshBasicMaterial
    out = new THREE.MeshStandardMaterial({
      map: b.map,
      color: b.color,
      roughness: 1,
      metalness: 0,
      transparent: b.transparent,
      opacity: b.opacity,
      side: b.side,
      alphaMap: b.alphaMap,
      alphaTest: b.alphaTest,
      vertexColors: b.vertexColors,
      depthWrite: b.depthWrite,
      depthTest: b.depthTest,
    })
    out.name = b.name
  } else {
    out = mat.clone()
  }
  const slots = out as unknown as Record<string, THREE.Texture | null | undefined>
  const colourAlpha = (out.transparent && out.opacity < 1) || out.alphaTest > 0
  // Every texture the material holds (specular, clearcoat, sheen, ... included), not a fixed list:
  // GLTFExporter writes all of them and any one left unflagged could come out as WebP.
  for (const slot of Object.keys(out)) {
    const t = slots[slot]
    if (!t || !(t as THREE.Texture).isTexture) continue
    const png = slot === 'alphaMap' || sourceIsPng(t) || (slot === 'map' && colourAlpha)
    slots[slot] = withMimeType(cappedTexture(t, max, textures), png, png ? variants.png : variants.jpeg)
  }
  return out
}

/**
 * Flattens the rendered scene into a plain group of meshes for the exporters: world
 * transforms baked (relative to `root`), instances expanded, non-exportable objects
 * dropped, materials made PBR, textures capped. `root` is never changed.
 */
export function prepareExportScene(root: THREE.Object3D, opts: PrepareOptions): THREE.Group {
  const out = new THREE.Group()
  out.name = 'ArExport'
  const materials = new Map<THREE.Material, THREE.Material>()
  const textures = new Map<THREE.Texture, THREE.Texture>()
  const variants = { png: new Map<THREE.Texture, THREE.Texture>(), jpeg: new Map<THREE.Texture, THREE.Texture>() }

  const material = (m: THREE.Material | THREE.Material[]) => {
    const one = (x: THREE.Material) => {
      let c = materials.get(x)
      if (!c) {
        c = convertMaterial(x, opts.maxTexture, textures, variants)
        materials.set(x, c)
      }
      return c
    }
    return Array.isArray(m) ? m.map(one) : one(m)
  }

  const add = (src: THREE.Mesh, world: THREE.Matrix4, name: string) => {
    const mesh = new THREE.Mesh(src.geometry, material(src.material))
    mesh.name = name
    mesh.matrixAutoUpdate = false
    mesh.matrix.copy(world)
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale)
    out.add(mesh)
  }

  const walk = (o: THREE.Object3D, parent: THREE.Matrix4) => {
    if (isDropped(o)) return
    const world = parent.clone().multiply(localMatrix(o))
    const mesh = o as THREE.Mesh
    const inst = o as THREE.InstancedMesh
    if (inst.isInstancedMesh) {
      const m = new THREE.Matrix4()
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m)
        // Hidden or skipped works collapse their frame instance to a zero matrix.
        if (m.determinant() === 0) continue
        add(inst, world.clone().multiply(m), `${o.name || 'instance'}-${i}`)
      }
    } else if (mesh.isMesh) {
      add(mesh, world, o.name)
    }
    for (const c of o.children) walk(c, world)
  }
  walk(root, new THREE.Matrix4())
  return out
}
