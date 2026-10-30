import { afterEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { cappedSize, prepareExportScene } from './prepareScene'

const meshesOf = (g: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = []
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh)
  })
  return out
}

const box = (material: THREE.Material = new THREE.MeshStandardMaterial()) =>
  new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)

describe('cappedSize', () => {
  it('scales down keeping the aspect', () => {
    expect(cappedSize(4000, 2000, 2048)).toEqual([2048, 1024])
    expect(cappedSize(1000, 3000, 1500)).toEqual([500, 1500])
  })
  it('keeps small images', () => {
    expect(cappedSize(500, 300, 2048)).toEqual([500, 300])
  })
})

describe('prepareExportScene', () => {
  it('expands an InstancedMesh into one mesh per instance with world positions', () => {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 3)
    for (let i = 0; i < 3; i++) inst.setMatrixAt(i, new THREE.Matrix4().makeTranslation(i, 0, 0))
    const parent = new THREE.Group()
    parent.position.set(0, 2, 0)
    parent.add(inst)
    const root = new THREE.Group()
    root.add(parent)
    const out = prepareExportScene(root, { maxTexture: 2048 })
    const meshes = meshesOf(out)
    expect(meshes).toHaveLength(3)
    expect(meshes.every((m) => !(m as unknown as THREE.InstancedMesh).isInstancedMesh)).toBe(true)
    const pos = meshes.map((m) => new THREE.Vector3().setFromMatrixPosition(m.matrix).toArray())
    expect(pos).toEqual([[0, 2, 0], [1, 2, 0], [2, 2, 0]])
    expect(meshes[0].geometry).toBe(inst.geometry)
  })

  it('skips instances collapsed to a zero matrix (hidden works)', () => {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 3)
    inst.setMatrixAt(0, new THREE.Matrix4().makeTranslation(1, 0, 0))
    inst.setMatrixAt(1, new THREE.Matrix4().makeScale(0, 0, 0))
    inst.setMatrixAt(2, new THREE.Matrix4().makeTranslation(3, 0, 0))
    const meshes = meshesOf(prepareExportScene(new THREE.Group().add(inst), { maxTexture: 2048 }))
    expect(meshes.map((m) => new THREE.Vector3().setFromMatrixPosition(m.matrix).x)).toEqual([1, 3])
  })

  it('keeps geometry groups and material arrays of instanced frames', () => {
    const geo = new THREE.BoxGeometry()
    const mats = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()]
    const inst = new THREE.InstancedMesh(geo, mats, 1)
    const root = new THREE.Group().add(inst)
    const [m] = meshesOf(prepareExportScene(root, { maxTexture: 2048 }))
    expect(Array.isArray(m.material)).toBe(true)
    expect((m.material as THREE.Material[]).length).toBe(2)
    expect(m.geometry.groups.length).toBe(geo.groups.length)
  })

  it('drops invisible objects and their children', () => {
    const root = new THREE.Group()
    const hidden = new THREE.Group()
    hidden.visible = false
    hidden.add(box())
    root.add(hidden, box())
    expect(meshesOf(prepareExportScene(root, { maxTexture: 2048 }))).toHaveLength(1)
  })

  it('drops splats, hit proxies, selection bounds, helpers, lines, points and sprites', () => {
    const root = new THREE.Group()
    for (const key of ['splat', 'hitProxy', 'selectionBounds']) {
      const m = box()
      m.userData[key] = true
      root.add(m)
    }
    root.add(new THREE.Box3Helper(new THREE.Box3()))
    root.add(new THREE.Line(new THREE.BufferGeometry()))
    root.add(new THREE.Points(new THREE.BufferGeometry()))
    root.add(new THREE.Sprite())
    root.add(box())
    expect(meshesOf(prepareExportScene(root, { maxTexture: 2048 }))).toHaveLength(1)
  })

  it('converts MeshBasicMaterial to MeshStandardMaterial with the same map', () => {
    const map = new THREE.Texture()
    const basic = new THREE.MeshBasicMaterial({ map, color: 0xff0000 })
    const root = new THREE.Group().add(box(basic))
    const [m] = meshesOf(prepareExportScene(root, { maxTexture: 2048 }))
    const mat = m.material as THREE.MeshStandardMaterial
    expect(mat.type).toBe('MeshStandardMaterial')
    expect(mat.map!.source).toBe(map.source)
    expect(mat.color.getHex()).toBe(0xff0000)
    expect(mat.roughness).toBe(1)
    expect(mat.metalness).toBe(0)
  })

  it('carries over name, transparency, side, vertex colours and depthWrite', () => {
    const basic = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0.4,
      side: THREE.DoubleSide,
      vertexColors: true,
      depthWrite: false,
    })
    basic.name = 'glass'
    const [m] = meshesOf(prepareExportScene(new THREE.Group().add(box(basic)), { maxTexture: 2048 }))
    const mat = m.material as THREE.MeshStandardMaterial
    expect(mat.name).toBe('glass')
    expect(mat.transparent).toBe(true)
    expect(mat.opacity).toBe(0.4)
    expect(mat.side).toBe(THREE.DoubleSide)
    expect(mat.vertexColors).toBe(true)
    expect(mat.depthWrite).toBe(false)
  })

  describe('texture capping', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('redraws once into its own source and leaves the original untouched', () => {
      const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }
      vi.stubGlobal('document', { createElement: () => canvas })
      const image = { width: 4000, height: 2000 }
      const tex = new THREE.Texture(image as unknown as HTMLImageElement)
      const source = tex.source
      const a = new THREE.MeshBasicMaterial({ map: tex })
      const b = new THREE.MeshStandardMaterial({ map: tex })
      const root = new THREE.Group().add(box(a), box(b))
      const meshes = meshesOf(prepareExportScene(root, { maxTexture: 2048 }))
      const ma = (meshes[0].material as THREE.MeshStandardMaterial).map!
      const mb = (meshes[1].material as THREE.MeshStandardMaterial).map!
      expect(ma).toBe(mb)
      expect(ma).not.toBe(tex)
      expect(ma.image).toBe(canvas)
      expect([canvas.width, canvas.height]).toEqual([2048, 1024])
      expect(tex.source).toBe(source)
      expect(tex.image).toBe(image)
    })

    it('turns 8-bit RGBA data textures into canvases (USDZExporter reads no raw data)', () => {
      const put: unknown[] = []
      const canvas = { width: 0, height: 0, getContext: () => ({ putImageData: (d: unknown) => put.push(d), drawImage: () => {} }) }
      vi.stubGlobal('document', { createElement: () => canvas })
      vi.stubGlobal('ImageData', class {
        data: Uint8ClampedArray
        constructor(data: Uint8ClampedArray) {
          this.data = data
        }
      })
      const data = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255])
      const tex = new THREE.DataTexture(data, 2, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
      tex.wrapS = THREE.RepeatWrapping
      tex.colorSpace = THREE.SRGBColorSpace
      const [m] = meshesOf(prepareExportScene(new THREE.Group().add(box(new THREE.MeshStandardMaterial({ map: tex }))), { maxTexture: 2048 }))
      const out = (m.material as THREE.MeshStandardMaterial).map!
      expect(out.image).toBe(canvas)
      expect([canvas.width, canvas.height]).toEqual([2, 1])
      expect(put).toHaveLength(1)
      expect(Array.from((put[0] as { data: Uint8ClampedArray }).data)).toEqual(Array.from(data))
      expect(out.flipY).toBe(false)
      expect(out.wrapS).toBe(THREE.RepeatWrapping)
      expect(out.colorSpace).toBe(THREE.SRGBColorSpace)
      expect(tex.image.data).toBe(data)
    })

    it('leaves data textures it cannot read as they are', () => {
      vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
      const tex = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
      const [m] = meshesOf(prepareExportScene(new THREE.Group().add(box(new THREE.MeshStandardMaterial({ map: tex }))), { maxTexture: 2048 }))
      const out = (m.material as THREE.MeshStandardMaterial).map!
      expect(out.image).toBe(tex.image)
    })
  })

  describe('texture mime types (GLTFExporter must never write WebP)', () => {
    const mimeOf = (m: THREE.Material, slot: 'map' | 'alphaMap') =>
      ((m as THREE.MeshStandardMaterial)[slot] as THREE.Texture).userData.mimeType
    const prep = (m: THREE.Material) =>
      meshesOf(prepareExportScene(new THREE.Group().add(box(m)), { maxTexture: 2048 }))[0].material as THREE.Material

    it('turns a WebP-flagged texture into JPEG without touching the original', () => {
      const tex = new THREE.Texture()
      tex.userData.mimeType = 'image/webp'
      expect(mimeOf(prep(new THREE.MeshStandardMaterial({ map: tex })), 'map')).toBe('image/jpeg')
      expect(tex.userData.mimeType).toBe('image/webp')
    })

    it('gives textures without any flag an explicit JPEG', () => {
      const tex = new THREE.Texture()
      expect(mimeOf(prep(new THREE.MeshStandardMaterial({ map: tex })), 'map')).toBe('image/jpeg')
      expect(tex.userData.mimeType).toBeUndefined()
    })

    it('flags extension slots too (specular, clearcoat)', () => {
      const spec = new THREE.Texture()
      spec.userData.mimeType = 'image/webp'
      const clear = new THREE.Texture()
      const phys = new THREE.MeshPhysicalMaterial({ specularIntensityMap: spec, clearcoatMap: clear })
      const out = prep(phys) as THREE.MeshPhysicalMaterial
      expect(out.specularIntensityMap!.userData.mimeType).toBe('image/jpeg')
      expect(out.clearcoatMap!.userData.mimeType).toBe('image/jpeg')
      expect(spec.userData.mimeType).toBe('image/webp')
    })

    it('uses PNG for an alphaMap, a faded or cut-out material and PNG sources', () => {
      const alpha = new THREE.Texture()
      expect(mimeOf(prep(new THREE.MeshStandardMaterial({ alphaMap: alpha })), 'alphaMap')).toBe('image/png')
      expect(alpha.userData.mimeType).toBeUndefined()
      const faded = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), transparent: true, opacity: 0.5 })
      expect(mimeOf(prep(faded), 'map')).toBe('image/png')
      const cut = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: 0.5 })
      expect(mimeOf(prep(cut), 'map')).toBe('image/png')
      const png = new THREE.Texture()
      png.userData.mimeType = 'image/png'
      expect(mimeOf(prep(new THREE.MeshStandardMaterial({ map: png })), 'map')).toBe('image/png')
      const fromUrl = new THREE.Texture({ src: 'blob:x/a.png?v=1' } as unknown as HTMLImageElement)
      expect(mimeOf(prep(new THREE.MeshStandardMaterial({ map: fromUrl })), 'map')).toBe('image/png')
    })

    it('keeps a fully opaque transparent-flagged map JPEG, and shares one copy per format', () => {
      const tex = new THREE.Texture()
      const a = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 1 })
      const b = new THREE.MeshStandardMaterial({ map: tex })
      const c = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.1 })
      const [ma, mb, mc] = meshesOf(prepareExportScene(new THREE.Group().add(box(a), box(b), box(c)), { maxTexture: 2048 }))
        .map((m) => (m.material as THREE.MeshStandardMaterial).map!)
      expect(ma).toBe(mb)
      expect(ma.userData.mimeType).toBe('image/jpeg')
      expect(mc.userData.mimeType).toBe('image/png')
    })
  })

  it('exports a room-only scene', () => {
    const root = new THREE.Group().add(box())
    expect(meshesOf(prepareExportScene(root, { maxTexture: 2048 }))).toHaveLength(1)
  })

  it('does not mutate the input', () => {
    const basic = new THREE.MeshBasicMaterial()
    const mesh = box(basic)
    const root = new THREE.Group().add(mesh)
    const out = prepareExportScene(root, { maxTexture: 2048 })
    expect(out).not.toBe(root)
    expect(root.children).toHaveLength(1)
    expect(mesh.material).toBe(basic)
    expect(basic.type).toBe('MeshBasicMaterial')
  })
})
