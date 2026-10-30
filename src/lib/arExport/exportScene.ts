import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'

/**
 * Runs both exporters on a prepared scene (see `prepareExportScene`). Textures are already
 * capped there, so USDZExporter's own 1024 px downscale is switched off.
 */
export async function exportScene(root: THREE.Group): Promise<{ glb: Blob; usdz: Blob }> {
  const glbData = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })
  const usdzData = await new USDZExporter().parseAsync(root, usdzExportOptions('floor'))
  return {
    glb: new Blob([glbData as ArrayBuffer], { type: 'model/gltf-binary' }),
    usdz: new Blob([usdzData as BlobPart], { type: 'model/vnd.usdz+zip' }),
  }
}

/** GLB only — the mobile planner's single-artwork model (model-viewer makes the USDZ for iOS itself). */
export async function exportGlb(root: THREE.Group): Promise<Blob> {
  const data = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })
  return new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' })
}

/**
 * USDZExporter options: textures are capped in prepareExportScene already; the AR anchoring tells
 * Quick Look where the model goes — the room on the floor, a single artwork on a wall (the model
 * faces +Z, which Quick Look turns away from the wall).
 */
export function usdzExportOptions(placement: 'floor' | 'wall') {
  return {
    maxTextureSize: Infinity,
    ar: {
      anchoring: { type: 'plane' as const },
      planeAnchoring: { alignment: placement === 'wall' ? ('vertical' as const) : ('horizontal' as const) },
    },
  }
}

/**
 * Quick Look's vertical plane anchor: +Y points out of the wall and -Z up along it. Our artwork faces
 * +Z with its top at +Y, so it is turned -90° about X (without this it stuck out of the wall like a
 * shelf, back up).
 */
export function orientForWallAnchor(root: THREE.Object3D): THREE.Group {
  const group = new THREE.Group()
  group.rotation.x = -Math.PI / 2
  group.add(root)
  return group
}

/** USDZ for iOS Quick Look, built on the device (the mobile planner's single artwork). */
export async function exportUsdz(root: THREE.Group, placement: 'floor' | 'wall'): Promise<Blob> {
  const target = placement === 'wall' ? orientForWallAnchor(root) : root
  target.updateMatrixWorld(true)
  const data = await new USDZExporter().parseAsync(target, usdzExportOptions(placement))
  return new Blob([data as BlobPart], { type: 'model/vnd.usdz+zip' })
}
