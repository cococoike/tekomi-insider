import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // フォルダ名の "~"（iCloud~md~obsidian）でV2のfs制限に引っかかるため緩める
  server: {
    fs: { strict: false },
  },
})
