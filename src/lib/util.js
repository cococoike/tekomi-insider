// 画面を持たない小道具（テストから直接読み込めるように JSX を含めない）
export const genId = () => Math.random().toString(36).slice(2, 11);
export const ROOM = "main"; // 身内専用：全員ひとつの部屋に集まる
export const NONE_ID = "__none__"; // 平和村の「インサイダーはいない」票

// お題や役職を Firebase に平文で置かないための軽い難読化（DevTools で丸見えにならない程度）
export const enc = (t) => { try { return btoa(unescape(encodeURIComponent(t))); } catch { return btoa(t); } };
export const dec = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };

export const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;

// 偏りのないシャッフル（sort(() => random - 0.5) は並びが偏る）
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 名前は Firebase のキー（得点表・通算成績）にも使うので、キーに使えない記号 . # $ [ ] / を全角にする。
// そのままだと採点の保存が失敗して、ラウンドが結果画面へ進めなくなる。
export function sanitizeName(s) {
  const map = { ".": "．", "#": "＃", "$": "＄", "[": "［", "]": "］", "/": "／" };
  const visible = Array.from(String(s || "")).filter((ch) => { const c = ch.charCodeAt(0); return c >= 32 && c !== 127; }).join("");
  return visible
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.#$[\]/]/g, (c) => map[c])
    .slice(0, 10);
}

// 累計ポイント順位フレア（1位 crown / ビリ poop・同点は全員に付与）。全員同点なら付けない。
export function computeFlair(players, board) {
  const flair = {};
  if (!players || players.length < 2) return flair;
  const pts = players.map((p) => ({ name: p.name, pt: (board?.[p.name]?.pts) || 0 }));
  const max = Math.max(...pts.map((x) => x.pt));
  const min = Math.min(...pts.map((x) => x.pt));
  if (max > min) {
    pts.forEach((x) => { if (x.pt === max) flair[x.name] = "crown"; else if (x.pt === min) flair[x.name] = "poop"; });
  }
  return flair;
}

// 採点する端末を1台に決める（全端末が同じ答えを出す）。部屋主が居なければ先頭のプレイヤー。
export const scorerOf = (d) => ((d?.players || []).some((p) => p.id === d.hostId) ? d.hostId : (d?.players || [])[0]?.id);
export const TAKEOVER_MS = 4000; // 採点役が寝ている時に他の端末が肩代わりするまでの待ち時間

// 票の集計 → 最多得票（単独のとき）を返す。同数なら null
export function topVote(votes) {
  const vc = {};
  Object.values(votes || {}).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
  const maxV = Math.max(0, ...Object.values(vc));
  const top = Object.entries(vc).filter(([, v]) => v === maxV).map(([k]) => k);
  return { vc, top: top.length === 1 ? top[0] : null, tied: top };
}

// scores（部屋内の累計）に delta を足した新しい scores を返す
export function addScores(scores, delta) {
  const out = { ...(scores || {}) };
  Object.entries(delta || {}).forEach(([n, v]) => { out[n] = (out[n] || 0) + v; });
  return out;
}

// 通算成績（leaderboard）へ今ラウンドの増減を足した新しい表を返す（書き込みは db 側）
export function addToBoard(board, players, delta, winners = []) {
  const out = { ...(board || {}) };
  (players || []).forEach((p) => {
    const e = { pts: 0, games: 0, wins: 0, ...(out[p.name] || {}) };
    e.games += 1;
    e.pts += (delta || {})[p.name] || 0;
    if (winners.includes(p.name)) e.wins += 1;
    out[p.name] = e;
  });
  return out;
}
