// 全画面を撮る（swim の「全画面を撮って目で見る」と同じ考え方）。追加のインストールは不要。
//   npm run shots                  → shots/ に全場面の PNG（スマホ 390×844 を2倍の細かさで、縦は画面の下まで）
//   npm run shots -- 出力先 home,lobby-host   → 出力先と、撮る場面を指定
// 撮り終わったら shots/index.html（一覧）をブラウザで開けば全部並べて見られる。
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { launch } from "./lib/cdp.mjs";

process.env.MOCK_DB = "1";
process.env.VITE_MOCK = "1";
const out = path.resolve(process.argv[2] || "shots");
const only = (process.argv[3] || "").split(",").filter(Boolean);
mkdirSync(out, { recursive: true });

const port = 5198;
const { createServer } = await import("vite");
const server = await createServer({ server: { port, strictPort: true }, logLevel: "error" });
await server.listen();
const base = `http://localhost:${port}/`;

const chrome = await launch({ port: 9335, width: 390, height: 844, scale: 2 });
const results = [];
try {
  await chrome.goto(`${base}?shot=icons`);
  await chrome.waitFor("document.body.dataset.shot === 'ready'", 20000);
  const ids = (await chrome.eval("window.__shotIds")).filter((id) => !only.length || only.includes(id));
  for (const id of ids) {
    await chrome.goto(`${base}?shot=${id}`);
    let state = "ready";
    try { await chrome.waitFor("['ready','timeout'].includes(document.body.dataset.shot)", 15000); state = await chrome.eval("document.body.dataset.shot"); } catch { state = "timeout"; }
    const errs = await chrome.eval("(window.__errs || []).join(' / ')");
    const h = await chrome.shot(path.join(out, `${id}.png`));
    results.push({ id, h, state, errs });
    console.log(`${state === "ready" ? "OK " : "NG "} ${id} (${h}px)${errs ? " エラー: " + errs : ""}`);
  }
} finally {
  await chrome.close();
  await server.close();
}

const html = `<!doctype html><meta charset="utf-8"><title>てこみン 全画面</title>
<style>body{background:#222;color:#ddd;font-family:sans-serif;margin:16px}div.g{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
figure{margin:0;width:260px}img{width:260px;border:2px solid #555;border-radius:8px;display:block}figcaption{font-size:12px;margin-top:4px}</style>
<h1 style="font-size:18px">てこみン 全画面（${results.length}枚・${new Date().toLocaleString("ja-JP")}）</h1><div class="g">
${results.map((r) => `<figure><a href="${r.id}.png"><img src="${r.id}.png" loading="lazy"></a><figcaption>${r.state === "ready" ? "" : "⚠ "}${r.id}</figcaption></figure>`).join("\n")}
</div>`;
writeFileSync(path.join(out, "index.html"), html);
const bad = results.filter((r) => r.state !== "ready" || r.errs);
console.log(`\n${results.length}枚 撮影 → ${path.join(out, "index.html")}${bad.length ? `\n⚠ 要確認 ${bad.length}件: ${bad.map((b) => b.id).join(", ")}` : ""}`);
process.exit(bad.length ? 1 : 0);
