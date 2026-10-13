// 撮影モードの場面見本（dev:mock の ?shot=<id> で開く。npm run shots で全部撮る）。
// 本番のビルドには入らない（main.jsx が dev:mock のときだけ読み込む）。
// 見る人はいつも「てこ（me1）」。as を変えると別の人として見る。
import { enc, NONE_ID } from "../lib/util.js";

const P5 = [{ id: "me1", name: "てこ" }, { id: "p2", name: "もも" }, { id: "p3", name: "やま" }, { id: "p4", name: "うみ" }, { id: "p5", name: "そら" }];
const P6 = [...P5, { id: "p6", name: "かいと" }];
const SCORES = { てこ: 3, もも: 5, やま: 0, うみ: 2, そら: -1 };
export const LB = { てこ: { pts: 7, games: 5, wins: 3 }, もも: { pts: 9, games: 5, wins: 4 }, やま: { pts: 2, games: 5, wins: 1 }, うみ: { pts: 4, games: 5, wins: 2 }, そら: { pts: -1, games: 5, wins: 0 } };
const W = (w) => enc(w);
const ago = (sec) => Date.now() - sec * 1000;
const room = (patch = {}) => ({
  game: "insider", phase: "lobby", round: 3, masterRule: "random", hostId: "me1", masterId: "me1",
  players: P5, scores: SCORES, duration: 300, wolfDuration: 180, ...patch,
});
const QA = [
  { id: "a", q: "食べられる？", ans: "YES", by: "もも" },
  { id: "b", q: "甘い？", ans: "NO", by: "やま" },
  { id: "c", q: "お店で買うことが多い？", ans: "YES", by: "うみ" },
];
const CARDS = { me1: { t: "ロボット", d: "ロボットのようにカクカクと一定のリズムで話す" }, p3: { t: "にゃんこ", d: "語尾に必ず「〜にゃ」をつける" }, p4: { t: "武士", d: "武士の口調（〜でござるか？）で話す" }, p5: { t: "ヒソヒソ声", d: "ささやき声でしか話せない" } };
const playing = (patch = {}) => room({ phase: "playing", hostId: "p2", masterId: "p2", insiderEnc: enc("p3"), wordEnc: W("ハンバーガー"), startTime: ago(40), ...patch });
const wolf = (wolves, patch = {}) => room({ game: "wordwolf", phase: "playing", startTime: ago(30), wolfEndAt: Date.now() + 150000,
  wolf: { majEnc: W("寿司"), minEnc: W("刺身"), wolvesEnc: enc(JSON.stringify(wolves)) }, ...patch });
const jam = (j, patch = {}) => room({ game: "jammer", phase: "playing", round: 2, jam: { q: "子どもの頃なりたかった職業は？", pts: 2, ...j }, ...patch });
const JAM_PICK = { answerEnc: W("パン屋さん"), fakesEnc: [W("宇宙飛行士"), W("ケーキ屋さん")], order: [2, 0, 1], step: "pick" };

