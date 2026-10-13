// ワードジャマー：出題者「ダスモン」が質問に本当の答えを書く。妨害者「ジャマー」がそれを見て嘘を2つ混ぜる。
// 解答者「ワカルン」たちは3つの答えと会話・表情から本物を見抜く。役は毎ラウンドじゅんぐりに交代。
import { useState, useEffect } from "react";
import { updateRoom, setRoomField, transactRoom } from "../lib/db";
import { finalizeRound } from "../lib/scoring";
import { startJammerRound } from "../lib/rounds";
import { ROOM, enc, dec, computeFlair, shuffle, scorerOf, TAKEOVER_MS } from "../lib/util";
import { jammerRoles, scoreJammer } from "../lib/rules";
import { useAction, buzz } from "../lib/hooks";
import { sfxVote } from "../lib/sound";
import { Icon } from "../icons";
import { OwlDoc, RoleChar, Bubble, Shell, Header, Panel, ErrBox, PlayerRows, OptRow, HostMenu, Fold } from "../ui";

const ABC = ["A", "B", "C"];
const Letter = ({ i, on }) => (
  <span style={{ flex: "0 0 auto", width: 32, height: 32, lineHeight: "28px", textAlign: "center", fontSize: 18, border: "2px solid #000", borderRadius: 8,
    background: on ? "#1a1a1a" : "#D4AF37", color: on ? "#D4AF37" : "#1a1200" }}>{ABC[i]}</span>
);

// ── ロビー：設定（部屋主の「ゲームと設定」の中身）──
export function JammerOptions({ room }) {
  return (
    <>
      <div className="label">オプション</div>
      <OptRow on={!!room.adult} color="#a020e0" icon="chili" label="アダルト" desc="きわどい質問カードも混ざる…完全に身内だけの席で" onClick={() => updateRoom(ROOM, { adult: !room.adult })} />
    </>
  );
}

// ── ロビー：今回の役・スタート・ルール（ルールは1ラウンド目だけ開いておく）──
export function JammerLobby({ room, isHost, onStart, err, busy }) {
  const n = (room?.players || []).length;
  const { dasmon, jammer } = jammerRoles(room);
  return (
    <>
      <Panel head="今回の役（毎ラウンド じゅんぐり）" icon="loop">
        {[["dasmon", dasmon?.name], ["jammer", jammer?.name], ["wakarun", "そのほか全員"]].map(([r, who]) => (
          <div key={r} className="prow">
            <RoleChar role={r} size={36} bob={false} badge={false} />
            <span className="prow-nm" style={{ fontSize: 15 }}>{{ dasmon: "ダスモン（答える人）", jammer: "ジャマー（嘘を混ぜる人）", wakarun: "ワカルン（見抜く人）" }[r]}</span>
            <b style={{ fontSize: 16 }}>{who || "?"}</b>
          </div>
        ))}
      </Panel>
      {isHost ? (
        <>
          <button className="btn btn-red" onClick={onStart} disabled={n < 3 || busy}><Icon name="arrowR" size={24} />{busy ? "通信中…" : n < 3 ? `あと${3 - n}人` : "ワードジャマー スタート！"}</button>
          <ErrBox>{err}</ErrBox>
        </>
      ) : (
        <div className="note-bar note-dark"><Icon name="memo" size={24} />部屋主のスタートを待つてこ</div>
      )}
      <Fold head="ワードジャマーのルール" icon="memo" open={(room?.round || 1) === 1} headStyle={{ background: "linear-gradient(180deg,#8fe0b0,#3cb371)" }}>
        <div className="gd-grid">
          {[
            ["ダスモンが質問カードに本当の答えを書く（例：子どもの頃なりたかった職業は？）", null],
            ["ジャマーだけが本当の答えを見て、それっぽい嘘を2つ書く", null],
            ["3つが混ざって全員に出る。ワカルンはダスモンと話して本物を選ぶ", null],
            ["見抜いたワカルン", "+難易度（1〜3）"],
            ["だまされたワカルン1人につき ジャマー", "+1"],
            ["ワカルンの半分以上が見抜いたら ダスモン", "+1"],
          ].map(([t, p], i) => (
            <div key={i} className="gd-pt">{i < 3 && <div className="gd-num" style={{ width: 32, flex: "0 0 32px" }}>{i + 1}</div>}<div className="gd-pt-t">{t}</div>{p && <span className="chip chip-plus">{p}</span>}</div>
          ))}
        </div>
      </Fold>
    </>
  );
}

