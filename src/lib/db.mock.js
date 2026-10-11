// Firebase なしで動作確認するための偽の DB（`npm run dev:mock` のとき db.js の代わりに読み込まれる）。
// 同じ関数名・同じ引数。保存のくせ（null・空の値が消える／undefined や使えないキーはエラー）は
// 本番の Firebase に合わせてあるので、「本番でだけ出る不具合」が手元でも出る。
//
// ・ふだん: 中身は SharedWorker（mockWorker.js）＝サーバー役が持つ。同じブラウザでタブを何枚開いても同じ部屋を共有し、
//           書き込みは1つずつ・トランザクションは版番号つき（本物と同じ）。タブ1枚 = スマホ1台（名前はタブごと）
// ・撮影モード（?shot=…）や SharedWorker の無いブラウザ: そのタブのメモリの中だけで動く
// ブラウザのコンソールでは window.__db から中身を読み書きできる（__db.read() / __db.resetMock()）。
import { validateForFirebase, normalizeLikeFirebase } from "./fbnorm.js";
import { createMockServer } from "./mockServer.js";

const isShot = typeof location !== "undefined" && /[?&](shot|gallery)=?/.test(location.search);
const clone = (v) => (v === undefined || v === null ? null : structuredClone(v));

let state = { db: { rooms: {}, leaderboard: {} }, version: 0 };
let markReady;
const ready = new Promise((r) => { markReady = r; });
const listeners = {};
const lastSent = {};
const read = (code) => clone(state.db.rooms[code]);
function emitAll() {
  for (const code of Object.keys(listeners)) {
    const json = JSON.stringify(state.db.rooms[code] ?? null);
    if (lastSent[code] === json) continue; // 変わっていない部屋は知らせない
    lastSent[code] = json;
    (listeners[code] || []).forEach((cb) => cb(read(code)));
  }
}

// ── サーバー役とのやり取り ──
const local = isShot || typeof SharedWorker === "undefined" ? createMockServer() : null;
let port = null;
let seq = 0;
const pending = new Map();
if (local) {
  state = local.snapshot();
  markReady();
} else {
  // 素のスクリプトとして配る（vite.config.js の tekomi-mock-worker）。全タブが同じ URL・同じ名前でつながる
  const worker = new SharedWorker("/__mock-worker.js", { name: "tekomi-mockdb" });
  port = worker.port;
  port.onmessage = (ev) => {
    const m = ev.data;
    if (m.type === "state") { if (offline) heldState = m; else applyState(m); return; }
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error)); else p.resolve(m.result);
  };
  port.start();
  addEventListener("pagehide", () => { try { port.postMessage({ op: "bye" }); } catch { /* noop */ } });
}
// ── 圏外の再現（確認用）。本物と同じく、圏外中の読み書きは溜まり、つながった瞬間にまとめて流れる ──
let offline = false;
let heldState = null; // 圏外中に届いた最新の部屋（つながったら反映）
const held = []; // 圏外中に押した操作
const connSubs = new Set();
export function subscribeConnected(callback) {
  connSubs.add(callback);
  Promise.resolve().then(() => callback(!offline));
  return () => { connSubs.delete(callback); };
}
export function setOffline(v) {
  offline = !!v;
  connSubs.forEach((cb) => cb(!offline));
  if (offline) return;
  if (heldState) { const m = heldState; heldState = null; applyState(m); }
  held.splice(0).forEach((f) => f());
}
function applyState(m) { state = { db: m.db, version: m.version }; markReady(); emitAll(); }

function call(op, args) {
  if (offline) return new Promise((resolve) => { held.push(() => resolve(call(op, args))); });
  if (local) {
    const res = local.handle(op, args);
    if (res && res.changed) { state = local.snapshot(); setTimeout(emitAll, 0); }
    return Promise.resolve(res);
  }
  return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); port.postMessage({ id, op, args }); });
}

// 本番と同じく「押してから反映まで少し遅れる」ようにする（同時操作の不具合を見つけやすくする）
const later = () => new Promise((r) => setTimeout(r, 15));

export function subscribeRoom(code, callback) {
  (listeners[code] = listeners[code] || []).push(callback);
  ready.then(() => { lastSent[code] = JSON.stringify(state.db.rooms[code] ?? null); callback(read(code)); });
  return () => { listeners[code] = (listeners[code] || []).filter((c) => c !== callback); };
}
export async function saveRoom(code, data) {
  await later();
  validateForFirebase(data, `rooms/${code}`);
  await call("put", { path: `rooms/${code}`, value: clone(data) });
}
export async function setRoomField(code, key, value) {
  await later();
  validateForFirebase(value, `rooms/${code}/${key}`);
  await call("put", { path: `rooms/${code}/${key}`, value: clone(value) });
}
export async function updateRoom(code, patch) {
  await later();
  for (const [k, v] of Object.entries(patch)) validateForFirebase(v, `rooms/${code}/${k}`);
  await call("update", { base: `rooms/${code}`, patch: structuredClone(patch) });
}
export async function loadRoom(code) {
  await later();
  const s = await call("read");
  return clone(s.db.rooms[code]);
}
// 本物の runTransaction と同じ：読んだ版のまま誰も書いていなければ書く。先を越されたら最新で fn をやり直す
async function transact(path, pick, fn) {
  for (let i = 0; i < 100; i++) {
    await later();
    const s = await call("read");
    const cur = clone(pick(s.db));
    const next = fn(cur);
    if (next === undefined) return { committed: false, value: cur };
    validateForFirebase(next, path);
    const r = await call("cas", { path, version: s.version, value: clone(next) });
    if (r.ok) return { committed: true, value: clone(r.value) };
  }
  throw new Error("偽の DB: トランザクションが終わらない");
}
export function transactRoom(code, fn) { return transact(`rooms/${code}`, (db) => db.rooms[code], fn); }

export async function loadLeaderboard() {
  await later();
  const s = await call("read");
  return clone(s.db.leaderboard) || {};
}
export async function saveLeaderboard(data) {
  await later();
  validateForFirebase(data, "leaderboard");
  await call("put", { path: "leaderboard", value: clone(data) });
}
export async function transactLeaderboard(fn) {
  const r = await transact("leaderboard", (db) => db.leaderboard, (cur) => fn(cur || {}));
  return { ...r, value: r.value || {} };
}

// 撮影モード・確認用の下ごしらえ（部屋・通算成績をまとめて入れる／空にする）
export function seedMock({ rooms = {}, leaderboard = {} } = {}) {
  for (const [code, v] of Object.entries(rooms)) validateForFirebase(v, `rooms/${code}`);
  return call("seed", { rooms: structuredClone(rooms), leaderboard: normalizeLikeFirebase(structuredClone(leaderboard)) || {} });
}
export function resetMock() { return call("seed", { rooms: {}, leaderboard: {} }); }

if (typeof window !== "undefined") {
  window.__db = { read: () => structuredClone(state.db), saveRoom, setRoomField, updateRoom, loadRoom, transactRoom, loadLeaderboard, saveLeaderboard, seedMock, resetMock, setOffline, isOffline: () => offline };
}
