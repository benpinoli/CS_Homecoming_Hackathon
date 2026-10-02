import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { scraperBridge } from './dev-server/scraperBridge.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), scraperBridge()],
  root: 'src/frontend',
  build: {
    outDir: '../../dist',
  },
})
