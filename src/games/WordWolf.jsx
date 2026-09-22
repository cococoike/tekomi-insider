// ワードウルフ：全員にお題が配られるが、1人（7人以上なら2人）だけ違うお題＝ウルフ。
// 話し合いでウルフを見つけて投票。ウルフが吊られても、多数派のお題を言い当てれば逆転勝ち。
import { useState, useEffect } from "react";
import { setRoomField } from "../lib/db";
import { pickWolfPair } from "../lib/words";
import { applyLeaderboard, addScores } from "../lib/scoring";
import { ROOM, enc, dec, fmt, computeFlair, topVote, shuffle, OwlDoc, Bubble, Shell, Header, ErrBox, ScoreRows, ModeCard } from "../ui";

const WOLF_COLOR = "#5b8def";
const WOLF_TIMES = [{ s: 180, label: "3分" }, { s: 240, label: "4分" }, { s: 300, label: "5分" }];
const wolfCount = (n) => (n >= 7 ? 2 : 1);

// ── ラウンド開始／リセット（App から呼ばれる純関数）──
export function startWolfRound(room) {
  const players = room.players || [];
  const adult = !!room.adult;
  const [maj, min] = pickWolfPair(room.usedPairs || [], adult);
  const wolves = shuffle(players).slice(0, wolfCount(players.length)).map((p) => p.id);
  return {
    ...room,
    phase: "playing", votes: {}, scored: false, outcome: null,
    startTime: Date.now(), timeLeft: room.wolfDuration || 180,
    wolfEndAt: Date.now() + (room.wolfDuration || 180) * 1000, // 話し合いの終了時刻（各端末がこれを見て計算）
    usedPairs: [...(room.usedPairs || []), [maj, min].sort().join("|")],
    wolf: { majEnc: enc(maj), minEnc: enc(min), wolvesEnc: enc(JSON.stringify(wolves)), caughtId: null, guess: null },
  };
}
export function resetWolfRound(room) { return { ...room, wolf: null, wolfEndAt: null }; }

const wolvesOf = (room) => { try { return JSON.parse(dec(room?.wolf?.wolvesEnc || "")) || []; } catch { return []; } };

// ── ロビー内の設定パネル ──
export function WolfSettings({ room, isHost, save, onStart, err }) {
  const n = (room?.players || []).length;
  const dur = room?.wolfDuration || 180;
  return (
    <>
      {isHost && (
        <div className="mp-panel">
          <div className="mp-panel-head">★ ワードウルフ設定（部屋主） ★</div>
          <ModeCard on={!!room.adult} color="#a020e0" emoji="🌶️" label="アダルト🔞" desc="お題ペアがきわどく…完全身内専用" toggle
            onClick={() => save({ ...room, adult: !room.adult })} />
          <div style={{ fontSize: 10, color: "#888", margin: "12px 0 6px", letterSpacing: 1 }}>話し合いの時間</div>
          <div style={{ display: "flex", gap: 6 }}>
            {WOLF_TIMES.map((t) => (
              <button key={t.s} onClick={() => save({ ...room, wolfDuration: t.s })} style={{
                flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                border: "2.5px solid #000", boxShadow: dur === t.s ? `0 3px 0 ${WOLF_COLOR}` : "0 3px 0 #000",
                background: dur === t.s ? WOLF_COLOR : "#fff", color: dur === t.s ? "#fff" : "#111" }}>{t.label}</button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "#666", textAlign: "center", marginTop: 10 }}>ウルフの人数：{wolfCount(n)}人（7人以上で2人）</div>
        </div>
      )}
      {isHost ? (
        <>
          <button className="mp-btn mp-red" onClick={onStart} disabled={n < 3}>{n < 3 ? `あと${3 - n}名` : "▶ ワードウルフ スタート！"}</button>
          <ErrBox>{err}</ErrBox>
        </>
      ) : (
        <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 12, padding: 18 }}>
          部屋主がスタートするのを待つてこ<br />
          <span style={{ fontSize: 11, color: WOLF_COLOR }}>話し合い {fmt(dur)}／ウルフ {wolfCount(n)}人{room?.adult ? "／アダルト🔞" : ""}</span>
        </div>
      )}
      <div className="mp-panel">
        <div className="mp-panel-head" style={{ background: WOLF_COLOR, color: "#fff" }}>★ ワードウルフのルール ★</div>
        <div style={{ fontSize: 11, lineHeight: 1.85, color: "#1a1a1a" }}>
          <div>1. 全員にお題が配られる。でも <b>1人だけ違うお題</b>（＝ウルフ）。自分がウルフかは分からない</div>
          <div>2. お題について話し合う。「自分は多数派？」「誰が話が合わない？」を探る</div>
          <div>3. 時間が来たら一斉投票。最多票の人がウルフなら <b style={{ color: WOLF_COLOR }}>市民の勝ち（市民 +1）</b></div>
          <div>4. ウルフが逃げ切れば <b style={{ color: "#E53935" }}>ウルフの勝ち（ウルフ +2）</b></div>
          <div>5. 吊られたウルフが多数派のお題を言い当てたら <b style={{ color: "#E53935" }}>大逆転（ウルフ +3）</b></div>
        </div>
      </div>
    </>
  );
}