// ── ゲーム本体（phase: playing[step: answer → fake → pick] → result）──
export function JammerGame({ room, myId, isHost, lb, onHome, onAbort, onNextRound, openLb }) {
  const [ans, setAns] = useState("");
  const [myQ, setMyQ] = useState(""); // ダスモンが自分で書く質問
  const [f1, setF1] = useState("");
  const [f2, setF2] = useState("");
  const [sel, setSel] = useState(null);
  const { busy, err, run } = useAction(); // 通信中・つながらないときの表示
  const jam = room?.jam || {};
  const players = room?.players || [];
  const nameOf = (id) => players.find((p) => p.id === id)?.name || "?";
  const amDasmon = jam.dasmonId === myId;
  const amJammer = jam.jammerId === myId;
  const wakarun = players.filter((p) => p.id !== jam.dasmonId && p.id !== jam.jammerId);
  const amWakarun = wakarun.some((p) => p.id === myId);
  const myRole = amDasmon ? "dasmon" : amJammer ? "jammer" : "wakarun";
  const truth = dec(jam.answerEnc || "");
  const fakes = (jam.fakesEnc || []).map(dec);
  const order = jam.order || [];
  const options = order.map((k) => (k === 0 ? truth : fakes[k - 1]));
  const picks = jam.picks || {};
  const hdr = (sub) => <Header title="ワードジャマー" icon="memo" sub={sub || `ROUND ${room?.round || 1}`} onHome={onHome} />;

  const submitAnswer = () => {
    if (!ans.trim()) return;
    run(() => updateRoom(ROOM, { "jam/answerEnc": enc(ans.trim().slice(0, 20)), "jam/step": "fake" }));
  };
  const submitFakes = () => {
    if (!f1.trim() || !f2.trim()) return;
    run(() => updateRoom(ROOM, { "jam/fakesEnc": [enc(f1.trim().slice(0, 20)), enc(f2.trim().slice(0, 20))], "jam/order": shuffle([0, 1, 2]), "jam/step": "pick" }));
  };
  const redraw = () => run(() => transactRoom(ROOM, (cur) => (cur?.phase === "playing" && cur.jam?.step !== "pick" ? startJammerRound(cur) : undefined)));
  const finalize = () => finalizeRound((cur) => (cur.jam?.step === "pick" ? scoreJammer(cur) : null));
  const doPick = (idx) => {
    if (!amWakarun || picks[myId] !== undefined || idx === null) return;
    sfxVote(); buzz(40);
    run(() => setRoomField(ROOM, `jam/picks/${myId}`, idx)); // 自分の回答だけ書く
  };

  // 全員が選んだら採点（採点役がすぐ、寝ていれば他の端末が肩代わり。二重採点はトランザクションで防ぐ）
  useEffect(() => {
    if (jam?.step !== "pick" || room?.scored) return undefined;
    if (!wakarun.length || !wakarun.every((p) => (room?.jam?.picks || {})[p.id] !== undefined)) return undefined;
    const id = setTimeout(() => { finalize().catch(() => {}); }, scorerOf(room) === myId ? 0 : TAKEOVER_MS);
    return () => clearTimeout(id);
  }, [jam?.step, room, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const roleBar = (label) => (
    <>
    <ErrBox>{err}</ErrBox>
    <div className="note-bar note-dark" style={{ justifyContent: "space-between" }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}><RoleChar role={myRole} size={36} bob={false} badge={false} />あなたは{{ dasmon: "ダスモン", jammer: "ジャマー", wakarun: "ワカルン" }[myRole]}</span>
      <span style={{ fontSize: 13, color: "#ddd" }}>{label}</span>
    </div>
    </>
  );
  const qCard = (
    <Panel head={`${nameOf(jam.dasmonId)} への質問`} icon="pencil" headStyle={{ background: "linear-gradient(180deg,#8fe0b0,#3cb371)" }}>
      <div className="center" style={{ fontSize: 21, lineHeight: 1.5, margin: "2px 0 6px" }}>{jam.q}</div>
      <div className="center small">難易度 {"★".repeat(jam.pts || 1)}（見抜くと +{jam.pts || 1}）</div>
    </Panel>
  );
  const hostTools = (
    <HostMenu note="だれかの電波が切れて止まったときに使う">
      {jam.step !== "pick" && <button className="btn btn-dark btn-sm" onClick={redraw}>質問を引き直す（同じ役のまま）</button>}
      {jam.step === "pick" && <button className="btn btn-red btn-sm" onClick={() => run(finalize)}>いまある回答で締め切る</button>}
      <button className="btn btn-dark btn-sm" onClick={onAbort}>ラウンド中止（点数なし・次の人へ）</button>
    </HostMenu>
  );

  if (room?.phase === "playing") {
    // ── 1. ダスモンが本当の答えを書く ──
    if (jam.step === "answer") return (
      <Shell>
        {hdr()}
        {roleBar("ダスモンが答えを書いてる")}
        {qCard}
        {amDasmon && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="mp-input" style={{ marginBottom: 0, flex: 1 }} placeholder="質問を自分で書いてもOK（40文字まで）" value={myQ} maxLength={40}
              autoComplete="off" onChange={(e) => setMyQ(e.target.value)} />
            <button className="btn btn-cream btn-sm" style={{ width: "auto", padding: "0 14px", marginBottom: 0 }} disabled={!myQ.trim() || busy}
              onClick={() => { const q = myQ.trim().slice(0, 40); run(() => updateRoom(ROOM, { "jam/q": q, "jam/pts": 2 })); setMyQ(""); }}>変える</button>
          </div>
        )}
        {amDasmon ? (
          <Panel head="本当の答え（ジャマーだけが見る）" icon="pencil">
            <input className="mp-input" placeholder="本当の答え（20文字まで）" value={ans} maxLength={20} enterKeyHint="done"
              onChange={(e) => setAns(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }} />
            <button className="btn btn-gold" onClick={submitAnswer} disabled={!ans.trim() || busy} style={{ marginBottom: 0 }}><Icon name="check" size={24} />{busy ? "通信中…" : "これで決定"}</button>
          </Panel>
        ) : <div className="note-bar note-dark"><Icon name="pencil" size={24} />{nameOf(jam.dasmonId)} が本当の答えを書いてるてこ…</div>}
        <Bubble expr="thinking">{amDasmon ? "正直に書くてこ。あとで会話でとぼけてもいいけど、答えは本物てこ！" : amJammer ? "次はキミの番てこ。ダスモンに寄せた嘘を2つ考えておくてこ" : "ダスモンの顔をよく見ておくてこ。答えが出たら話して探るてこ"}</Bubble>
        {isHost && hostTools}
      </Shell>
    );

    // ── 2. ジャマーが嘘を2つ書く ──
    if (jam.step === "fake") return (
      <Shell>
        {hdr()}
        {roleBar("ジャマーが嘘を仕込み中")}
        {qCard}
        {amJammer ? (
          <Panel head="本当の答えは…（まわりに見せない）" icon="devil" headStyle={{ background: "linear-gradient(180deg,#ff8a7e,#E53935)", color: "#fff" }}>
            <div className="center" style={{ fontSize: 26, color: "#c62828", marginBottom: 10 }}>「{truth}」</div>
            <div className="panel-note" style={{ marginBottom: 8 }}>それっぽい嘘を2つ。書き方のクセや長さも真似るてこ</div>
            <input className="mp-input" placeholder="嘘の答え 1" value={f1} maxLength={20} onChange={(e) => setF1(e.target.value)} />
            <input className="mp-input" placeholder="嘘の答え 2" value={f2} maxLength={20} onChange={(e) => setF2(e.target.value)} />
            <button className="btn btn-red" onClick={submitFakes} disabled={!f1.trim() || !f2.trim() || busy} style={{ marginBottom: 0 }}><Icon name="devil" size={24} />{busy ? "通信中…" : "混ぜ込む！"}</button>
          </Panel>
        ) : <div className="note-bar note-dark"><Icon name="devil" size={24} />{nameOf(jam.jammerId)} が嘘を仕込んでるてこ…</div>}
        {isHost && hostTools}
      </Shell>
    );

    // ── 3. ワカルンが選ぶ ──
    const mine = picks[myId];
    const cnt = wakarun.filter((p) => picks[p.id] !== undefined).length;
    return (
      <Shell>
        {hdr()}
        {roleBar(`回答 ${cnt} / ${wakarun.length}`)}
        {qCard}
        <Panel head="本物はどれ？" icon="glass">
          {options.map((o, i) => (
            <button key={i} className={`btn btn-sm ${(mine === i || (mine === undefined && sel === i)) ? "btn-gold" : "btn-dark"}`}
              onClick={() => amWakarun && mine === undefined && setSel(i)} disabled={!amWakarun || (mine !== undefined && mine !== i)}
              style={{ justifyContent: "flex-start", fontSize: 18 }}>
              <Letter i={i} on={mine === i || (mine === undefined && sel === i)} /><span style={{ flex: 1, textAlign: "left" }}>{o}</span>
            </button>
          ))}
          {amWakarun && mine === undefined && (
            <button className="btn btn-red" onClick={() => doPick(sel)} disabled={sel === null || busy} style={{ marginBottom: 0 }}>{busy ? "通信中…" : sel === null ? "えらんでから決定してね" : `「${ABC[sel]}」に決定！`}</button>
          )}
          {amWakarun && mine !== undefined && <div className="panel-note center">回答ずみ。みんなを待つてこ</div>}
          {!amWakarun && <div className="panel-note center">{amDasmon ? "ワカルンの質問に答えるてこ。とぼけてもOK（バレたら…）" : "ワカルンを惑わす口出しOKてこ"}</div>}
        </Panel>
        {!amWakarun && (
          <Panel head="回答状況" icon="people">
            {wakarun.map((p) => <div key={p.id} className="prow"><span className="prow-mark">{picks[p.id] !== undefined ? <Icon name="check" size={24} /> : null}</span><span className="prow-nm">{p.name}</span><span className="prow-note">{picks[p.id] !== undefined ? "回答ずみ" : "考え中"}</span></div>)}
          </Panel>
        )}
        {isHost && hostTools}
      </Shell>
    );
  }

  // ════ 結果 ════
  if (room?.phase === "result") {
    const truthIdx = order.indexOf(0);
    const flair = computeFlair(players, lb);
    const got = wakarun.filter((p) => order[picks[p.id]] === 0).length;
    return (
      <Shell>
        {hdr(`ROUND ${room?.round || 1} 結果`)}
        <ErrBox>{err}</ErrBox>
        <div className="center pop">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}><OwlDoc size={72} bob expr={got * 2 >= wakarun.length ? "happy" : "surprised"} /></div>
          <div className="small" style={{ color: "#ddd" }}>{jam.q}</div>
          <div className="mp-title" style={{ fontSize: 26, marginTop: 4 }}>本物は {ABC[truthIdx]}「{truth}」</div>
          <div className="mp-lead" style={{ margin: "6px 0 14px" }}>見抜いたワカルン {got} / {wakarun.length} 人</div>
        </div>
        <Panel head="3つの答えと、選んだ人" icon="glass" className="rise" style={{ animationDelay: ".4s" }}>
          {options.map((o, i) => {
            const pickers = wakarun.filter((p) => picks[p.id] === i).map((p) => p.name);
            const real = order[i] === 0;
            return (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 0", borderBottom: "2px dashed #d9d2bf" }}>
                <Letter i={i} on={real} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, color: real ? "#1f7a4c" : "#c62828" }}>{o}{real ? "（本物）" : "（嘘）"}</div>
                  <div className="small">{pickers.length ? pickers.join("・") : "―"}</div>
                </div>
              </div>
            );
          })}
        </Panel>
        <Panel head="とくてん（このラウンド／合計）" icon="star">
          <PlayerRows players={players} scores={room?.scores} delta={room?.lastDelta || {}} myId={myId} animate
            mark={(p) => (p.id === jam.dasmonId ? "pencil" : p.id === jam.jammerId ? "devil" : flair[p.name] || null)} />
        </Panel>
        {isHost
          ? <button className="btn btn-gold" onClick={onNextRound} disabled={busy}><Icon name="arrowR" size={24} />次のラウンドへ（役を交代）</button>
          : <div className="note-bar note-dark">部屋主が次のラウンドを始めるてこ</div>}
        <div className="btn-row">
          <button className="btn btn-dark btn-sm" onClick={openLb}><Icon name="trophy" size={24} />せいせき</button>
          <button className="btn btn-cream btn-sm" onClick={onHome}><Icon name="door" size={24} />ホームへ</button>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="center" style={{ paddingTop: 48 }}>…</div></Shell>;
}
