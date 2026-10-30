import { describe, expect, it } from 'vitest'
import { usdzExportOptions } from './exportScene'

describe('usdzExportOptions', () => {
  it('room export: no second texture downscale, Quick Look on the floor', () => {
    expect(usdzExportOptions('floor')).toEqual({
      maxTextureSize: Infinity,
      ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
    })
  })

  it('single artwork: anchored to a wall (Quick Look places it on a vertical plane, +Z out of the wall)', () => {
    expect(usdzExportOptions('wall').ar.planeAnchoring.alignment).toBe('vertical')
  })
})

describe('orientForWallAnchor', () => {
  it('turns a picture facing +Z (up +Y) into Quick Look wall space: front +Y out of the wall, top towards -Z', async () => {
    const THREE = await import('three')
    const { orientForWallAnchor } = await import('./exportScene')
    const root = new THREE.Group()
    const oriented = orientForWallAnchor(root)
    oriented.updateMatrixWorld(true)
    const front = new THREE.Vector3(0, 0, 1).applyMatrix4(oriented.matrixWorld)
    const top = new THREE.Vector3(0, 1, 0).applyMatrix4(oriented.matrixWorld)
    expect(front.x).toBeCloseTo(0); expect(front.y).toBeCloseTo(1); expect(front.z).toBeCloseTo(0)
    expect(top.x).toBeCloseTo(0); expect(top.y).toBeCloseTo(0); expect(top.z).toBeCloseTo(-1)
    expect(oriented.children[0]).toBe(root)
  })
})
