// Model URLs imported through Vite so they get a content hash in the file name
// (e.g. /assets/Satellit_new-optimized-<hash>.glb). A changed model therefore always gets a new
// URL and can be cached immutably — a fixed public/ path let browsers keep a stale model
// for days after a fix (this happened with the broken interleaved room GLB).
import satellitModelUrl from '../assets/models/Satellit_new-optimized.glb?url';

export const SATELLIT_MODEL_URL = satellitModelUrl;
