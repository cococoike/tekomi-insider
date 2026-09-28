// 偽の DB の中身（サーバー役）。SharedWorker（タブをまたいで共有）と、撮影モードのメモリ版の両方で使う。
// 書き込みは1つずつ処理し、トランザクションは版番号で「読んでから誰も書いていない」ときだけ通す（Firebase と同じ）。
import { normalizeLikeFirebase } from "./fbnorm.js";

export function createMockServer() {
  let db = { rooms: {}, leaderboard: {} };
  let version = 0;
  const snapshot = () => ({ db, version });

  // "rooms/main/votes/p1" のようなパスに値を置く（null は消す）。そのあと Firebase と同じ形にそろえる
  function putPath(path, value) {
    const keys = String(path).split("/").filter(Boolean);
    const next = structuredClone(db);
    let node = next;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!node[keys[i]] || typeof node[keys[i]] !== "object") node[keys[i]] = {};
      node = node[keys[i]];
    }
    node[keys[keys.length - 1]] = value === undefined ? null : structuredClone(value);
    const rooms = {};
    for (const [code, r] of Object.entries(next.rooms || {})) { const n = normalizeLikeFirebase(r); if (n !== undefined) rooms[code] = n; }
    db = { rooms, leaderboard: normalizeLikeFirebase(next.leaderboard) || {} };
  }
  const getPath = (path) => String(path).split("/").filter(Boolean).reduce((o, k) => (o == null ? undefined : o[k]), db);

  function handle(op, a = {}) {
    switch (op) {
      case "read": return snapshot();
      case "put": putPath(a.path, a.value); version++; return { changed: true, ...snapshot() };
      case "update":
        for (const [k, v] of Object.entries(a.patch || {})) putPath(`${a.base}/${k}`, v);
        version++;
        return { changed: true, ...snapshot() };
      case "cas":
        if (a.version !== version) return { ok: false, ...snapshot() }; // だれかが先に書いた → やり直してもらう
        putPath(a.path, a.value);
        version++;
        return { ok: true, changed: true, value: getPath(a.path) ?? null, ...snapshot() };
      case "seed":
        db = { rooms: {}, leaderboard: normalizeLikeFirebase(a.leaderboard) || {} };
        for (const [code, r] of Object.entries(a.rooms || {})) { const n = normalizeLikeFirebase(r); if (n !== undefined) db.rooms[code] = n; }
        version++;
        return { changed: true, ...snapshot() };
      default: throw new Error(`知らない操作: ${op}`);
    }
  }
  return { handle, snapshot };
}
