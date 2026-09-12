// ワードジャマー：出題者「ダスモン」が質問に本当の答えを書く。妨害者「ジャマー」がそれを見て嘘を2つ混ぜる。
// 解答者「ワカルン」たちは3つの答えと会話・表情から本物を見抜く。役は毎ラウンド時計回りに交代。
import { useState } from "react";
import { pickJammerQuestion } from "../lib/words";
import { applyLeaderboard, addScores } from "../lib/scoring";
import { computeFlair, shuffle, OwlDoc, Bubble, Shell, Header, ErrBox, ScoreRows, ModeCard } from "../ui";

const JAM_COLOR = "#3cb371";
// 答えの文字列は Firebase に平文で置かない（他人の端末から DevTools で覗けるため軽く難読化）
const enc = (t) => { try { return btoa(unescape(encodeURIComponent(t))); } catch { return btoa(t); } };
const dec = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };

// ── ラウンド開始／リセット（App から呼ばれる純関数）──
export function startJammerRound(room) {
  const players = room.players || [];
  const n = players.length;
  const dIdx = ((room.round || 1) - 1) % n;
  const dasmon = players[dIdx];
  const jammer = players[(dIdx + 1) % n];
  const card = pickJammerQuestion(room.usedQuestions || [], !!room.adult);
  return {
    ...room,
    phase: "playing", votes: {}, scored: false, outcome: null,
    usedQuestions: [...(room.usedQuestions || []), card.q],
    jam: { dasmonId: dasmon.id, jammerId: jammer.id, q: card.q, pts: card.pts, step: "answer",
      answerEnc: null, fakesEnc: null, order: null, picks: {} },
  };
}
export function resetJammerRound(room) { return { ...room, jam: null }; }

// ── ロビー内の設定パネル ──
export function JammerSettings({ room, isHost, save, onStart, err }) {
  const players = room?.players || [];
  const n = players.length;
  const dIdx = n ? ((room.round || 1) - 1) % n : 0;
  const dasmon = players[dIdx]?.name || "?";
  const jammer = players[(dIdx + 1) % (n || 1)]?.name || "?";
  return (
    <>
      <div className="mp-panel" style={{ textAlign: "center", padding: 10 }}>
        <span style={{ fontSize: 10, color: "#888" }}>今回の役（毎ラウンド じゅんぐり）</span>
        <div style={{ fontSize: 14, color: "#111", lineHeight: 1.8 }}>
          🎙 ダスモン（出題者）：<b style={{ color: JAM_COLOR }}>{dasmon}</b><br />
          😈 ジャマー（妨害者）：<b style={{ color: "#E53935" }}>{jammer}</b><br />
          🔍 ワカルン（解答者）：そのほか全員
        </div>
      </div>
      {isHost && (
        <div className="mp-panel">
          <div className="mp-panel-head">★ ワードジャマー設定（部屋主） ★</div>
          <ModeCard on={!!room.adult} color="#a020e0" emoji="🌶️" label="アダルト🔞" desc="きわどい質問カードも混ざる…完全身内専用" toggle
            onClick={() => save({ ...room, adult: !room.adult })} />
        </div>
      )}
      {isHost ? (
        <>
          <button className="mp-btn mp-red" onClick={onStart} disabled={n < 3}>{n < 3 ? `あと${3 - n}名` : "▶ ワードジャマー スタート！"}</button>
          <ErrBox>{err}</ErrBox>
        </>
      ) : (
        <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 12, padding: 18 }}>部屋主がスタートするのを待つてこ</div>
      )}
      <div className="mp-panel">
        <div className="mp-panel-head" style={{ background: JAM_COLOR, color: "#fff" }}>★ ワードジャマーのルール ★</div>
        <div style={{ fontSize: 11, lineHeight: 1.85, color: "#1a1a1a" }}>
          <div>1. <b>ダスモン</b>に質問カード（例：子どもの頃なりたかった職業は？）。ダスモンは<b>本当の答え</b>をこっそり入力</div>
          <div>2. <b>ジャマー</b>だけが本当の答えを見て、それっぽい<b>嘘の答えを2つ</b>入力</div>
          <div>3. 3つの答えがシャッフルされて全員に表示。<b>ワカルン</b>はダスモンと話しながら、どれが本物か選ぶ（ダスモンは嘘をついてもOK・ジャマーも口出しOK）</div>
          <div>4. 得点：正解したワカルン <b style={{ color: JAM_COLOR }}>+難易度pt（1〜3）</b>／外したワカルン1人につき ジャマー <b style={{ color: "#E53935" }}>+1</b>／ワカルンの半分以上が正解ならダスモン <b>+1</b></div>
        </div>
      </div>
    </>
  );
}

