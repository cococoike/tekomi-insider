// Firebase なしで動作確認する開発サーバー（db.js → db.mock.js に差し替え）。`npm run dev:mock`
process.env.MOCK_DB = "1";
const { createServer } = await import("vite");
const server = await createServer({ server: { port: 5199, strictPort: true } });
await server.listen();
server.printUrls();
