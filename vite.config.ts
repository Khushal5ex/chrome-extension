import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(rootDir, 'index.html'),
        options: resolve(rootDir, 'options.html'),
        background: resolve(rootDir, 'src/background.ts'),
        content: resolve(rootDir, 'src/content.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background' || chunkInfo.name === 'content') {
            return '[name].js'
          }
          return 'assets/[name].js'
        },
        chunkFileNames: 'assets/chunks/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
})
