// ゲームのルールのテスト。`npm test` で実行（Node 標準のテスト機能だけを使う）
import { test } from "node:test";
import assert from "node:assert/strict";
import { enc, NONE_ID } from "../src/lib/util.js";
import {
  scoreInsider, scoreWolf, scoreJammer, tallyWolf, screenFor, applyJoin, applyLeave, nextMaster,
  votesComplete, roleOf, calcLeft, jammerRoles, claimResult, freshRoom, isUnanswered, startInsider, toLobby,
} from "../src/lib/rules.js";
import { dec } from "../src/lib/util.js";

const P = [{ id: "a", name: "あ" }, { id: "b", name: "い" }, { id: "c", name: "う" }, { id: "d", name: "え" }, { id: "e", name: "お" }, { id: "f", name: "か" }];
const base = (patch) => ({ players: P.slice(0, 5), masterId: "a", insiderEnc: enc("b"), wordGuessed: true, votes: {}, ...patch });

// ── インサイダーの採点 ──
test("コモン勝利：インサイダーに票が集まる → マスターとコモンが +2", () => {
  const r = scoreInsider(base({ votes: { a: "b", c: "b", d: "b", e: "c", b: "c" } }));
  assert.equal(r.outcome, "commons");
  assert.deepEqual(r.delta, { あ: 2, う: 2, え: 2, お: 2 });
  assert.ok(!r.winners.includes("い"));
});

test("インサイダー逃げ切り（フォロワーつき）：インサイダー +3・フォロワー +2", () => {
  const r = scoreInsider(base({ players: P, followerEnc: enc("c"), votes: { a: "d", b: "d", c: "d", d: "b", e: "d", f: "b" } }));
  assert.equal(r.outcome, "insider");
  assert.deepEqual(r.delta, { い: 3, う: 2 });
});

test("同票はインサイダーの逃げ切り", () => {
  const r = scoreInsider(base({ votes: { a: "b", c: "b", d: "c", e: "c" } }));
  assert.equal(r.outcome, "insider");
});

test("時間切れ：マスター0／コモン−1／インサイダー・フォロワー−2", () => {
  const r = scoreInsider(base({ players: P, followerEnc: enc("c"), wordGuessed: false }));
  assert.equal(r.outcome, "timeout");
  assert.deepEqual(r.delta, { い: -2, う: -2, え: -1, お: -1, か: -1 });
  assert.equal(r.delta["あ"], undefined);
});

test("平和村：いちばん多い票が「いない」なら全員 +1／そうでなければ0点／時間切れも0点", () => {
  const peace = base({ isPeaceVillage: true, insiderEnc: null });
  const all = Object.fromEntries(P.slice(0, 5).map((p) => [p.id, NONE_ID]));
  const win = scoreInsider({ ...peace, votes: all });
  assert.equal(win.outcome, "peace_win");
  assert.equal(Object.values(win.delta).every((v) => v === 1), true);
  // 5人中3人が「いない」→ 最多なので村の勝ち（全員一致でなくてよい。昔からこの判定）
  assert.equal(scoreInsider({ ...peace, votes: { ...all, a: "c", b: "c" } }).outcome, "peace_win");
  const lose = scoreInsider({ ...peace, votes: { ...all, a: "c", b: "c", c: "c" } });
  assert.equal(lose.outcome, "peace_lose");
  assert.deepEqual(lose.delta, {});
  assert.equal(scoreInsider({ ...peace, votes: { a: "c", b: NONE_ID } }).outcome, "peace_lose"); // 同数も負け
  assert.equal(scoreInsider({ ...peace, wordGuessed: false }).outcome, "peace_timeout");
});

test("マジカル：魔術師が当てる +3／外す 村人チーム +2／時間切れ 魔術師 +2・村人 −1", () => {
  const m = base({ magic: true });
  assert.deepEqual(scoreInsider({ ...m, votes: { a: "b" } }).delta, { あ: 3 });
  const miss = scoreInsider({ ...m, votes: { a: "c" } });
  assert.equal(miss.outcome, "magic_village");
  assert.deepEqual(miss.delta, { い: 2, う: 2, え: 2, お: 2 });
  const to = scoreInsider({ ...m, wordGuessed: false });
  assert.equal(to.outcome, "magic_timeout");
  assert.deepEqual(to.delta, { あ: 2, い: -1, う: -1, え: -1, お: -1 });
});

