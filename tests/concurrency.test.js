// 同時操作のテスト。Firebase と同じ「読んで直して書く」を、遅延のある偽の DB で再現する。
// 旧方式（読み込み→保存）だと同時に入った人が消える、新方式（トランザクション）なら消えないことを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyJoin, claimResult, freshRoom, scoreInsider } from "../src/lib/rules.js";
import { addToBoard, enc } from "../src/lib/util.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Firebase の set と runTransaction の動き（比べて違えばやり直す）を真似た偽の DB
function fakeDb(initial) {
  let value = structuredClone(initial);
  let version = 0;
  return {
    get value() { return value; },
    async load() { await wait(5); return structuredClone(value); },
    async save(v) { await wait(20); value = structuredClone(v); version++; },
    async transact(fn) {
      for (let tries = 0; tries < 200; tries++) {
        const seen = version;
        const cur = structuredClone(value);
        await wait(Math.random() * 8);
        const next = fn(cur);
        if (next === undefined) return { committed: false, value: cur };
        if (version === seen) { value = structuredClone(next); version++; return { committed: true, value: structuredClone(value) }; }
        // 他の人が先に書いた → 最新の値でやり直し
      }
      throw new Error("やり直しが終わらない");
    },
  };
}

const names = ["い", "う", "え", "お", "か"];

test("旧方式：5人が同時に「はじめる」を押すと、部屋から人が消える（不具合の再現）", async () => {
  const db = fakeDb(freshRoom("あ", "a"));
  await Promise.all(names.map(async (n, i) => {
    const cur = await db.load();
    await db.save({ ...cur, players: [...cur.players, { id: `u${i}`, name: n }] });
  }));
  assert.ok(db.value.players.length < 6, `全員残ってしまった: ${db.value.players.length}`);
});

test("新方式：5人が同時に入っても全員そろう", async () => {
  const db = fakeDb(freshRoom("あ", "a"));
  await Promise.all(names.map((n, i) => db.transact((cur) => applyJoin(cur, { name: n, uid: `u${i}` }).next)));
  assert.equal(db.value.players.length, 6);
  assert.deepEqual(new Set(db.value.players.map((p) => p.name)), new Set(["あ", ...names]));
});

test("新方式：2台が同時に採点しても、通算成績は1回しか足されない", async () => {
  const players = [{ id: "a", name: "あ" }, { id: "b", name: "い" }, { id: "c", name: "う" }];
  const room = fakeDb({ players, masterId: "a", insiderEnc: enc("b"), phase: "vote", wordGuessed: true, votes: { a: "b", b: "c", c: "b" } });
  const board = fakeDb({});
  const finalize = async () => {
    let claimed = null;
    const res = await room.transact((cur) => { claimed = claimResult(cur, scoreInsider); return claimed ? claimed.next : undefined; });
    if (!res.committed) return false;
    await board.transact((b) => addToBoard(b, players, claimed.r.delta, claimed.r.winners));
    return true;
  };
  const results = await Promise.all([finalize(), finalize(), finalize()]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(board.value["あ"].games, 1);
  assert.equal(board.value["あ"].pts, 2);
});

// ── 偽の DB（dev:mock のサーバー役）も、本物と同じく「先を越されたら書かない」 ──
import { createMockServer } from "../src/lib/mockServer.js";
test("偽の DB：同じ版から2台が書こうとすると、2台目は書けずに最新が返る", () => {
  const s = createMockServer();
  s.handle("put", { path: "rooms/main", value: { phase: "vote", scored: false } });
  const seen = s.handle("read").version;
  const a = s.handle("cas", { path: "rooms/main", version: seen, value: { phase: "result", scored: true } });
  const b = s.handle("cas", { path: "rooms/main", version: seen, value: { phase: "result", scored: true, twice: true } });
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.equal(s.handle("read").db.rooms.main.twice, undefined);
});
test("偽の DB：null は消え、votes/<id> だけ書いても他の票は残る", () => {
  const s = createMockServer();
  s.handle("put", { path: "rooms/main", value: { votes: { a: "x" }, qa: [{ q: "?", ans: null }] } });
  s.handle("put", { path: "rooms/main/votes/b", value: "y" });
  const r = s.handle("read").db.rooms.main;
  assert.deepEqual(r.votes, { a: "x", b: "y" });
  assert.deepEqual(r.qa, [{ q: "?" }]);
});
