// お題リストの点検（空の語・同じ語の重複・ペアの片割れ同一などの事故を防ぐ）
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WORD_LIST, ADULT_LIST, MAGIC_CARDS, WOLF_PAIRS, WOLF_PAIRS_ADULT, JAMMER_QUESTIONS, JAMMER_QUESTIONS_ADULT,
  pickWord, pickWolfPair, pickJammerQuestion, dealMagicCards,
} from "../src/lib/words.js";

const dupes = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

test("お題：空の語が無く、同じリストの中に重複が無い", () => {
  for (const [cat, list] of Object.entries(WORD_LIST)) {
    assert.ok(list.length >= 20, `${cat} が少なすぎる`);
    assert.ok(list.every((w) => typeof w === "string" && w.trim()), `${cat} に空の語`);
    assert.deepEqual(dupes(list), [], `${cat} に重複`);
  }
  assert.deepEqual(dupes(ADULT_LIST), [], "アダルトに重複");
  assert.ok(ADULT_LIST.length >= 150);
});

test("お題：アダルトの語は通常の「おまかせ」に混ざらない", () => {
  const normal = new Set(Object.values(WORD_LIST).flat());
  for (let i = 0; i < 300; i++) assert.ok(normal.has(pickWord("おまかせ", [], false)));
  for (let i = 0; i < 100; i++) assert.ok(ADULT_LIST.includes(pickWord("食べもの", [], true)));
});

test("お題：使ったお題はなるべく避ける", () => {
  const list = WORD_LIST["食べもの"];
  const used = list.slice(1);
  for (let i = 0; i < 20; i++) assert.equal(pickWord("食べもの", used, false), list[0]);
});

test("ワードウルフ：ペアは2語で別々の語、重複ペアが無い", () => {
  for (const pairs of [WOLF_PAIRS, WOLF_PAIRS_ADULT]) {
    assert.ok(pairs.every((p) => p.length === 2 && p[0] && p[1] && p[0] !== p[1]));
    assert.deepEqual(dupes(pairs.map((p) => [...p].sort().join("|"))), []);
  }
  const [maj, min] = pickWolfPair([], false);
  assert.notEqual(maj, min);
});

test("ワードジャマー：難易度は1〜3、同じ質問が無い", () => {
  for (const qs of [JAMMER_QUESTIONS, JAMMER_QUESTIONS_ADULT]) {
    assert.ok(qs.every((q) => q.q && [1, 2, 3].includes(q.pts)));
    assert.deepEqual(dupes(qs.map((q) => q.q)), []);
  }
  assert.ok(JAMMER_QUESTIONS.includes(pickJammerQuestion([], false)));
});

test("魔術カード：人数ぶん配れて、人数が少なければ重複しない", () => {
  assert.ok(MAGIC_CARDS.every((c) => c.t && c.d));
  const five = dealMagicCards(5);
  assert.equal(five.length, 5);
  assert.equal(new Set(five.map((c) => c.t)).size, 5);
  assert.equal(dealMagicCards(30).length, 30);
});
