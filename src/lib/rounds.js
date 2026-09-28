// ワードウルフ・ワードジャマーのラウンド開始（App のトランザクションの中から呼ぶ純関数）
import { pickWolfPair, pickJammerQuestion } from "./words.js";
import { enc, shuffle } from "./util.js";
import { wolfCount, jammerRoles } from "./rules.js";

export function startWolfRound(room, now = Date.now()) {
  const players = room.players || [];
  const [maj, min] = pickWolfPair(room.usedPairs || [], !!room.adult);
  const wolves = shuffle(players).slice(0, wolfCount(players.length)).map((p) => p.id);
  const dur = room.wolfDuration || 180;
  return {
    ...room, phase: "playing", votes: null, scored: false, outcome: null, lastDelta: null,
    startTime: now, wolfEndAt: now + dur * 1000, // 話し合いの終了時刻（各端末がこれを見て計算）
    usedPairs: [...(room.usedPairs || []), [maj, min].sort().join("|")].slice(-200),
    wolf: { majEnc: enc(maj), minEnc: enc(min), wolvesEnc: enc(JSON.stringify(wolves)) },
  };
}

export function startJammerRound(room) {
  const { dasmon, jammer } = jammerRoles(room);
  const card = pickJammerQuestion(room.usedQuestions || [], !!room.adult);
  return {
    ...room, phase: "playing", votes: null, scored: false, outcome: null, lastDelta: null,
    usedQuestions: [...(room.usedQuestions || []), card.q].slice(-200),
    jam: { dasmonId: dasmon.id, jammerId: jammer.id, q: card.q, pts: card.pts, step: "answer" },
  };
}
