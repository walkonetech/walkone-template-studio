import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@domain': resolve('src/domain') } }
  },
  preload: {
    resolve: { alias: { '@shared': resolve('src/shared'), '@domain': resolve('src/domain') } }
  },
  renderer: {
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@domain': resolve('src/domain'),
        '@canvas': resolve('src/canvas'),
        '@editor': resolve('src/editor')
      }
    },
    plugins: [react()]
  }
})
