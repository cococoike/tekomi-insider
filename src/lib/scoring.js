// 採点の保存（全ゲーム共通）。どのゲームも「採点は1回だけ」をトランザクションで保証する。
import { transactRoom, transactLeaderboard } from "./db";
import { addToBoard, ROOM } from "./util.js";
import { claimResult } from "./rules.js";

// 部屋を結果画面へ進めて、得点を記録する。
//   compute(いまの部屋) → { delta, winners, outcome, patch } を返す。採点しないなら null
//   すでに他の端末が採点していたら何もしない（通算成績が二重に足されない）
// 戻り値: 書き込めたときは最新の部屋、他の端末が先に済ませていたら null
export async function finalizeRound(compute, code = ROOM) {
  let claimed = null;
  const res = await transactRoom(code, (cur) => {
    claimed = claimResult(cur, compute);
    return claimed ? claimed.next : undefined;
  });
  if (!res.committed || !claimed) return null;
  const { delta, winners } = claimed.r;
  // 通算成績も「読んで足して書く」を不可分にする
  try {
    await transactLeaderboard((board) => addToBoard(board, res.value.players, delta, winners));
  } catch { /* 電波不良時は通算成績だけ諦める（部屋の得点は保存済み） */ }
  return res.value;
}
