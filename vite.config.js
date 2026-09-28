import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

const MOCK = !!process.env.MOCK_DB
const lib = (f) => path.resolve(process.cwd(), 'src/lib', f)

// dev:mock のときだけ、偽の DB の「サーバー役」（タブ共通の SharedWorker）を1枚の素のスクリプトとして配る。
// 「モジュール型」の SharedWorker はブラウザによって起動できないため。本番のビルドには入らない。
const mockWorker = {
  name: 'tekomi-mock-worker',
  configureServer(server) {
    server.middlewares.use('/__mock-worker.js', (req, res) => {
      const plain = (f) => fs.readFileSync(lib(f), 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '')
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end([plain('fbnorm.js'), plain('mockServer.js'), plain('mockWorker.js')].join('\n'))
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(MOCK ? [mockWorker] : [])],
  // フォルダ名の "~"（iCloud~md~obsidian）でV2のfs制限に引っかかるため緩める
  server: {
    fs: { strict: false },
  },
  // MOCK_DB=1 のときは Firebase の代わりに偽の DB を使う（動作確認用・本番ビルドには影響しない）
  resolve: {
    alias: MOCK ? [{ find: /^(\.\.?\/)+(lib\/)?db$/, replacement: lib('db.mock.js') }] : [],
  },
})