test("投票がそろったか：通常は全員、マジカルは魔術師だけ", () => {
  assert.equal(votesComplete(base({ votes: { a: "b", b: "c", c: "b", d: "b" } })), false);
  assert.equal(votesComplete(base({ votes: { a: "b", b: "c", c: "b", d: "b", e: "b" } })), true);
  assert.equal(votesComplete(base({ magic: true, votes: { a: "b" } })), true);
  assert.equal(votesComplete(base({ magic: true, votes: { c: "b" } })), false);
  // Firebase から来た部屋は votes が丸ごと無いことがある
  assert.equal(votesComplete(base({ votes: undefined })), false);
});

test("役職の判定", () => {
  const r = base({ players: P, followerEnc: enc("c") });
  assert.equal(roleOf(r, "a"), "master");
  assert.equal(roleOf(r, "b"), "insider");
  assert.equal(roleOf(r, "c"), "follower");
  assert.equal(roleOf(r, "d"), "common");
  assert.equal(roleOf({ ...r, magic: true, followerEnc: null }, "a"), "wizard");
  assert.equal(roleOf({ ...r, magic: true, followerEnc: null }, "d"), "villager");
});

test("未回答の判定：Firebase から読むと ans は undefined になる", () => {
  assert.equal(isUnanswered({ q: "x" }), true);
  assert.equal(isUnanswered({ q: "x", ans: null }), true);
  assert.equal(isUnanswered({ q: "x", ans: "NO" }), false);
});

test("残り時間：開始時刻と持ち時間から計算し、延長は持ち時間を伸ばす", () => {
  const now = 1_000_000;
  assert.equal(calcLeft({ startTime: now - 60_000, duration: 300 }, now), 240);
  assert.equal(calcLeft({ startTime: now - 60_000, duration: 360 }, now), 300);
  assert.equal(calcLeft({ startTime: now - 999_000, duration: 300 }, now), 0);
});

// ── 採点の確定（1回だけ）──
test("採点済みの部屋は二度と採点しない", () => {
  const room = { ...base({ votes: { a: "b", c: "b", d: "b", e: "b", b: "c" } }), phase: "vote", scores: { あ: 1 } };
  const first = claimResult(room, scoreInsider);
  assert.equal(first.next.phase, "result");
  assert.equal(first.next.scores["あ"], 3);
  assert.deepEqual(first.next.lastDelta, first.r.delta);
  assert.equal(claimResult(first.next, scoreInsider), undefined);
});

// ── 画面の決め方 ──
test("投票中にリロードして入り直すと、ロビーではなく投票画面へ行く", () => {
  const room = { game: "insider", phase: "vote" };
  assert.equal(screenFor(room, "lobby"), "vote");
  assert.equal(screenFor(room, "home"), "vote");
});
test("ゲーム中：役職を見た後は game のまま、それ以外は役職配りから", () => {
  const room = { game: "insider", phase: "playing" };
  assert.equal(screenFor(room, "game"), "game");
  assert.equal(screenFor(room, "reveal"), "reveal");
  assert.equal(screenFor(room, "lobby"), "reveal");
  assert.equal(screenFor({ ...room, phase: "result" }, "game"), "result");
  assert.equal(screenFor({ game: "wordwolf", phase: "vote" }, "lobby"), "sub");
  assert.equal(screenFor({ game: "jammer", phase: "lobby" }, "sub"), "lobby");
  assert.equal(screenFor(null, "lobby"), "home");
});

