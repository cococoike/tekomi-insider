// ゲームのルール（採点・入室・画面の決め方）。画面や Firebase から切り離した純粋な関数だけを置く。
// ここを直したら `npm test` で確かめる（tests/rules.test.js が全パターンを見ている）。
import { enc, dec, topVote, addScores, NONE_ID } from "./util.js";

// ── 採点の確定 ───────────────────────────────────────
// 「まだ採点されていない部屋」だけを結果画面へ進める。すでに採点済みなら undefined（何もしない）。
// Firebase のトランザクションの中で使うので、2台が同時に採点しても1回しか通らない。
//   compute(いまの部屋) → { delta, winners, outcome, patch } / 採点しないなら null
export function claimResult(cur, compute) {
  if (!cur || cur.scored || cur.phase === "result") return undefined;
  const r = compute(cur);
  if (!r) return undefined;
  return {
    r,
    next: {
      ...cur, ...(r.patch || {}),
      phase: "result", scored: true, outcome: r.outcome,
      scores: addScores(cur.scores, r.delta),
      lastDelta: r.delta, // このラウンドで増えた点（結果画面の「+2」表示用）
    },
  };
}

// ── 部屋 ─────────────────────────────────────────────
export function freshRoom(name, uid) {
  return {
    game: "insider",
    phase: "lobby", round: 1, peace: false, adult: false, follower: false, magic: false, masterRule: "random",
    hostId: uid, masterId: uid, players: [{ id: uid, name }],
    duration: 300, wordGuessed: false, scored: false, isPeaceVillage: false,
    wolfDuration: 180,
  };
}

// 入室。部屋の「いまの値」を受け取り、書き込む値（書かないなら undefined）と結果を返す。
// Firebase のトランザクションの中で呼ぶので、同時に何人入っても誰も消えない。
//   同名 = 同一アカウント（別の端末から同じ名前で入ると、その人として続きから遊べる）
//   同じ端末が別の名前で入り直したら、名前を付け替える（同じ人が2人に増えない）
export function applyJoin(cur, { name, uid, asHost = false }) {
  if (!cur || !Array.isArray(cur.players) || cur.players.length === 0) {
    // 部屋はあるが全員抜けた場合は、設定と得点を残して入り直す。何も無ければ新しく作る。
    const keep = cur && typeof cur === "object" && cur.round ? cur : null;
    const next = keep
      ? { ...keep, phase: "lobby", players: [{ id: uid, name }], hostId: uid, masterId: uid }
      : freshRoom(name, uid);
    return { next, uid, name, created: !keep };
  }
  const players = cur.players;
  const byName = players.find((p) => p.name === name);
  const byId = players.find((p) => p.id === uid);

  if (cur.phase !== "lobby") {
    // ゲーム中は新しい人は入れない。いる人（同じ名前 or 同じ端末）だけ戻れる
    const me = byName || byId;
    if (!me) return { next: undefined, error: "playing" };
    return { next: undefined, uid: me.id, name: me.name };
  }

  const next = { ...cur };
  let myUid = uid;
  if (byName) {
    myUid = byName.id;
  } else if (byId) {
    next.players = players.map((p) => (p.id === uid ? { ...p, name } : p));
    if (cur.scores && cur.scores[byId.name] !== undefined) {
      const s = { ...cur.scores };
      s[name] = (s[name] || 0) + s[byId.name];
      delete s[byId.name];
      next.scores = s;
    }
  } else {
    next.players = [...players, { id: uid, name }];
  }
  if (asHost && next.hostId !== myUid) next.hostId = myUid;
  const changed = next.players !== cur.players || next.hostId !== cur.hostId || next.scores !== cur.scores;
  return { next: changed ? next : undefined, uid: myUid, name };
}

// ロビーで部屋から抜ける／部屋主が外す。部屋主やマスターが抜けたら引き継ぐ。
export function applyLeave(cur, uid) {
  if (!cur || !Array.isArray(cur.players)) return undefined;
  if (cur.phase !== "lobby") return undefined; // ゲーム中は抜けさせない（役職が壊れる）
  if (!cur.players.some((p) => p.id === uid)) return undefined;
  const players = cur.players.filter((p) => p.id !== uid);
  const next = { ...cur, players };
  if (cur.hostId === uid) next.hostId = players[0]?.id || null;
  if (cur.masterId === uid) next.masterId = next.hostId || players[0]?.id || null;
  return next;
}

// ロビーへ戻す（次のラウンド／部屋主の「ラウンド中止」）。
// advance=true でラウンドを進めてマスターを交代する（ジャマーのダスモンも次の人になる）
export function toLobby(cur, { advance = true } = {}) {
  const next = {
    ...cur, phase: "lobby",
    wordEnc: null, insiderEnc: null, followerEnc: null, isPeaceVillage: false, magicCards: null,
    startTime: null, wordGuessed: false, votes: null, qa: null, scored: false, outcome: null, lastDelta: null,
    wolf: null, wolfEndAt: null, jam: null, timeLeft: null,
  };
  if (advance) {
    next.round = (cur.round || 1) + 1;
    next.masterId = nextMaster(cur.players, cur.masterId, cur.masterRule || "random", cur.hostId);
  }
  return next;
}

