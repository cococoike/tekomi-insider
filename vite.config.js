import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // フォルダ名の "~"（iCloud~md~obsidian）でV2のfs制限に引っかかるため緩める
  server: {
    fs: { strict: false },
  },
  // MOCK_DB=1 のときは Firebase の代わりにメモリ内モックを使う（動作確認用・本番ビルドには影響しない）
  resolve: {
    alias: process.env.MOCK_DB ? [{ find: /^(\.\.?\/)+(lib\/)?db$/, replacement: path.resolve(process.cwd(), 'src/lib/db.mock.js') }] : [],
  },
})
