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