// ── 入室 ──
test("入室：部屋が無ければ作る。自分が部屋主とマスター", () => {
  const r = applyJoin(null, { name: "あ", uid: "a" });
  assert.equal(r.created, true);
  assert.deepEqual(r.next.players, [{ id: "a", name: "あ" }]);
  assert.equal(r.next.hostId, "a");
});
test("入室：ロビーなら後ろに加わる／同じ名前は同じ人として引き継ぐ", () => {
  const room = { ...freshRoom("あ", "a") };
  const j = applyJoin(room, { name: "い", uid: "b" });
  assert.deepEqual(j.next.players.map((p) => p.id), ["a", "b"]);
  const again = applyJoin(j.next, { name: "い", uid: "zz" }); // 別の端末から同じ名前
  assert.equal(again.next, undefined); // 書き込み不要
  assert.equal(again.uid, "b");
});
test("入室：同じ端末が別の名前で入り直しても、同じ人が2人に増えない（名前を付け替え・得点も移す）", () => {
  const room = { ...freshRoom("あ", "a"), scores: { あ: 4 } };
  const j = applyJoin(room, { name: "あっちゃん", uid: "a" });
  assert.deepEqual(j.next.players, [{ id: "a", name: "あっちゃん" }]);
  assert.deepEqual(j.next.scores, { あっちゃん: 4 });
});
test("入室：ゲーム中は、いる人だけ戻れる（新しい人は待つ）", () => {
  const room = { ...freshRoom("あ", "a"), players: P.slice(0, 3), phase: "vote" };
  assert.equal(applyJoin(room, { name: "知らない人", uid: "x" }).error, "playing");
  assert.equal(applyJoin(room, { name: "い", uid: "x" }).uid, "b"); // 名前で戻る
  const byDevice = applyJoin(room, { name: "打ち間違い", uid: "c" }); // 端末で戻る
  assert.equal(byDevice.uid, "c");
  assert.equal(byDevice.name, "う");
  assert.equal(byDevice.next, undefined);
});
test("入室：主催者キーを持っている人は部屋主になる", () => {
  const room = { ...freshRoom("あ", "a"), players: P.slice(0, 2) };
  assert.equal(applyJoin(room, { name: "い", uid: "b", asHost: true }).next.hostId, "b");
});

test("抜ける：部屋主・マスターが抜けたら引き継ぐ。ゲーム中は抜けられない", () => {
  const room = { ...freshRoom("あ", "a"), players: P.slice(0, 3), masterId: "a" };
  const l = applyLeave(room, "a");
  assert.deepEqual(l.players.map((p) => p.id), ["b", "c"]);
  assert.equal(l.hostId, "b");
  assert.equal(l.masterId, "b");
  assert.equal(applyLeave({ ...room, phase: "playing" }, "b"), undefined);
  assert.equal(applyLeave(room, "zz"), undefined);
});

test("次のマスター：じゅんぐりは一周する／固定は部屋主（いなければ先頭）／ランダムは直前を避ける", () => {
  const ps = P.slice(0, 3);
  assert.equal(nextMaster(ps, "c", "robin", "a"), "a");
  assert.equal(nextMaster(ps, "a", "fixed", "a"), "a");
  assert.equal(nextMaster(ps, "a", "fixed", "gone"), "a");
  for (let i = 0; i < 30; i++) assert.notEqual(nextMaster(ps, "b", "random", "a"), "b");
});

// ── ワードウルフ ──
const wolfRoom = (wolves, votes) => ({ players: P.slice(0, 5), votes, wolf: { wolvesEnc: enc(JSON.stringify(wolves)) } });
test("ウルフ：吊られたら逆転チャンス、外れたら逃げ切り、同票も逃げ切り", () => {
  assert.deepEqual(tallyWolf(wolfRoom(["c"], { a: "c", b: "c", d: "c", c: "a", e: "a" })), { caughtId: "c" });
  assert.deepEqual(tallyWolf(wolfRoom(["c"], { a: "b", b: "a", c: "b", d: "b", e: "c" })), { outcome: "wolf" });
  assert.deepEqual(tallyWolf(wolfRoom(["c"], { a: "c", b: "c", c: "a", d: "a" })), { outcome: "wolf" });
});
test("ウルフの採点：市民 +1／逃げ切り +2／逆転 +3（ウルフ2人なら2人とも）", () => {
  const r = wolfRoom(["c", "e"], {});
  assert.deepEqual(scoreWolf(r, "citizens").delta, { あ: 1, い: 1, え: 1 });
  assert.deepEqual(scoreWolf(r, "wolf").delta, { う: 2, お: 2 });
  assert.deepEqual(scoreWolf(r, "reverse").delta, { う: 3, お: 3 });
});

// ── ワードジャマー ──
test("ジャマー：役はラウンドごとにじゅんぐり", () => {
  const ps = P.slice(0, 4);
  assert.deepEqual(jammerRoles({ players: ps, round: 1 }), { dasmon: ps[0], jammer: ps[1] });
  assert.deepEqual(jammerRoles({ players: ps, round: 4 }), { dasmon: ps[3], jammer: ps[0] });
});
test("ジャマーの採点：正解 +難易度／外れ1人につきジャマー +1／半数以上正解でダスモン +1", () => {
  // order: 表示順の中身（0=本物）。本物は 1 番目
  const jam = { dasmonId: "a", jammerId: "b", pts: 2, order: [1, 0, 2], picks: { c: 1, d: 0, e: 1 } };
  const r = scoreJammer({ players: P.slice(0, 5), jam });
  assert.equal(r.outcome, "2/3");
  assert.deepEqual(r.delta, { う: 2, お: 2, い: 1, あ: 1 });
  // 未回答は0点、ダスモンのボーナスは半数に届かないと無し
  const r2 = scoreJammer({ players: P.slice(0, 5), jam: { ...jam, picks: { c: 0 } } });
  assert.deepEqual(r2.delta, { い: 1 });
});

