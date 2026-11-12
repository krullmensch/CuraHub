import { z } from 'zod';

// Zod 4 probes `new Function('')` to compile fast parsers. The server's Content-Security-Policy
// forbids eval (server/src/lib/securityHeaders.ts), so the probe would only log a violation on
// every page load. Imported first in main.tsx, before any schema runs.
z.config({ jitless: true });
