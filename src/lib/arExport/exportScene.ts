import type * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'

/**
 * Runs both exporters on a prepared scene (see `prepareExportScene`). Textures are already
 * capped there, so USDZExporter's own 1024 px downscale is switched off.
 */
export async function exportScene(root: THREE.Group): Promise<{ glb: Blob; usdz: Blob }> {
  const glbData = await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })
  const usdzData = await new USDZExporter().parseAsync(root, { maxTextureSize: Infinity })
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