// ── ゲーム本体（phase: playing[step: answer → fake → pick] → result）──
export function JammerGame({ room, myId, isHost, save, lb, onNextRound, onLeave, openLb }) {
  const [ans, setAns] = useState("");
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");
  const jam = room?.jam || {};
  const players = room?.players || [];
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const amDasmon = jam.dasmonId === myId;
  const amJammer = jam.jammerId === myId;
  const wakarun = players.filter((p) => p.id !== jam.dasmonId && p.id !== jam.jammerId);
  const amWakarun = wakarun.some((p) => p.id === myId);
  const truth = dec(jam.answerEnc || "");
  const fakes = (jam.fakesEnc || []).map(dec);
  // order: 表示順（0=本物, 1・2=嘘）を保存しておく
  const options = (jam.order || []).map((k) => (k === 0 ? truth : fakes[k - 1]));

  const submitAnswer = async () => {
    if (!ans.trim()) return;
    await save({ ...room, jam: { ...jam, answerEnc: enc(ans.trim()), step: "fake" } });
  };
  const submitFakes = async () => {
    if (!f1.trim() || !f2.trim()) return;
    await save({ ...room, jam: { ...jam, fakesEnc: [enc(f1.trim()), enc(f2.trim())], order: shuffle([0, 1, 2]), step: "pick" } });
  };

  const finalize = async (data) => {
    if (data.scored) return;
    const j = data.jam;
    const delta = {}; const winners = [];
    const add = (name, v) => { delta[name] = (delta[name] || 0) + v; };
    const wk = data.players.filter((p) => p.id !== j.dasmonId && p.id !== j.jammerId);
    let correct = 0;
    wk.forEach((p) => {
      const pick = j.picks?.[p.id];
      if (pick === undefined) return; // 未回答は0
      if (j.order[pick] === 0) { correct += 1; add(p.name, j.pts); winners.push(p.name); }
      else add(nameOf(j.jammerId), 1);
    });
    if (wk.length > 0 && correct * 2 >= wk.length) { add(nameOf(j.dasmonId), 1); winners.push(nameOf(j.dasmonId)); }
    if (correct < wk.length) winners.push(nameOf(j.jammerId));
    await applyLeaderboard(data.players, delta, winners);
    await save({ ...data, phase: "result", scores: addScores(data.scores, delta), scored: true, outcome: `${correct}/${wk.length}` });
  };

  const doPick = async (idx) => {
    if (!amWakarun || jam.picks?.[myId] !== undefined) return;
    const u = { ...room, jam: { ...jam, picks: { ...(jam.picks || {}), [myId]: idx } } };
    if (Object.keys(u.jam.picks).length >= wakarun.length) await finalize(u); else await save(u);
  };

  const flair = computeFlair(players, lb);
  const roleBar = (label) => (
    <div className="mp-panel" style={{ padding: "8px 12px", marginBottom: 12 }}>
      <div className="mp-row">
        <span style={{ fontSize: 11, color: JAM_COLOR, WebkitTextStroke: "0.3px #000" }}>{amDasmon ? "🎙 ダスモン" : amJammer ? "😈 ジャマー" : "🔍 ワカルン"}</span>
        <span style={{ fontSize: 11, color: "#888" }}>{label}</span>
        <span style={{ fontSize: 11, color: "#111" }}>難易度 {"★".repeat(jam.pts || 1)}</span>
      </div>
    </div>
  );
  const qCard = (
    <div className="mp-panel" style={{ textAlign: "center", padding: 16, borderColor: JAM_COLOR }}>
      <div className="mp-panel-head" style={{ background: JAM_COLOR, color: "#fff" }}>🎙 {nameOf(jam.dasmonId)} への質問</div>
      <div style={{ fontSize: 18, color: "#111", lineHeight: 1.5 }}>{jam.q}</div>
    </div>
  );

  if (room?.phase === "playing") {
    // ── step 1: ダスモンが本当の答えを入力 ──
    if (jam.step === "answer") return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1}`} title="てこみの ワードジャマー" />
        {roleBar("ダスモンが回答中")}
        {qCard}
        {amDasmon ? (
          <div className="mp-panel">
            <div className="mp-panel-head">★ 本当の答えを入力（ジャマーだけが見る） ★</div>
            <input className="mp-input" placeholder="本当の答え（短く）" value={ans} onChange={(e) => setAns(e.target.value)} maxLength={20}
              onKeyDown={(e) => e.key === "Enter" && submitAnswer()} />
            <button className="mp-btn mp-green" onClick={submitAnswer} disabled={!ans.trim()}>✓ これで決定</button>
          </div>
        ) : (
          <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>🎙 {nameOf(jam.dasmonId)} が本当の答えを書いてるてこ…</div>
        )}
        <Bubble expr="thinking">{amDasmon ? "正直に書くてこ。あとで会話で嘘をついてもいいけど、答えは本物てこ！" : amJammer ? "次はキミの出番てこ。ダスモンの答えに寄せた嘘を2つ考えておくてこ😈" : "ダスモンの顔をよく見ておくてこ。答えが出たら会話で探るてこ🔍"}</Bubble>
      </Shell>
    );

    // ── step 2: ジャマーが嘘を2つ入力 ──
    if (jam.step === "fake") return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1}`} title="てこみの ワードジャマー" />
        {roleBar("ジャマーが妨害中")}
        {qCard}
        {amJammer ? (
          <div className="mp-panel">
            <div className="mp-panel-head" style={{ background: "#E53935" }}>★ 本当の答えは… ★</div>
            <div style={{ textAlign: "center", fontSize: 22, color: "#E53935", WebkitTextStroke: "0.4px #000", marginBottom: 12 }}>「{truth}」</div>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>それっぽい嘘の答えを2つ（表記のクセや長さも真似るてこ）</div>
            <input className="mp-input" placeholder="嘘の答え①" value={f1} onChange={(e) => setF1(e.target.value)} maxLength={20} />
            <input className="mp-input" placeholder="嘘の答え②" value={f2} onChange={(e) => setF2(e.target.value)} maxLength={20} />
            <button className="mp-btn mp-red" onClick={submitFakes} disabled={!f1.trim() || !f2.trim()}>😈 混ぜ込む！</button>
          </div>
        ) : (
          <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>😈 {nameOf(jam.jammerId)} が嘘を仕込んでるてこ…</div>
        )}
        {isHost && !amJammer && (
          <button className="mp-btn mp-red" style={{ fontSize: 12 }} onClick={() => save(startJammerRound({ ...room, round: room.round }))}>⏩ ジャマーが反応しない → 質問を引き直す</button>
        )}
      </Shell>
    );

    // ── step 3: ワカルンが選ぶ ──
    const myPick = jam.picks?.[myId];
    const cnt = Object.keys(jam.picks || {}).length;
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1}`} title="てこみの ワードジャマー" />
        {roleBar(`回答 ${cnt} / ${wakarun.length}`)}
        {qCard}
        <div className="mp-panel">
          <div className="mp-panel-head">★ 本物はどれ？ ★</div>
          {options.map((o, i) => {
            const mine = myPick === i;
            const isTruth = (amDasmon || amJammer) && jam.order[i] === 0;
            return (
              <button key={i} className={`mp-btn ${mine ? "mp-green" : "mp-blue"}`} onClick={() => doPick(i)}
                disabled={!amWakarun || myPick !== undefined} style={{ fontSize: 16, opacity: (!amWakarun || (myPick !== undefined && !mine)) ? 0.8 : 1 }}>
                {["Ⓐ", "Ⓑ", "Ⓒ"][i]} {o}{isTruth ? "　★本物" : ""}{mine ? "　✓" : ""}
              </button>
            );
          })}
          {amWakarun && myPick === undefined && <div style={{ fontSize: 10, color: "#888", textAlign: "center" }}>ダスモンに話しかけて、表情や言い回しから見抜くてこ</div>}
          {amWakarun && myPick !== undefined && <div style={{ fontSize: 12, color: "#666", textAlign: "center" }}>✓ 回答完了。みんなの回答を待つてこ</div>}
          {(amDasmon || amJammer) && <div style={{ fontSize: 11, color: "#666", textAlign: "center" }}>{amDasmon ? "ワカルンの質問に答えるてこ。嘘をついてもOK（でもバレたら…）" : "ワカルンを惑わす口出しOKてこ😈"}</div>}
        </div>
        {isHost && <button className="mp-btn mp-red" style={{ fontSize: 12 }} onClick={() => finalize(room)}>⏩ 今ある回答で締め切る</button>}
        {(amDasmon || amJammer) && (
          <div className="mp-panel" style={{ padding: 10 }}>
            <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>回答状況</div>
            {wakarun.map((p) => <div key={p.id} style={{ fontSize: 12, color: "#111" }}>{jam.picks?.[p.id] !== undefined ? "✓" : "…"} {p.name}</div>)}
          </div>
        )}
      </Shell>
    );
  }

  // ════ 結果 ════
  if (room?.phase === "result") {
    const truthIdx = (jam.order || []).indexOf(0);
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1} 結果`} title="てこみの ワードジャマー" onBack={() => { if (window.confirm("ホームに戻る？（通算成績は消えないよ）")) onLeave(); }} />
        <div style={{ textAlign: "center", padding: "10px 0 12px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><OwlDoc size={64} bob expr="happy" /></div>
          <div className="mp-title" style={{ fontSize: 22 }}>正解は {["Ⓐ", "Ⓑ", "Ⓒ"][truthIdx]}「{truth}」</div>
          <div style={{ fontSize: 12, marginTop: 8, textShadow: "1px 1px 0 #000" }}>{jam.q}<br />見抜いたワカルン {room.outcome} 人</div>
        </div>
        <div className="mp-panel">
          <div className="mp-panel-head" style={{ background: JAM_COLOR, color: "#fff" }}>★ 3つの答えと みんなの回答 ★</div>
          {options.map((o, i) => {
            const pickers = wakarun.filter((p) => jam.picks?.[p.id] === i).map((p) => p.name);
            const real = jam.order[i] === 0;
            return (
              <div key={i} style={{ padding: "7px 0", borderBottom: "2px dashed #ddd" }}>
                <div style={{ fontSize: 15, color: real ? JAM_COLOR : "#E53935", fontWeight: real ? 700 : 400 }}>{["Ⓐ", "Ⓑ", "Ⓒ"][i]} {o} {real ? "★本物" : "（ジャマーの嘘）"}</div>
                <div style={{ fontSize: 11, color: "#666" }}>{pickers.length ? pickers.join("・") : "―"}</div>
              </div>
            );
          })}
        </div>
        <ScoreRows players={players} scores={room?.scores} myId={myId} flair={flair}
          colorOf={(p) => p.id === jam.dasmonId ? JAM_COLOR : p.id === jam.jammerId ? "#E53935" : "#111"}
          extra={(p) => <span style={{ fontSize: 10, color: "#888" }}>　{p.id === jam.dasmonId ? "🎙" : p.id === jam.jammerId ? "😈" : "🔍"}</span>} />
        {isHost ? (
          <button className="mp-btn mp-green" onClick={onNextRound}>▶ 次のラウンド（役を交代してロビーへ）</button>
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
