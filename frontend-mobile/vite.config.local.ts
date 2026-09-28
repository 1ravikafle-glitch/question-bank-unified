// Local-only override: this sandbox's backend runs on 8004 (8000 is taken
// by another thread). Git-ignored; vite.config.ts keeps the standard 8000.
// Loaded via `vite --config vite.config.local.ts` in the preview unit.
import { defineConfig, mergeConfig } from 'vite'
import base from './vite.config'

export default mergeConfig(base, defineConfig({
  server: {
    proxy: Object.fromEntries(
      Object.entries(base.server?.proxy ?? {}).map(([k, v]: [string, any]) => [
        k, { ...v, target: 'http://localhost:8004' },
      ])
    ),
  },
}))