// ── ラウンドの開始と終わり ──
test("開始：インサイダーはマスター以外から。フォロワーは6人以上だけ。マジカルは全員に魔術カード", () => {
  const lobby = { ...freshRoom("あ", "a"), players: P.slice(0, 5), wordEnc: enc("寿司"), follower: true };
  for (let i = 0; i < 20; i++) {
    const s = startInsider(lobby);
    assert.equal(s.phase, "playing");
    assert.notEqual(dec(s.insiderEnc), "a");
    assert.equal(s.followerEnc, null); // 5人なので付かない
  }
  const six = startInsider({ ...lobby, players: P });
  assert.ok(six.followerEnc && dec(six.followerEnc) !== dec(six.insiderEnc) && dec(six.followerEnc) !== "a");
  const magic = startInsider({ ...lobby, magic: true, follower: false }, { deal: (n) => Array.from({ length: n }, (_, i) => ({ t: `c${i}`, d: "x" })) });
  assert.deepEqual(Object.keys(magic.magicCards).sort(), ["b", "c", "d", "e"]);
  assert.equal(startInsider({ ...lobby, wordEnc: null }), undefined); // お題なし
  assert.equal(startInsider({ ...lobby, players: P.slice(0, 2) }), undefined); // 2人
  assert.deepEqual(startInsider({ ...lobby, usedWords: ["x"] }).usedWords, ["x", "寿司"]);
});
test("開始：マスターが部屋にいなければ部屋主が代わる", () => {
  const s = startInsider({ ...freshRoom("あ", "a"), players: P.slice(0, 4), masterId: "gone", wordEnc: enc("寿司") });
  assert.equal(s.masterId, "a");
});
test("ロビーへ戻す：お題・役職・票を片付け、進めるならラウンドとマスターを進める", () => {
  const playing = { ...freshRoom("あ", "a"), players: P.slice(0, 3), masterRule: "robin", phase: "result", round: 2,
    wordEnc: enc("x"), insiderEnc: enc("b"), votes: { a: "b" }, scored: true, jam: { q: "?" } };
  const n = toLobby(playing);
  assert.equal(n.phase, "lobby");
  assert.equal(n.round, 3);
  assert.equal(n.masterId, "b");
  assert.equal(n.votes, null);
  assert.equal(n.jam, null);
  assert.equal(n.scored, false);
  const stay = toLobby(playing, { advance: false });
  assert.equal(stay.round, 2);
  assert.equal(stay.masterId, "a");
});

// ── ワードウルフ・ジャマーの開始 ──
import { startWolfRound, startJammerRound } from "../src/lib/rounds.js";
test("ウルフ開始：ウルフは人数どおり、お題は2語、終了時刻が決まる", () => {
  const five = startWolfRound({ ...freshRoom("あ", "a"), players: P.slice(0, 5), wolfDuration: 240 }, 1000);
  assert.equal(JSON.parse(dec(five.wolf.wolvesEnc)).length, 1);
  assert.notEqual(dec(five.wolf.majEnc), dec(five.wolf.minEnc));
  assert.equal(five.wolfEndAt, 1000 + 240_000);
  assert.equal(five.usedPairs.length, 1);
  const seven = startWolfRound({ ...freshRoom("あ", "a"), players: [...P, { id: "g", name: "き" }] });
  assert.equal(JSON.parse(dec(seven.wolf.wolvesEnc)).length, 2);
});
test("ジャマー開始：役がじゅんぐりで決まり、質問が1枚配られる", () => {
  const r = startJammerRound({ ...freshRoom("あ", "a"), players: P.slice(0, 4), round: 2 });
  assert.equal(r.jam.dasmonId, "b");
  assert.equal(r.jam.jammerId, "c");
  assert.equal(r.jam.step, "answer");
  assert.ok(r.jam.q && [1, 2, 3].includes(r.jam.pts));
});
