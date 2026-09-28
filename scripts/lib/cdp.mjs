// Chrome を「見えない状態（ヘッドレス）」で起動して、画面を操作・撮影するための最小の道具。
// 追加のインストールは不要（Node 22 以降の組み込み WebSocket と、PC に入っている Chrome / Edge を使う）。
// 使い方は scripts/shots.mjs（全画面の撮影）と scripts/e2e.mjs（4人ぶんの通し確認）を参照。
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
].filter(Boolean);

export function findChrome() {
  const hit = CANDIDATES.find((p) => existsSync(p));
  if (!hit) throw new Error("Chrome / Edge が見つからない。環境変数 CHROME_PATH で場所を指定してね");
  return hit;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1枚のタブを操作する道具を作る
async function connectPage(wsUrl, { width, height, scale }) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0;
  const pending = new Map();
  const waiters = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const cb = pending.get(m.id); pending.delete(m.id); cb(m); return; }
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === m.method) { waiters[i].resolve(m.params); waiters.splice(i, 1); }
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  const once = (method, ms = 15000) => new Promise((resolve, reject) => {
    const w = { method, resolve };
    waiters.push(w);
    setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) { waiters.splice(i, 1); reject(new Error(`${method} を待ちきれなかった`)); } }, ms);
  });
  await send("Page.enable");
  await send("Runtime.enable");
  const metrics = (h) => send("Emulation.setDeviceMetricsOverride", { width, height: h, deviceScaleFactor: scale, mobile: true });
  await metrics(height);

  const api = {
    send,
    async goto(url) {
      const loaded = once("Page.loadEventFired");
      await send("Page.navigate", { url });
      await loaded;
    },
    async reload() {
      const loaded = once("Page.loadEventFired");
      await send("Page.reload", {});
      await loaded;
    },
    // ページの中で JS を実行して結果を受け取る（Promise は待つ）
    async eval(expression) {
      const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    // 条件（JS の式）が真になるまで待つ
    async waitFor(expression, ms = 10000) {
      const t0 = Date.now();
      let last = null;
      while (Date.now() - t0 < ms) {
        try { if (await api.eval(expression)) return true; } catch (e) { last = e; }
        await sleep(100);
      }
      throw new Error(`待ちきれなかった: ${expression}${last ? `（${last.message}）` : ""}`);
    },
    // 撮影。full=true ならページの下まで縦長で撮る
    async shot(file, { full = true } = {}) {
      await api.eval("document.fonts ? document.fonts.ready.then(() => true) : true");
      let h = height;
      if (full) {
        h = Math.max(height, Math.ceil(await api.eval("Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)")));
        await metrics(h);
        await sleep(120);
      }
      const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      writeFileSync(file, Buffer.from(data, "base64"));
      if (full) await metrics(height);
      return h;
    },
    closeSocket() { try { ws.close(); } catch { /* noop */ } },
  };
  return api;
}

export async function launch({ port = 9333, width = 390, height = 844, scale = 2 } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), "tekomi-shot-"));
  const proc = spawn(findChrome(), [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`, "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--mute-audio",
    // 裏のタブでもタイマーを止めない（4人ぶんのタブを同時に動かすため）
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows",
    "about:blank",
  ], { stdio: "ignore" });

  const http = `http://127.0.0.1:${port}`;
  let target = null;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(150);
    try { target = (await (await fetch(`${http}/json/list`)).json()).find((t) => t.type === "page"); } catch { /* 起動中 */ }
  }
  if (!target) { proc.kill(); throw new Error("Chrome のデバッグ窓口につながらない"); }

  const opts = { width, height, scale };
  const first = await connectPage(target.webSocketDebuggerUrl, opts);
  const tabs = [first];
  return Object.assign(first, {
    // 同じブラウザに新しいタブを開く（localStorage は共有・sessionStorage はタブごと）
    async newTab() {
      const t = await (await fetch(`${http}/json/new?about:blank`, { method: "PUT" })).json();
      const tab = await connectPage(t.webSocketDebuggerUrl, opts);
      tabs.push(tab);
      return tab;
    },
    async close() {
      tabs.forEach((t) => t.closeSocket());
      proc.kill();
      await sleep(400);
      try { rmSync(profile, { recursive: true, force: true }); } catch { /* 後で消える */ }
    },
  });
}
