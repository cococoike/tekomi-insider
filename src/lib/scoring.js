import { loadLeaderboard, saveLeaderboard } from "./db";

// 通算成績（leaderboard/）へ今ラウンドの増減を反映する。
// delta: { name: 増減pt }、winners: 勝ったプレイヤー名の配列
export async function applyLeaderboard(players, delta, winners = []) {
  let board = {};
  try { board = await loadLeaderboard(); } catch { board = {}; }
  players.forEach((p) => {
    const e = board[p.name] || { pts: 0, games: 0, wins: 0 };
    e.games += 1;
    e.pts += delta[p.name] || 0;
    if (winners.includes(p.name)) e.wins += 1;
    board[p.name] = e;
  });
  try { await saveLeaderboard(board); } catch { /* 電波不良時は諦める */ }
  return board;
}

// scores（部屋内の累計）に delta を足した新しい scores を返す
export function addScores(scores, delta) {
  const out = { ...(scores || {}) };
  Object.entries(delta).forEach(([n, v]) => { out[n] = (out[n] || 0) + v; });
  return out;
}
