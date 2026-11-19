import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@domain': resolve('src/domain'),
      '@shared': resolve('src/shared'),
      '@canvas': resolve('src/canvas'),
      '@editor': resolve('src/editor'),
      '@export': resolve('src/export'),
      '@output': resolve('src/output')
    }
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
})
