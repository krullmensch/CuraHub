import { describe, expect, it, vi } from 'vitest'
import { ExportSession, isExportSettled, readExportParams } from './exportMode'

describe('isExportSettled', () => {
  it('is settled when every artwork texture settled and no frame texture is pending', () => {
    expect(isExportSettled({ settled: 3, total: 3 }, 0)).toBe(true)
  })
  it('waits for artworks still loading', () => {
    expect(isExportSettled({ settled: 2, total: 3 }, 0)).toBe(false)
  })
  it('waits for frame textures', () => {
    expect(isExportSettled({ settled: 3, total: 3 }, 2)).toBe(false)
  })
  it('is settled for an empty room', () => {
    expect(isExportSettled({ settled: 0, total: 0 }, 0)).toBe(true)
  })
})

describe('ExportSession', () => {
  it('is not settled before any part is expected', () => {
    expect(new ExportSession().partsSettled).toBe(false)
  })

  it('settles once every expected part is ready or failed', () => {
    const s = new ExportSession()
    s.expect('room')
    s.expect('instance:1')
    s.expect('instance:2')
    expect(s.isReady('room')).toBe(false)
    s.ready('room')
    s.ready('instance:1')
    expect(s.isReady('room')).toBe(true)
    expect(s.partsSettled).toBe(false)
    s.fail('instance:2', new Error('404'))
    expect(s.partsSettled).toBe(true)
  })

  it('counts failed and unfinished instances, never other parts', () => {
    const s = new ExportSession()
    for (const id of ['room', 'walls', 'instance:1', 'instance:2', 'instance:3']) s.expect(id)
    s.ready('room')
    s.ready('instance:1')
    s.fail('instance:2', new Error('kaputt'))
    expect(s.failedInstanceIds()).toEqual([2])
    expect(s.unsettledInstanceIds()).toEqual([3])
  })

  it('asks the texture provider about pictures, nothing before it is attached', () => {
    const s = new ExportSession()
    expect(s.textureFailures()).toEqual([])
    s.setTextureStatus({ failed: () => [7], pending: () => [8, 9] })
    expect(s.textureFailures()).toEqual([7])
    expect(s.texturePending()).toEqual([8, 9])
  })

  it('reports a failed non-instance part as fatal', () => {
    const s = new ExportSession()
    const onFatal = vi.fn()
    s.setFatalHandler(onFatal)
    const err = new Error('Raum fehlt')
    s.fail('room', err)
    expect(onFatal).toHaveBeenCalledWith(err)
    expect(s.hadFatal).toBe(true)
  })

  it('a part that failed stays failed when its marker fires late', () => {
    const s = new ExportSession()
    s.expect('instance:4')
    s.fail('instance:4', new Error('x'))
    s.ready('instance:4')
    expect(s.failedInstanceIds()).toEqual([4])
  })
})

describe('readExportParams', () => {
  it('reads the token from the fragment and maxTexture from the query', () => {
    expect(readExportParams('?maxTexture=1024', '#token=abc.def')).toEqual({ token: 'abc.def', maxTexture: 1024 })
  })
  it('defaults maxTexture to 2048 and token to null', () => {
    expect(readExportParams('', '')).toEqual({ token: null, maxTexture: 2048 })
    expect(readExportParams('?maxTexture=nope', '#other=1')).toEqual({ token: null, maxTexture: 2048 })
  })
})

describe('ExportSession texture progress', () => {
    it('is empty until a provider reports, then reads that provider', async () => {
        const { ExportSession } = await import('./exportMode');
        const session = new ExportSession();
        expect(session.textureProgress()).toEqual({ settled: 0, total: 0 });
        session.setTextureStatus({ failed: () => [], pending: () => [3], progress: () => ({ settled: 1, total: 2 }) });
        expect(session.textureProgress()).toEqual({ settled: 1, total: 2 });
    });
});
