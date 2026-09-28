// 4人ぶんの通し確認（1台のPCで、タブ4枚 = スマホ4台）。Firebase・本番の成績には触らない。
//   npm run e2e            → 3つのゲームを1ラウンドずつ自動で遊び、結果を確かめる
//   npm run e2e -- 出力先  → 途中の4人の画面も撮っておく
// 確かめること：同時に3人入っても消えない／役職の配り方／投票中にリロードしても戻れる／
//               採点が1回だけ（通算成績が二重に足されない）／帰った人を外せる／締め切り中でも「つづきから」で戻れる
import { mkdirSync } from "node:fs";
import path from "node:path";
import { launch } from "./lib/cdp.mjs";

process.env.MOCK_DB = "1";
process.env.VITE_MOCK = "1";
const outDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (outDir) mkdirSync(outDir, { recursive: true });

const port = 5197;
const { createServer } = await import("vite");
const server = await createServer({ server: { port, strictPort: true }, logLevel: "error" });
await server.listen();
const base = `http://localhost:${port}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (ok, label) => { results.push({ ok: !!ok, label }); console.log(`${ok ? "OK" : "NG"}  ${label}`); if (!ok) throw new Error(label); };
const dec = (s) => Buffer.from(s, "base64").toString("utf8");
const CATCH = "window.__errs=[];addEventListener('error',e=>__errs.push(e.message));addEventListener('unhandledrejection',e=>__errs.push(String(e.reason&&e.reason.message||e.reason)));window.confirm=()=>true;";

const chrome = await launch({ port: 9336, width: 390, height: 844, scale: 1 });
const tabs = [chrome, await chrome.newTab(), await chrome.newTab(), await chrome.newTab()];
const NAMES = ["あきら", "べに", "ちか", "だい"];
const T = {}; // 名前 → タブ

// ── ページの中の操作 ──
const js = (s) => JSON.stringify(s);
const click = (tab, text) => tab.eval(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(${js(text)}) && !x.disabled); if (!b) throw new Error('ボタンが無い: ' + ${js(text)} + ' / 画面: ' + document.body.dataset.screen); b.click(); return true; })()`);
const clickLabel = (tab, label) => tab.eval(`(() => { const b = document.querySelector('button[aria-label=' + ${js(js(label))} + ']'); if (!b) throw new Error('ボタンが無い: ${label}'); b.click(); return true; })()`);
const type = (tab, placeholder, value) => tab.eval(`(() => { const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').includes(${js(placeholder)})); if (!i) throw new Error('入力欄が無い: ' + ${js(placeholder)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${js(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const screen = (tab) => tab.eval("document.body.dataset.screen");
const room = (tab) => tab.eval("window.__db.read().rooms.main || null");
const board = (tab) => tab.eval("window.__db.read().leaderboard || {}");
const uidOf = (tab) => tab.eval("sessionStorage.getItem('tekomi_uid')");
const waitScreen = (tab, s, ms = 12000) => tab.waitFor(`document.body.dataset.screen === ${js(s)}`, ms);
const waitAll = (s, list = tabs) => Promise.all(list.map((t) => waitScreen(t, s)));
const waitRoom = (cond, ms = 12000) => tabs[0].waitFor(`(() => { const r = window.__db.read().rooms.main; return !!r && (${cond}); })()`, ms);
const text = (tab) => tab.eval("document.body.innerText");
// 通算成績の書き込み（採点した端末が部屋の次に書く）を待つ
const waitGames = (n) => tabs[0].waitFor(`(() => { const b = window.__db.read().leaderboard || {}; return ${js(NAMES)}.every((k) => b[k] && b[k].games >= ${n}); })()`, 8000);
const snapAll = async (name) => {
  if (!outDir) return;
  for (let i = 0; i < tabs.length; i++) if (tabs[i].__alive !== false) await tabs[i].shot(path.join(outDir, `${name}-${i + 1}.png`), { full: false });
};
// 押しているあいだだけ見えるカード：押して中身を読み、離して隠れるのを確かめる
const peek = (tab) => tab.eval(`(async () => {
  const s = document.querySelector('.secret'); if (!s) throw new Error('秘密カードが無い');
  const before = s.innerText;
  s.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 80));
  const open = document.querySelector('.secret').innerText;
  document.querySelector('.secret').dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 80));
  return { before, open, after: document.querySelector('.secret').innerText };
})()`);

try {
  for (const t of tabs) await t.send("Page.addScriptToEvaluateOnNewDocument", { source: CATCH });
  // 部屋を空にして、主催者（1枚目）がオープンする
  await tabs[0].goto(base);
  await tabs[0].eval("sessionStorage.setItem('tekomi_host','1'); window.__db.resetMock(); window.__db.saveRoom('__gate__', { open: true }).then(() => true)");
  for (const t of tabs) { await t.goto(base); await waitScreen(t, "home"); await t.waitFor("!!document.querySelector('input.mp-input')"); }

  // ── 入室：主催者のあとに、3人が同時に「はじめる」──
  await type(tabs[0], "あなたのなまえ", NAMES[0]);
  await click(tabs[0], "はじめる");
  await waitScreen(tabs[0], "lobby");
  for (let i = 1; i < 4; i++) await type(tabs[i], "あなたのなまえ", NAMES[i]);
  await Promise.all([1, 2, 3].map((i) => click(tabs[i], "はじめる")));
  await waitAll("lobby");
  await waitRoom("r.players && r.players.length === 4");
  const r0 = await room(tabs[0]);
  check(new Set(r0.players.map((p) => p.name)).size === 4, "3人が同時に入っても、4人全員が部屋にいる");
  for (let i = 0; i < 4; i++) T[NAMES[i]] = tabs[i];
  const uids = await Promise.all(tabs.map(uidOf));
  const tabOf = (uid) => tabs[uids.indexOf(uid)];
  const nameOf = (uid) => NAMES[uids.indexOf(uid)];
  check(r0.hostId === uids[0] && r0.masterId === uids[0], "最初に入った主催者が部屋主・マスター");

  // ── インサイダー ──
  await click(tabs[0], "お題をひく");
  await waitRoom("!!r.wordEnc");
  await click(tabs[0], "ゲームスタート");
  await waitAll("reveal");
  for (const t of tabs) { await click(t, "開封する"); }
  await snapAll("1-insider-reveal");
  for (const t of tabs) { await click(t, "スタート"); }
  await waitAll("game");
  let r = await room(tabs[0]);
  const insider = dec(r.insiderEnc);
  check(insider !== uids[0] && uids.includes(insider), `インサイダーはマスター以外から1人（${nameOf(insider)}）`);
  const commonTab = tabs.find((t, i) => uids[i] !== insider && i !== 0);
  const pk = await peek(tabOf(insider));
  check(!pk.before.includes("「") && pk.open.includes("インサイダー") && pk.open.includes("「") && !pk.after.includes("「"), "役とお題は押しているあいだだけ見える（離すと隠れる）");
  await type(commonTab, "質問を書く", "食べられる？");
  await click(commonTab, "送る");
  await waitRoom("r.qa && r.qa.length === 1");
  await tabs[0].waitFor("document.body.innerText.includes('食べられる？')");
  await click(tabs[0], "YES");
  await waitRoom("r.qa && r.qa[0].ans === 'YES'");
  check(true, "質問 → マスターが YES で答えられる");
  await snapAll("2-insider-game");
  await click(tabs[0], "お題的中");
  await waitAll("vote");
  // 投票中にリロードしても、投票画面に戻る（以前はロビーに取り残された）
  await commonTab.reload();
  await waitScreen(commonTab, "vote");
  check(true, "投票中にリロードしても、投票画面に自動で戻る");
  for (let i = 0; i < 4; i++) {
    const target = uids[i] === insider ? uids.find((u, j) => j !== 0 && u !== insider) : insider;
    await click(tabs[i], nameOf(target));
    await click(tabs[i], "に決定");
  }
  await waitAll("result");
  await waitGames(1);
  await sleep(4800); // 肩代わりの採点（4秒後）が走っても二重にならないことを見る
  r = await room(tabs[0]);
  let b = await board(tabs[0]);
  check(r.outcome === "commons", "全員がインサイダーに投票 → コモンの勝ち");
  check(NAMES.every((n) => b[n] && b[n].games === 1), "通算成績は1回だけ足される（4台すべてが採点しようとしても）");
  check((r.lastDelta || {})[NAMES[0]] === 2, "結果に「このラウンドの点」が入る（マスター +2）");
  await snapAll("3-insider-result");
  await click(tabs[0], "次のラウンドへ");
  await waitAll("lobby");

  // ── ワードウルフ ──
  await click(tabs[0], "ウルフ");
  await waitRoom("r.game === 'wordwolf'");
  await click(tabs[0], "ワードウルフ スタート");
  await waitAll("sub");
  for (const t of tabs) await click(t, "お題を見る");
  r = await room(tabs[0]);
  const wolf = JSON.parse(dec(r.wolf.wolvesEnc))[0];
  const wolfTab = tabOf(wolf);
  const wpk = await peek(wolfTab);
  check(wpk.open.includes(dec(r.wolf.minEnc)) && !wpk.after.includes("「"), "ウルフのお題も押しているあいだだけ見える");
  await snapAll("4-wolf-play");
  await click(tabs[0], "投票へ");
  await tabs[0].waitFor("document.body.innerText.includes('ウルフは誰だ')");
  for (let i = 0; i < 4; i++) {
    const target = uids[i] === wolf ? uids.find((u) => u !== wolf) : wolf;
    await tabs[i].waitFor("document.body.innerText.includes('一斉投票')");
    await click(tabs[i], nameOf(target));
    await click(tabs[i], "に決定");
  }
  await waitRoom("r.phase === 'wolfguess'");
  await wolfTab.waitFor("document.body.innerText.includes('みんなのお題は')");
  await type(wolfTab, "多数派のお題", "ぜったいちがう");
  await click(wolfTab, "これだ");
  const judgeTab = tabs.find((t, i) => uids[i] !== wolf);
  await judgeTab.waitFor("document.body.innerText.includes('ぜったいちがう')");
  await snapAll("5-wolf-guess");
  // 市民2人が同時に判定しても1回だけ
  const citizens = tabs.filter((t, i) => uids[i] !== wolf).slice(0, 2);
  await Promise.all(citizens.map((t) => click(t, "ハズレ")));
  await waitRoom("r.phase === 'result'");
  await waitGames(2);
  await sleep(1500); // 遅れて2回目が足されないかも見る
  r = await room(tabs[0]);
  b = await board(tabs[0]);
  check(r.outcome === "citizens", "ウルフを吊って、逆転の答えがハズレ → 市民の勝ち");
  check(NAMES.every((n) => b[n].games === 2), `市民2人が同時に判定しても、採点は1回だけ（${NAMES.map((n) => n + ":" + b[n]?.games).join(" ")}）`);
  await click(tabs[0], "次のラウンドへ");
  await waitAll("lobby");

  // ── ワードジャマー ──
  await click(tabs[0], "ジャマー");
  await waitRoom("r.game === 'jammer'");
  await click(tabs[0], "ワードジャマー スタート");
  await waitAll("sub");
  r = await room(tabs[0]);
  const das = tabOf(r.jam.dasmonId), jam = tabOf(r.jam.jammerId);
  const wak = tabs.filter((t, i) => uids[i] !== r.jam.dasmonId && uids[i] !== r.jam.jammerId);
  await type(das, "本当の答え", "パン屋さん");
  await click(das, "これで決定");
  await jam.waitFor("document.body.innerText.includes('パン屋さん')");
  await type(jam, "嘘の答え 1", "ケーキ屋さん");
  await type(jam, "嘘の答え 2", "宇宙飛行士");
  await click(jam, "混ぜ込む");
  await waitRoom("r.jam && r.jam.step === 'pick'");
  // 1人は本物、1人は嘘をえらぶ
  await wak[0].waitFor("document.body.innerText.includes('本物はどれ')");
  await click(wak[0], "パン屋さん"); await click(wak[0], "に決定");
  await click(wak[1], "宇宙飛行士"); await click(wak[1], "に決定");
  await waitAll("sub");
  await waitRoom("r.phase === 'result'");
  await waitGames(3);
  r = await room(tabs[0]);
  b = await board(tabs[0]);
  const jamName = nameOf(r.jam.jammerId), dasName = nameOf(r.jam.dasmonId);
  check(r.outcome === "1/2", "ジャマー：ワカルン2人のうち1人が見抜いた");
  check(r.lastDelta[jamName] === 1 && r.lastDelta[dasName] === 1, "だまされた1人ぶんジャマー +1、半数正解でダスモン +1");
  check(NAMES.every((n) => b[n].games === 3), "3ゲーム遊んで、通算は全員3戦");
  await snapAll("6-jammer-result");
  await click(tabs[0], "次のラウンドへ");
  await waitAll("lobby");

  // ── 帰った人を外す ──
  const leaver = tabs[3];
  await click(tabs[0], "帰った人を外す");
  await clickLabel(tabs[0], `${NAMES[3]}を部屋から外す`);
  await waitScreen(leaver, "home");
  check((await text(leaver)).includes("部屋から外れた"), "外された人はホームに戻り、理由が出る");
  check((await room(tabs[0])).players.length === 3, "部屋は3人になる");
  leaver.__alive = false;

  // ── 締め切っても、いる人は「つづきから」で戻れる ──
  await tabs[0].eval("window.__db.saveRoom('__gate__', { open: false }).then(() => true)");
  await tabs[1].reload();
  await waitScreen(tabs[1], "home");
  await tabs[1].waitFor("document.body.innerText.includes('でつづきから')");
  check((await text(tabs[1])).includes("いまは閉まっています"), "締め切り中は新しい人は入れない表示");
  await click(tabs[1], "でつづきから");
  await waitScreen(tabs[1], "lobby");
  check(true, "締め切り中でも、部屋にいる人は「つづきから」でロビーに戻れる");

  const errs = (await Promise.all(tabs.map((t) => t.eval("(window.__errs || []).join(' / ')")))).filter(Boolean);
  check(errs.length === 0, `画面のエラーなし${errs.length ? "：" + errs.join(" | ") : ""}`);
} catch (e) {
  console.error(`\n止まった: ${e.message}`);
  for (let i = 0; i < tabs.length; i++) { try { console.error(`  タブ${i + 1}: ${await screen(tabs[i])}`); } catch { /* noop */ } }
  process.exitCode = 1;
} finally {
  await chrome.close();
  await server.close();
}
const ng = results.filter((x) => !x.ok).length;
console.log(`\n${results.length - ng} / ${results.length} 合格${process.exitCode ? "（途中で止まった）" : ""}`);
process.exit(process.exitCode || (ng ? 1 : 0));
