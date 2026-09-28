import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeName, topVote, shuffle, computeFlair, addScores, addToBoard, enc, dec, fmt } from "../src/lib/util.js";
import { validateForFirebase, normalizeLikeFirebase } from "../src/lib/fbnorm.js";

test("名前：Firebase のキーに使えない記号は全角にする（そのままだと採点の保存で止まる）", () => {
  assert.equal(sanitizeName("Mr.X"), "Mr．X");
  assert.equal(sanitizeName("a/b#c$[d]"), "a／b＃c＄［d］");
  assert.equal(sanitizeName("  こ   い  "), "こ い");
  assert.equal(sanitizeName("1234567890123"), "1234567890");
  assert.equal(sanitizeName("\u0007ベル"), "ベル");
  // 直した名前は、得点表のキーとして保存できる
  assert.doesNotThrow(() => validateForFirebase({ scores: { [sanitizeName("Mr.X#1")]: 2 } }));
  assert.throws(() => validateForFirebase({ scores: { "Mr.X": 2 } }));
});

test("票の集計：単独1位だけを返し、同数は null", () => {
  assert.equal(topVote({ a: "x", b: "x", c: "y" }).top, "x");
  assert.equal(topVote({ a: "x", b: "y" }).top, null);
  assert.equal(topVote(undefined).top, null);
});

test("シャッフル：中身は変わらない", () => {
  const src = [1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 20; i++) assert.deepEqual([...shuffle(src)].sort(), src);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6]); // 元の配列は変えない
});

test("順位の印：1位 crown・ビリ poop、全員同点なら無し", () => {
  const ps = [{ name: "あ" }, { name: "い" }, { name: "う" }];
  assert.deepEqual(computeFlair(ps, { あ: { pts: 5 }, い: { pts: 5 }, う: { pts: -1 } }), { あ: "crown", い: "crown", う: "poop" });
  assert.deepEqual(computeFlair(ps, {}), {});
});

test("得点の加算と通算成績", () => {
  assert.deepEqual(addScores({ あ: 1 }, { あ: 2, い: -1 }), { あ: 3, い: -1 });
  const b = addToBoard({ あ: { pts: 3, games: 2, wins: 1 } }, [{ name: "あ" }, { name: "い" }], { あ: 2 }, ["あ"]);
  assert.deepEqual(b, { あ: { pts: 5, games: 3, wins: 2 }, い: { pts: 0, games: 1, wins: 0 } });
});

test("難読化と時計の表示", () => {
  assert.equal(dec(enc("だいしゅきホールド")), "だいしゅきホールド");
  assert.equal(dec("壊れた文字列"), "");
  assert.equal(fmt(125), "02:05");
});

// ── Firebase の保存のくせ（mock DB がこれを再現する）──
test("Firebase：null・空のオブジェクト・空の配列は消える（ans: null の質問は ans が無くなる）", () => {
  assert.deepEqual(normalizeLikeFirebase({ q: "甘い？", ans: null, by: "あ" }), { q: "甘い？", by: "あ" });
  assert.equal(normalizeLikeFirebase({ votes: {}, qa: [] }), undefined);
  assert.deepEqual(normalizeLikeFirebase({ a: 1, votes: {} }), { a: 1 });
});
test("Firebase：添字キーのオブジェクトは配列に戻る（qa/0 だけ書いても配列で読める）", () => {
  assert.deepEqual(normalizeLikeFirebase({ qa: { 0: { q: "x" } } }), { qa: [{ q: "x" }] });
  const holey = normalizeLikeFirebase({ 0: "a", 2: "c" });
  assert.equal(Array.isArray(holey), true);
  assert.equal(holey[2], "c");
  assert.deepEqual(normalizeLikeFirebase({ 0: "a", 9: "z" }), { 0: "a", 9: "z" }); // まばら過ぎるとオブジェクトのまま
});
test("Firebase：undefined や使えないキーは書き込みエラー", () => {
  assert.throws(() => validateForFirebase({ outcome: undefined }));
  assert.throws(() => validateForFirebase({ "a.b": 1 }));
  assert.throws(() => validateForFirebase({ x: NaN }));
  assert.doesNotThrow(() => validateForFirebase({ ans: null, list: [1, 2], nested: { ok: "はい" } }));
});