export const SCENES = [
  // ── ホームまわり ──
  { id: "home", title: "ホーム", expect: "home" },
  { id: "home-resume", title: "ホーム（つづきから）", expect: "home", room: room({ hostId: "p2", masterId: "p2" }) },
  { id: "home-closed", title: "ホーム（閉まっている）", expect: "home", gate: false },
  { id: "home-host", title: "ホーム（主催者）", expect: "home", host: true },
  { id: "home-offline", title: "ホーム（電波なし）", expect: "home", offline: true },
  { id: "lb", title: "通算成績", expect: "lb", screen: "lb" },
  { id: "guide-start", title: "あそびかた：はじめに", expect: "tutorial", screen: "tutorial", guideTab: "start" },
  { id: "guide-insider", title: "あそびかた：インサイダー", expect: "tutorial", screen: "tutorial", guideTab: "insider" },
  { id: "guide-wolf", title: "あそびかた：ウルフ", expect: "tutorial", screen: "tutorial", guideTab: "wolf" },
  { id: "guide-jammer", title: "あそびかた：ジャマー", expect: "tutorial", screen: "tutorial", guideTab: "jammer" },
  { id: "guide-opts", title: "あそびかた：オプション", expect: "tutorial", screen: "tutorial", guideTab: "opts" },
  // ── ロビー ──
  { id: "lobby-host", title: "ロビー（部屋主・マスター・3ラウンド目＝設定はたたんである）", expect: "lobby", host: true, room: room({ wordEnc: W("ハンバーガー"), follower: true }) },
  { id: "lobby-adult", title: "ロビー（アダルト・エロ度を選ぶ）", expect: "lobby", host: true, room: room({ adult: true, adultLevel: 2 }) },
  { id: "lobby-host-first", title: "ロビー（部屋主・1ラウンド目＝設定が開いている）", expect: "lobby", host: true, room: room({ round: 1, scores: {} }) },
  { id: "lobby-guest", title: "ロビー（参加者）", expect: "lobby", room: room({ hostId: "p2", masterId: "p3" }) },
  { id: "lobby-magic", title: "ロビー（マジカル・部屋主）", expect: "lobby", host: true, room: room({ magic: true, masterId: "p4" }) },
  { id: "lobby-wolf", title: "ロビー（ワードウルフ・部屋主）", expect: "lobby", host: true, room: room({ game: "wordwolf" }) },
  { id: "lobby-jammer", title: "ロビー（ワードジャマー・参加者）", expect: "lobby", room: room({ game: "jammer", round: 2, hostId: "p2" }) },
  // ── インサイダー：役職配り ──
  { id: "reveal-closed", title: "役職配り（開封前）", expect: "reveal", room: playing() },
  { id: "reveal-insider", title: "役職：インサイダー", expect: "reveal", revealed: true, room: playing({ insiderEnc: enc("me1") }) },
  { id: "reveal-master", title: "役職：マスター", expect: "reveal", revealed: true, room: playing({ masterId: "me1" }) },
  { id: "reveal-common", title: "役職：コモン", expect: "reveal", revealed: true, room: playing() },
  { id: "reveal-follower", title: "役職：フォロワー", expect: "reveal", revealed: true, room: playing({ players: P6, follower: true, followerEnc: enc("me1") }) },
  { id: "reveal-wizard", title: "役職：魔術師（マジカル）", expect: "reveal", revealed: true, room: playing({ magic: true, masterId: "me1", magicCards: { p2: CARDS.p3, p3: CARDS.p3, p4: CARDS.p4, p5: CARDS.p5 } }) },
  { id: "reveal-villager", title: "役職：村人（マジカル）", expect: "reveal", revealed: true, room: playing({ magic: true, magicCards: CARDS }) },
  // ── インサイダー：質問タイム ──
  { id: "game-master", title: "質問タイム（マスター・質問が来た）", expect: "game", screen: "game", room: playing({ masterId: "me1", hostId: "me1", startTime: ago(95), qa: [...QA, { id: "d", q: "パンにはさむ？", by: "そら" }] }) },
  { id: "game-common", title: "質問タイム（コモン・隠れている）", expect: "game", screen: "game", room: playing({ qa: QA }) },
  { id: "game-offline", title: "質問タイム（電波なし）", expect: "game", screen: "game", offline: true, room: playing({ qa: QA }) },
  { id: "game-hint", title: "質問タイム（カテゴリ公開）", expect: "game", screen: "game", room: playing({ hint: true, wordCat: "食べもの", qa: QA }) },
  { id: "game-insider-peek", title: "質問タイム（インサイダー・押して見ている）", expect: "game", screen: "game", peek: true, room: playing({ insiderEnc: enc("me1"), qa: QA }) },
  { id: "game-villager-peek", title: "質問タイム（村人・押して見ている）", expect: "game", screen: "game", peek: true, room: playing({ magic: true, magicCards: CARDS, qa: QA }) },
  { id: "game-danger", title: "質問タイム（残り10秒以内）", expect: "game", screen: "game", room: playing({ startTime: ago(293), qa: QA }) },
  { id: "game-timeup", title: "質問タイム（時間切れ・マスター）", expect: "game", screen: "game", room: playing({ masterId: "me1", hostId: "me1", startTime: ago(420), qa: QA }) },
  // ── インサイダー：投票 ──
  { id: "vote-common", title: "投票（えらぶ前）", expect: "vote", room: playing({ phase: "vote", wordGuessed: true, votes: { p4: "p3", p5: "p3" } }) },
  { id: "vote-voted", title: "投票（投票ずみ）", expect: "vote", room: playing({ phase: "vote", wordGuessed: true, votes: { me1: "p3", p4: "p3" } }) },
  { id: "vote-peace", title: "投票（平和村あり）", expect: "vote", room: playing({ phase: "vote", peace: true, wordGuessed: true }) },
  { id: "vote-wizard", title: "投票（魔術師が指名）", expect: "vote", room: playing({ phase: "vote", magic: true, masterId: "me1", wordGuessed: true }) },
  { id: "vote-magic-wait", title: "投票（村人は待つ）", expect: "vote", room: playing({ phase: "vote", magic: true, wordGuessed: true, magicCards: CARDS }) },
  // ── インサイダー：結果 ──
  { id: "result-commons", title: "結果：コモンの勝利", expect: "result", room: playing({ phase: "result", scored: true, outcome: "commons", wordGuessed: true,
    votes: { me1: "p3", p2: "p3", p3: "p4", p4: "p3", p5: "me1" }, lastDelta: { てこ: 2, もも: 2, うみ: 2, そら: 2 }, scores: { てこ: 5, もも: 7, やま: 0, うみ: 4, そら: 1 } }) },
  { id: "result-insider", title: "結果：インサイダーの勝利", expect: "result", room: playing({ phase: "result", scored: true, outcome: "insider", wordGuessed: true,
    votes: { me1: "p4", p2: "p4", p3: "p4", p4: "p3", p5: "p3" }, lastDelta: { やま: 3 }, scores: { てこ: 3, もも: 5, やま: 3, うみ: 2, そら: -1 } }) },
  { id: "result-timeout", title: "結果：時間切れ", expect: "result", room: playing({ phase: "result", scored: true, outcome: "timeout",
    lastDelta: { てこ: -1, やま: -2, うみ: -1, そら: -1 }, scores: { てこ: 2, もも: 5, やま: -2, うみ: 1, そら: -2 } }) },
  { id: "result-peace", title: "結果：平和村", expect: "result", room: playing({ phase: "result", scored: true, outcome: "peace_win", isPeaceVillage: true, peace: true, insiderEnc: null, wordGuessed: true,
    votes: { me1: NONE_ID, p2: NONE_ID, p3: NONE_ID, p4: "p3", p5: NONE_ID }, lastDelta: { てこ: 1, もも: 1, やま: 1, うみ: 1, そら: 1 }, scores: { てこ: 4, もも: 6, やま: 1, うみ: 3, そら: 0 } }) },
  { id: "result-magic", title: "結果：魔術師の勝利（マジカル）", expect: "result", room: playing({ phase: "result", scored: true, outcome: "magic_wizard", magic: true, wordGuessed: true, magicCards: CARDS,
    votes: { p2: "p3" }, lastDelta: { もも: 3 }, scores: { てこ: 3, もも: 8, やま: 0, うみ: 2, そら: -1 } }) },
  // ── ワードウルフ ──
  { id: "wolf-reveal", title: "ウルフ：お題を見る前", expect: "sub", room: wolf(["p4"]) },
  { id: "wolf-play", title: "ウルフ：話し合い（隠れている）", expect: "sub", revealed: true, room: wolf(["p4"]) },
  { id: "wolf-play-peek", title: "ウルフ：話し合い（押して見ている）", expect: "sub", revealed: true, peek: true, room: wolf(["p4"]) },
  { id: "wolf-vote", title: "ウルフ：投票", expect: "sub", room: wolf(["p4"], { phase: "vote", votes: { p2: "p4", p3: "p4" } }) },
  { id: "wolf-guess-caught", title: "ウルフ：吊られた（逆転の回答）", expect: "sub", room: wolf(["me1"], { phase: "wolfguess", wolf: { majEnc: W("寿司"), minEnc: W("刺身"), wolvesEnc: enc(JSON.stringify(["me1"])), caughtId: "me1" } }) },
  { id: "wolf-guess-judge", title: "ウルフ：逆転の判定（市民）", expect: "sub", room: wolf(["p4"], { phase: "wolfguess", wolf: { majEnc: W("寿司"), minEnc: W("刺身"), wolvesEnc: enc(JSON.stringify(["p4"])), caughtId: "p4", guess: "回転寿司" } }) },
  { id: "wolf-result", title: "ウルフ：結果", expect: "sub", room: wolf(["p4"], { phase: "result", scored: true, outcome: "citizens",
    votes: { me1: "p4", p2: "p4", p3: "p5", p4: "me1", p5: "p4" }, lastDelta: { てこ: 1, もも: 1, やま: 1, そら: 1 }, scores: { てこ: 4, もも: 6, やま: 1, うみ: 2, そら: 0 } }) },
  // ── ワードジャマー ──
  { id: "jam-answer-dasmon", title: "ジャマー：答えを書く（ダスモン）", expect: "sub", room: jam({ dasmonId: "me1", jammerId: "p2", step: "answer" }, { round: 1 }) },
  { id: "jam-answer-wait", title: "ジャマー：待つ（ワカルン）", expect: "sub", room: jam({ dasmonId: "p2", jammerId: "p3", step: "answer" }) },
  { id: "jam-fake-jammer", title: "ジャマー：嘘を書く（ジャマー）", expect: "sub", room: jam({ dasmonId: "p2", jammerId: "me1", step: "fake", answerEnc: W("パン屋さん") }) },
  { id: "jam-pick-wakarun", title: "ジャマー：本物をえらぶ（ワカルン）", expect: "sub", room: jam({ dasmonId: "p2", jammerId: "p3", ...JAM_PICK, picks: { p4: 1 } }) },
  { id: "jam-pick-dasmon", title: "ジャマー：回答待ち（ダスモン）", expect: "sub", room: jam({ dasmonId: "me1", jammerId: "p2", ...JAM_PICK, picks: { p4: 1 } }, { round: 1 }) },
  { id: "jam-result", title: "ジャマー：結果", expect: "sub", room: jam({ dasmonId: "p2", jammerId: "p3", ...JAM_PICK, picks: { me1: 1, p4: 1, p5: 0 } },
    { phase: "result", scored: true, outcome: "2/3", lastDelta: { てこ: 2, うみ: 2, やま: 1, もも: 1 }, scores: { てこ: 5, もも: 6, やま: 1, うみ: 4, そら: -1 } }) },
];
