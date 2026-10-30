interface ContextSource {
  getContext(type: string): unknown
}

/** True when a WebGL context can be created; headless Chromium without a (software) GPU has none. */
export function hasWebGL(
  createCanvas: () => ContextSource = () => document.createElement('canvas'),
): boolean {
  try {
    const canvas = createCanvas()
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}
