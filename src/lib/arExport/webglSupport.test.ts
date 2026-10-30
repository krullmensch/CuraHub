import { describe, expect, it } from 'vitest'
import { hasWebGL } from './webglSupport'

const factory = (contexts: Record<string, unknown>) => () => ({
  getContext: (type: string) => contexts[type] ?? null,
})

describe('hasWebGL', () => {
  it('accepts webgl2', () => {
    expect(hasWebGL(factory({ webgl2: {} }))).toBe(true)
  })
  it('falls back to webgl', () => {
    expect(hasWebGL(factory({ webgl: {} }))).toBe(true)
  })
  it('is false when no context can be created', () => {
    expect(hasWebGL(factory({}))).toBe(false)
  })
  it('is false when creating the canvas throws', () => {
    expect(hasWebGL(() => { throw new Error('boom') })).toBe(false)
  })
})
