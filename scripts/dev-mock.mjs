// Firebase なしで動作確認する開発サーバー（db.js → db.mock.js に差し替え）。`npm run dev:mock`
//   ・同じブラウザでタブを何枚か開くと、タブ1枚 = スマホ1台 として一緒に遊べる（部屋は共有、名前はタブごと）
//   ・http://localhost:5199/?gallery で全画面の見本、?shot=<場面ID> で1画面
//   ・本番の Firebase・通算成績には一切触らない
process.env.MOCK_DB = "1";
process.env.VITE_MOCK = "1";
const port = Number(process.env.PORT || 5199);
const { createServer } = await import("vite");
const server = await createServer({ server: { port, strictPort: true } });
await server.listen();
server.printUrls();
console.log(`\n  全画面の見本: http://localhost:${port}/?gallery`);
console.log("  タブを何枚か開くと、1台で何人ぶんでも遊べるてこ（部屋を空にする: コンソールで __db.resetMock()）\n");