// インサイダーのラウンド開始（役職を配る）。始められない状態なら undefined
export function startInsider(cur, { rnd = Math.random, deal = null, now = Date.now() } = {}) {
  const players = cur?.players || [];
  if (!cur?.wordEnc || players.length < 3 || cur.phase !== "lobby") return undefined;
  // マスターが抜けていたら部屋主（いなければ先頭）が代わる
  const masterId = players.some((p) => p.id === cur.masterId) ? cur.masterId
    : (players.some((p) => p.id === cur.hostId) ? cur.hostId : players[0].id);
  const nonMasters = players.filter((p) => p.id !== masterId);
  const magic = !!cur.magic;
  const isPeaceVillage = !magic && !!cur.peace && rnd() < 0.1; // 平和村は10%
  const insider = isPeaceVillage ? null : nonMasters[Math.floor(rnd() * nonMasters.length)];
  let followerEnc = null;
  // フォロワー：6人以上＆インサイダー在のときだけ、インサイダー以外から1名（マジカル時は無し）
  if (!magic && cur.follower && insider && players.length >= 6) {
    const pool = nonMasters.filter((p) => p.id !== insider.id);
    if (pool.length) followerEnc = enc(pool[Math.floor(rnd() * pool.length)].id);
  }
  // マジカル：村人チーム全員に魔術カード（しゃべり方の縛り）を配る
  let magicCards = null;
  if (magic && deal) {
    const cards = deal(nonMasters.length);
    magicCards = {};
    nonMasters.forEach((p, i) => { magicCards[p.id] = cards[i]; });
  }
  return {
    ...cur, masterId, phase: "playing",
    insiderEnc: insider ? enc(insider.id) : null, followerEnc, isPeaceVillage, magicCards,
    startTime: now, wordGuessed: false, votes: null, qa: null, scored: false, outcome: null, lastDelta: null,
    usedWords: [...(cur.usedWords || []), dec(cur.wordEnc)].slice(-300),
  };
}

// 次のマスターを決める
export function nextMaster(players, curId, rule, hostId, rnd = Math.random) {
  if (!players || players.length === 0) return hostId;
  if (rule === "fixed") return players.some((p) => p.id === hostId) ? hostId : players[0].id;
  const idx = players.findIndex((p) => p.id === curId);
  if (rule === "robin") return players[(idx + 1) % players.length].id;
  // random（直前のマスターはなるべく避ける）
  const pool = players.length > 1 ? players.filter((p) => p.id !== curId) : players;
  return pool[Math.floor(rnd() * pool.length)].id;
}

// ── 画面の決め方 ─────────────────────────────────────
// 部屋の進行（phase）から、その人が見るべき画面を1つに決める。
// 以前は「今の画面→次の画面」の組み合わせで遷移していたため、投票中にリロードして入り直すと
// ロビーに取り残されて投票できなかった。
export function screenFor(room, cur) {
  if (!room) return "home";
  const game = room.game || "insider";
  const phase = room.phase || "lobby";
  if (phase === "lobby") return "lobby";
  if (game !== "insider") return "sub";
  if (phase === "playing") return cur === "game" ? "game" : "reveal";
  if (phase === "vote") return "vote";
  if (phase === "result") return "result";
  return "lobby";
}

// ── インサイダー ─────────────────────────────────────
// 未回答の質問かどうか。Firebase は null のキーを保存しないので、読み戻すと ans は undefined になる。
export const isUnanswered = (item) => item?.ans === null || item?.ans === undefined;

// 残り時間は startTime を正として各端末が自分で計算する（延長は duration を伸ばす）
export const calcLeft = (d, now = Date.now()) => {
  if (!d?.startTime) return d?.duration || 300;
  return Math.max(0, (d.duration || 300) - Math.floor((now - d.startTime) / 1000));
};

// 自分の役職（インサイダー）
export function roleOf(room, myId) {
  if (!room) return "common";
  const magic = !!room.magic;
  if (room.masterId === myId) return magic ? "wizard" : "master";
  if (room.followerEnc && dec(room.followerEnc) === myId) return "follower";
  if (room.insiderEnc && dec(room.insiderEnc) === myId) return "insider";
  return magic ? "villager" : "common";
}

// 投票が出そろったか（通常＝全員／マジカル＝魔術師1人）
export function votesComplete(room) {
  const players = room?.players || [];
  if (!players.length) return false;
  if (room.magic) return !!room.votes?.[room.masterId];
  return players.every((p) => room.votes?.[p.id]);
}