// ── ゲーム本体（phase: playing → vote → wolfguess → result）──
export function WolfGame({ room, myId, myName, isHost, save, lb, onNextRound, onLeave, openLb }) {
  const [revealed, setRevealed] = useState(false);
  const [guess, setGuess] = useState("");
  const phase = room?.phase;
  const players = room?.players || [];
  const wolves = wolvesOf(room);
  const amWolf = wolves.includes(myId);
  const maj = dec(room?.wolf?.majEnc || "");
  const min = dec(room?.wolf?.minEnc || "");
  const myWord = amWolf ? min : maj;
  // 残り時間は終了時刻（wolfEndAt）から各端末が自分で計算する。
  // 部屋主の端末がスリープしても、全員の時計は止まらない。
  const endAt = room?.wolfEndAt;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [phase]);
  const timeLeft = endAt ? Math.max(0, Math.round((endAt - now) / 1000)) : (room?.wolfDuration || 180);

  // 採点して結果へ
  const finalize = async (data, outcome) => {
    if (data.scored) return;
    const delta = {}; const winners = [];
    const add = (name, v) => { delta[name] = (delta[name] || 0) + v; };
    const ws = wolvesOf(data);
    data.players.forEach((p) => {
      const isW = ws.includes(p.id);
      if (outcome === "citizens" && !isW) { add(p.name, 1); winners.push(p.name); }
      if (outcome === "wolf" && isW) { add(p.name, 2); winners.push(p.name); }
      if (outcome === "reverse" && isW) { add(p.name, 3); winners.push(p.name); }
    });
    await applyLeaderboard(data.players, delta, winners);
    await save({ ...data, phase: "result", scores: addScores(data.scores, delta), scored: true, outcome });
  };

  const toVote = async () => { await save({ ...room, phase: "vote", votes: {} }); };
  const extend = async () => { await setRoomField(ROOM, "wolfEndAt", (room?.wolfEndAt || Date.now()) + 60000); };

  // 投票が揃ったら（最後に投票した人の端末が）開票
  const tally = async (data) => {
    const { top } = topVote(data.votes);
    if (top && wolvesOf(data).includes(top)) {
      await save({ ...data, phase: "wolfguess", wolf: { ...data.wolf, caughtId: top, guess: null } });
    } else {
      await finalize(data, "wolf");
    }
  };
  const doVote = async (targetId) => {
    if (!room || room.votes?.[myId]) return;
    const u = { ...room, votes: { ...(room.votes || {}), [myId]: targetId } };
    if (Object.keys(u.votes).length >= players.length) await tally(u); else await save(u);
  };
  const forceTally = async () => { if (Object.keys(room.votes || {}).length === 0) return; await tally(room); };

  const submitGuess = async () => {
    if (!guess.trim()) return;
    await save({ ...room, wolf: { ...room.wolf, guess: guess.trim() } });
  };
  const judge = async (ok) => { await finalize(room, ok ? "reverse" : "citizens"); };

  const flair = computeFlair(players, lb);
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";

  // ════ 話し合い ════
  if (phase === "playing") return (
    <Shell>
      <Header sub={`ROUND ${room?.round || 1}`} title="てこみの ワードウルフ" />
      {!revealed ? (
        <div style={{ textAlign: "center", paddingTop: 40 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><OwlDoc size={88} bob expr="surprised" /></div>
          <div className="mp-title" style={{ fontSize: 22 }}>{myName} へ</div>
          <div style={{ fontSize: 12, margin: "14px 0 28px", textShadow: "1px 1px 0 #000", lineHeight: 1.8 }}>
            お題をくばるてこ。<br />ほかの人に見られないようにてこ！
          </div>
          <button className="mp-btn mp-red" style={{ maxWidth: 260, margin: "0 auto" }} onClick={() => setRevealed(true)}>▶ お題を見る</button>
        </div>
      ) : (
        <>
          <div className="mp-panel" style={{ padding: "8px 12px", marginBottom: 12 }}>
            <div className="mp-row">
              <span style={{ fontSize: 11, color: WOLF_COLOR, WebkitTextStroke: "0.3px #000" }}>話し合い中</span>
              <span style={{ fontSize: 30, color: timeLeft < 30 ? "#E53935" : "#111", WebkitTextStroke: "1px #000" }}>{fmt(timeLeft)}</span>
              <span style={{ fontSize: 10, color: "#888" }}>ウルフ{wolves.length}人</span>
            </div>
          </div>
          <div className="mp-panel" style={{ padding: 22, textAlign: "center" }}>
            <div className="mp-panel-head" style={{ background: WOLF_COLOR, color: "#fff" }}>あなたのお題</div>
            <div style={{ fontSize: 30, color: "#111", WebkitTextStroke: "0.5px #000" }}>「{myWord}」</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 6 }}>※自分がウルフかは分からない。みんなと同じ気持ちで語るてこ</div>
          </div>
          {isHost ? (
            <>
              <button className="mp-btn mp-green" onClick={toVote}>🗳 話し合い終了 → 投票へ</button>
              <button className="mp-btn mp-yellow" onClick={extend}>⏱ 1分 延長する</button>
            </>
          ) : timeLeft === 0 ? (
            <div style={{ textAlign: "center", color: "#fff", background: "#E53935", border: "2px solid #000", borderRadius: 8, fontSize: 12, padding: 8, marginBottom: 8 }}>時間切れ。部屋主の操作を待つてこ</div>
          ) : null}
          <Bubble expr="thinking">お題を直接言わずに、それっぽい話をするてこ。話が微妙にズレてる人…それがウルフてこ🐺</Bubble>
        </>
      )}
    </Shell>
  );

  // ════ 投票 ════
  if (phase === "vote") {
    const votable = players.filter((p) => p.id !== myId);
    const cnt = Object.keys(room?.votes || {}).length;
    const myVote = room?.votes?.[myId];
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "30px 0 22px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><OwlDoc size={70} bob expr="suspicious" /></div>
          <div className="mp-title" style={{ fontSize: 22 }}>ウルフは誰だ？</div>
          <div style={{ fontSize: 11, marginTop: 8, letterSpacing: 2, textShadow: "1px 1px 0 #000" }}>{cnt} / {players.length} 票</div>
        </div>
        {myVote ? (
          <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>✓ 投票完了。開票を待つてこ</div>
        ) : (
          <div className="mp-panel">
            <div className="mp-panel-head" style={{ background: WOLF_COLOR, color: "#fff" }}>★ 一斉投票 ★</div>
            {votable.map((p) => <button key={p.id} className="mp-btn mp-blue" onClick={() => doVote(p.id)}>{p.name}</button>)}
          </div>
        )}
        {isHost && <button className="mp-btn mp-red" onClick={forceTally}>⏩ 強制的に開票する（揃わない時用）</button>}
      </Shell>
    );
  }

  // ════ 逆転チャンス（吊られたウルフが多数派のお題を当てる）════
  if (phase === "wolfguess") {
    const caught = room?.wolf?.caughtId;
    const g = room?.wolf?.guess;
    const amCaught = caught === myId;
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "24px 0 16px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><OwlDoc size={70} bob expr="surprised" /></div>
          <div className="mp-title" style={{ fontSize: 22 }}>{nameOf(caught)} がウルフだった！</div>
          <div style={{ fontSize: 12, marginTop: 8, textShadow: "1px 1px 0 #000" }}>でも…最後の逆転チャンス！<br />ウルフが多数派のお題を言い当てたら大逆転！</div>
        </div>
        {amCaught ? (
          g ? (
            <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>「{g}」で回答済み。判定を待つてこ…</div>
          ) : (
            <div className="mp-panel">
              <div className="mp-panel-head" style={{ background: "#E53935" }}>みんなのお題は…？</div>
              <input className="mp-input" placeholder="多数派のお題を入力" value={guess} onChange={(e) => setGuess(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submitGuess()} />
              <button className="mp-btn mp-red" onClick={submitGuess} disabled={!guess.trim()}>🐺 これだ！</button>
            </div>
          )
        ) : (
          <div className="mp-panel" style={{ textAlign: "center" }}>
            <div className="mp-panel-head" style={{ background: WOLF_COLOR, color: "#fff" }}>ウルフの回答</div>
            {g ? (
              <>
                <div style={{ fontSize: 24, color: "#E53935", WebkitTextStroke: "0.5px #000", margin: "6px 0" }}>「{g}」</div>
                <div style={{ fontSize: 11, color: "#666", marginBottom: 10 }}>多数派のお題は「{maj}」。合ってる？（市民のだれかが判定）</div>
                {!amWolf && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="mp-btn mp-red" style={{ flex: 1, marginBottom: 0 }} onClick={() => judge(true)}>正解…逆転！</button>
                    <button className="mp-btn mp-green" style={{ flex: 1, marginBottom: 0 }} onClick={() => judge(false)}>不正解！</button>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#666", fontSize: 13, padding: 16 }}>🐺 {nameOf(caught)} が考え中…</div>
            )}
          </div>
        )}
        {isHost && !g && <button className="mp-btn mp-red" onClick={() => judge(false)} style={{ fontSize: 12 }}>⏩ 回答なしで市民の勝ちにする</button>}
      </Shell>
    );
  }

  // ════ 結果 ════
  if (phase === "result") {
    const oc = room?.outcome;
    const title = { citizens: "市民の勝利！", wolf: "ウルフの勝利！", reverse: "ウルフの大逆転！" }[oc] || "結果";
    const { vc } = topVote(room?.votes);
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1} 結果`} title="てこみの ワードウルフ" onBack={() => { if (window.confirm("ホームに戻る？（通算成績は消えないよ）")) onLeave(); }} />
        <div style={{ textAlign: "center", padding: "10px 0 18px" }}>
          <div className="mp-title" style={{ fontSize: 24, color: oc === "citizens" ? "#D4AF37" : "#E53935" }}>{title}</div>
          <div style={{ fontSize: 12, marginTop: 8, textShadow: "1px 1px 0 #000", lineHeight: 1.9 }}>
            多数派　<span style={{ fontSize: 18, color: "#FFD700", WebkitTextStroke: "0.4px #000" }}>「{maj}」</span><br />
            ウルフ　<span style={{ fontSize: 18, color: "#E53935", WebkitTextStroke: "0.4px #000" }}>「{min}」</span>
          </div>
        </div>
        <div className="mp-panel" style={{ textAlign: "center", border: "5px solid #E53935" }}>
          <div className="mp-panel-head">ウルフの正体は…</div>
          <div className="mp-row" style={{ justifyContent: "center", gap: 10 }}>
            <OwlDoc size={40} />
            <span style={{ fontSize: 24, color: "#E53935", WebkitTextStroke: "0.5px #000" }}>{wolves.map(nameOf).join("・")}</span>
          </div>
          {room?.wolf?.guess && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>逆転回答 → 「{room.wolf.guess}」</div>}
        </div>
        <ScoreRows players={players} scores={room?.scores} myId={myId} flair={flair}
          colorOf={(p) => wolves.includes(p.id) ? "#E53935" : "#111"}
          extra={(p) => vc[p.id] ? <span style={{ fontSize: 10, color: "#888" }}>　{vc[p.id]}票</span> : null} />
        {Object.keys(room?.votes || {}).length > 0 && (
          <div className="mp-panel">
            <div className="mp-panel-head" style={{ background: WOLF_COLOR, color: "#fff" }}>★ だれが だれに ★</div>
            {players.filter((p) => room.votes[p.id]).map((p) => (
              <div key={p.id} style={{ fontSize: 12, padding: "5px 2px", color: "#111" }}>
                {p.name} <span style={{ color: "#E53935" }}>→</span> {nameOf(room.votes[p.id])}
              </div>
            ))}
          </div>
        )}
        {isHost ? (
          <button className="mp-btn mp-green" onClick={onNextRound}>▶ 同じメンバーで次のラウンド（ロビーへ）</button>
        ) : (
          <div style={{ textAlign: "center", color: "#fff", fontSize: 12, marginBottom: 10, textShadow: "1px 1px 0 #000" }}>🏠 部屋主が次のラウンドを始められるてこ</div>
        )}
        <button className="mp-btn mp-blue" onClick={openLb}>★ つうさんせいせき</button>
        <button className="mp-btn mp-yellow" onClick={onLeave}>🚪 解散する</button>
      </Shell>
    );
  }

  return <Shell><div style={{ textAlign: "center", paddingTop: 48 }}>…</div></Shell>;
}
