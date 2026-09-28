// 偽の DB の「サーバー役」を、同じブラウザの全タブで共有する SharedWorker（dev:mock のときだけ動く）。
// 中身は mockServer.js。ここはタブとのやり取りと、中身の保存（IndexedDB）だけ。
// タブを全部閉じる・リロードするとワーカーは止まるので、起動のたびに保存しておいた中身を読み戻す。
// vite.config.js が fbnorm.js・mockServer.js・このファイルを1枚の素のスクリプトにつないで配る。
import { createMockServer } from "./mockServer.js";

const server = createMockServer();
const ports = new Set();
const waiting = [];
let loaded = false;
let store = null;

const broadcast = () => { const s = server.snapshot(); for (const p of ports) p.postMessage({ type: "state", ...s }); };
function persist() {
  try { store.transaction("s", "readwrite").objectStore("s").put(server.snapshot().db, "state"); } catch { /* 保存できなくても動く */ }
}
function ready() {
  loaded = true;
  waiting.splice(0).forEach((fn) => fn());
}
try {
  const req = indexedDB.open("tekomi-mockdb", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("s");
  req.onerror = () => ready();
  req.onsuccess = () => {
    store = req.result;
    try {
      const get = store.transaction("s").objectStore("s").get("state");
      get.onsuccess = () => { if (get.result) server.handle("seed", get.result); ready(); };
      get.onerror = () => ready();
    } catch { ready(); }
  };
} catch { ready(); }

function onMessage(port, ev) {
  const { id, op, args } = ev.data || {};
  if (op === "bye") { ports.delete(port); return; }
  let res;
  try { res = server.handle(op, args); } catch (err) { port.postMessage({ id, error: String(err.message || err) }); return; }
  port.postMessage({ id, result: res });
  if (res && res.changed) { persist(); broadcast(); }
}

self.onconnect = (e) => {
  const port = e.ports[0];
  ports.add(port);
  port.onmessage = (ev) => { if (loaded) onMessage(port, ev); else waiting.push(() => onMessage(port, ev)); };
  port.start();
  const hello = () => port.postMessage({ type: "state", ...server.snapshot() });
  if (loaded) hello(); else waiting.push(hello);
};
