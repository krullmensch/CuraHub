import { createContext, useContext } from 'react'
import type { ArtworkLoadProgress } from '../artworkLoadProgress'

// Export mode: the AR export page (/ar-export/:versionId) renders a published version with the
// viewer's own components, waits until everything has loaded and hands the scene to the
// exporters. Components read the mode from this context; outside the export page it is off.

export const DEFAULT_MAX_TEXTURE = 2048

const INSTANCE_PREFIX = 'instance:'

/**
 * What has loaded so far, as named parts: `room`, `walls`, `figures`, `instance:<id>`. A part is
 * expected when its boundary mounts, ready when the content inside its Suspense mounted, failed
 * when that content threw. A failed instance is a skipped work; any other failed part is fatal.
 */
export interface TextureStatus {
  failed: () => number[]
  pending: () => number[]
  /** This canvas's own picture progress — the global one also counts the editor's canvas. */
  progress?: () => ArtworkLoadProgress
}

export class ExportSession {
  private expected = new Set<string>()
  private readySet = new Set<string>()
  private failed = new Set<string>()
  /** A part that is not a work failed: there is nothing worth exporting. */
  hadFatal = false
  private onFatal: ((err: unknown) => void) | null = null
  private textures: TextureStatus = { failed: () => [], pending: () => [] }

  /** Called for a failed part that is not a work (room, walls, figures); null to stop. */
  setFatalHandler(handler: ((err: unknown) => void) | null): void {
    this.onFatal = handler
  }

  /** ArtworkTextureProvider in export mode: where to ask about the works' pictures. */
  setTextureStatus(status: TextureStatus): void {
    this.textures = status
  }

  /** Instance ids whose picture could not be loaded from any source. */
  textureFailures(): number[] {
    return this.textures.failed()
  }

  /** Instance ids whose picture is still loading. */
  texturePending(): number[] {
    return this.textures.pending()
  }

  /** Pictures of this export's canvas: settled vs total. */
  textureProgress(): ArtworkLoadProgress {
    return this.textures.progress?.() ?? { settled: 0, total: 0 }
  }

  expect(part: string): void {
    this.expected.add(part)
  }

  ready(part: string): void {
    if (!this.failed.has(part)) this.readySet.add(part)
  }

  fail(part: string, err: unknown): void {
    this.expected.add(part)
    this.readySet.delete(part)
    this.failed.add(part)
    if (part.startsWith(INSTANCE_PREFIX)) return
    this.hadFatal = true
    this.onFatal?.(err)
  }

  isReady(part: string): boolean {
    return this.readySet.has(part)
  }

  get partsSettled(): boolean {
    if (this.expected.size === 0) return false
    for (const part of this.expected) {
      if (!this.readySet.has(part) && !this.failed.has(part)) return false
    }
    return true
  }

  failedInstanceIds(): number[] {
    return instanceIds([...this.failed])
  }

  /** Works whose content never mounted (still loading when the page gave up waiting). */
  unsettledInstanceIds(): number[] {
    return instanceIds([...this.expected].filter((p) => !this.readySet.has(p) && !this.failed.has(p)))
  }
}

function instanceIds(parts: string[]): number[] {
  return parts
    .filter((p) => p.startsWith(INSTANCE_PREFIX))
    .map((p) => Number(p.slice(INSTANCE_PREFIX.length)))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b)
}

export interface ExportModeValue {
  active: boolean
  /** Longest texture side in the export (px). */
  maxTexture: number
  session: ExportSession | null
}

export const ExportModeContext = createContext<ExportModeValue>({
  active: false,
  maxTexture: DEFAULT_MAX_TEXTURE,
  session: null,
})

export function useExportMode(): ExportModeValue {
  return useContext(ExportModeContext)
}

/**
 * Every artwork texture is at its top tier (or has nothing left to try) and no frame finish is
 * still waiting for its generated textures. An empty room is settled.
 */
export function isExportSettled(progress: ArtworkLoadProgress, frameTexturesPending: number): boolean {
  return progress.settled >= progress.total && frameTexturesPending === 0
}

/** `#token=…` from the fragment, `?maxTexture=` from the query (default 2048). */
export function readExportParams(search: string, hash: string): { token: string | null; maxTexture: number } {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')
  const raw = Number(new URLSearchParams(search).get('maxTexture'))
  const maxTexture = Number.isFinite(raw) && raw >= 64 ? Math.floor(raw) : DEFAULT_MAX_TEXTURE
  return { token: token || null, maxTexture }
}