// 採点。{ delta: 名前→点, winners: 勝った名前, outcome } を返す
export function scoreInsider(data) {
  const players = data.players || [];
  const isPeace = !!data.isPeaceVillage;
  const insiderId = isPeace ? null : dec(data.insiderEnc || "");
  const followerId = dec(data.followerEnc || "");
  const delta = {};
  const add = (name, pts) => { delta[name] = (delta[name] || 0) + pts; };
  let outcome;
  let winners = [];

  if (data.magic) {
    // マジカル：マスター＝魔術師 vs 村人チーム（インサイダー＋村人）
    const wizard = players.find((p) => p.id === data.masterId);
    const team = players.filter((p) => p.id !== data.masterId);
    if (!data.wordGuessed) {
      if (wizard) { add(wizard.name, 2); winners.push(wizard.name); }
      team.forEach((p) => add(p.name, -1));
      outcome = "magic_timeout";
    } else {
      const guess = (data.votes || {})[data.masterId];
      if (guess && guess === insiderId) {
        if (wizard) { add(wizard.name, 3); winners.push(wizard.name); }
        outcome = "magic_wizard";
      } else {
        team.forEach((p) => { add(p.name, 2); winners.push(p.name); });
        outcome = "magic_village";
      }
    }
  } else if (isPeace) {
    if (!data.wordGuessed) {
      outcome = "peace_timeout";
    } else if (topVote(data.votes).top === NONE_ID) {
      players.forEach((p) => { add(p.name, 1); winners.push(p.name); });
      outcome = "peace_win";
    } else {
      outcome = "peace_lose";
    }
  } else {
    // 通常（ふつう／アダルト）。フォロワーはインサイダーと運命共同体。
    const fol = followerId ? players.find((p) => p.id === followerId) : null;
    if (!data.wordGuessed) {
      players.forEach((p) => {
        if (p.id === data.masterId) return;
        if (p.id === insiderId || p.id === followerId) add(p.name, -2);
        else add(p.name, -1);
      });
      outcome = "timeout";
    } else if (topVote(data.votes).top === insiderId) {
      players.forEach((p) => {
        if (p.id === data.masterId) { add(p.name, 2); winners.push(p.name); }
        else if (p.id !== insiderId && p.id !== followerId) { add(p.name, 2); winners.push(p.name); }
      });
      outcome = "commons";
    } else {
      const ins = players.find((p) => p.id === insiderId);
      if (ins) { add(ins.name, 3); winners = [ins.name]; }
      if (fol) { add(fol.name, 2); winners.push(fol.name); }
      outcome = "insider";
    }
  }
  return { delta, winners, outcome };
}

// ── ワードウルフ ─────────────────────────────────────
export const wolfCount = (n) => (n >= 7 ? 2 : 1);
export const wolvesOf = (room) => { try { return JSON.parse(dec(room?.wolf?.wolvesEnc || "")) || []; } catch { return []; } };
export const wolfLeft = (room, now = Date.now()) =>
  (room?.wolfEndAt ? Math.max(0, Math.round((room.wolfEndAt - now) / 1000)) : (room?.wolfDuration || 180));

// 開票。最多票が単独でウルフなら逆転チャンスへ、それ以外はウルフの逃げ切り
export function tallyWolf(room) {
  const { top } = topVote(room?.votes);
  if (top && wolvesOf(room).includes(top)) return { caughtId: top };
  return { outcome: "wolf" };
}

// outcome: citizens（市民勝ち）/ wolf（逃げ切り）/ reverse（逆転）
export function scoreWolf(data, outcome) {
  const delta = {}; const winners = [];
  const add = (name, v) => { delta[name] = (delta[name] || 0) + v; };
  const ws = wolvesOf(data);
  (data.players || []).forEach((p) => {
    const isW = ws.includes(p.id);
    if (outcome === "citizens" && !isW) { add(p.name, 1); winners.push(p.name); }
    if (outcome === "wolf" && isW) { add(p.name, 2); winners.push(p.name); }
    if (outcome === "reverse" && isW) { add(p.name, 3); winners.push(p.name); }
  });
  return { delta, winners, outcome };
}

// ── ワードジャマー ───────────────────────────────────
// 役は round でじゅんぐり：ダスモン = players[(round-1)%n]、ジャマー = その次、残りがワカルン
export function jammerRoles(room) {
  const players = room?.players || [];
  const n = players.length;
  if (!n) return { dasmon: null, jammer: null };
  const d = ((room.round || 1) - 1) % n;
  return { dasmon: players[d], jammer: players[(d + 1) % n] };
}

export function scoreJammer(data) {
  const j = data.jam || {};
  const players = data.players || [];
  const nameOf = (id) => players.find((p) => p.id === id)?.name;
  const delta = {}; const winners = [];
  const add = (name, v) => { if (!name) return; delta[name] = (delta[name] || 0) + v; };
  const wk = players.filter((p) => p.id !== j.dasmonId && p.id !== j.jammerId);
  let correct = 0;
  wk.forEach((p) => {
    const pick = j.picks?.[p.id];
    if (pick === undefined || pick === null) return; // 未回答は0
    if ((j.order || [])[pick] === 0) { correct += 1; add(p.name, j.pts || 1); winners.push(p.name); }
    else add(nameOf(j.jammerId), 1);
  });
  if (wk.length > 0 && correct * 2 >= wk.length) { add(nameOf(j.dasmonId), 1); winners.push(nameOf(j.dasmonId)); }
  if (correct < wk.length && nameOf(j.jammerId)) winners.push(nameOf(j.jammerId));
  return { delta, winners, outcome: `${correct}/${wk.length}`, correct, total: wk.length };
}
