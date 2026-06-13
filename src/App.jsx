import { useState, useEffect, useRef, useCallback } from "react";
import { subscribeRoom, saveRoom, loadRoom, loadLeaderboard, saveLeaderboard } from "./lib/db";
import { pickWord } from "./lib/words";

const genId = () => Math.random().toString(36).slice(2, 11);
const genCode = () => Math.random().toString(36).slice(2, 7).toUpperCase();
const enc = (t) => { try { return btoa(unescape(encodeURIComponent(t))); } catch { return btoa(t); } };
const dec = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };
const CATS = ["おまかせ", "食べもの", "場所", "モノ", "生きもの", "エンタメ", "むずかしめ"];

const C = {
  bg: "#0E0F13", surf: "#16181F", surf2: "#1C1F28",
  line: "rgba(236,231,221,0.09)",
  text: "#ECE7DD", muted: "#7E8696",
  red: "#E5484D", gold: "#D8A856", green: "#3DD68C",
};
const SERIF = "'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif";
const SANS = "system-ui,-apple-system,'Hiragino Sans','Noto Sans JP',sans-serif";

const St = {
  page: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: SANS,
    padding: "20px 18px 40px", maxWidth: "430px", margin: "0 auto", boxSizing: "border-box" },
  card: { background: C.surf, border: `1px solid ${C.line}`, borderRadius: "4px",
    padding: "18px", marginBottom: "12px" },
  inp: { width: "100%", background: C.surf2, border: `1px solid ${C.line}`,
    borderRadius: "3px", padding: "13px 14px", color: C.text, fontSize: "16px",
    outline: "none", boxSizing: "border-box", marginBottom: "10px", fontFamily: SANS },
  btn: (bg, col = C.bg, mb = "10px") => ({
    width: "100%", padding: "14px", borderRadius: "3px", border: "none",
    fontSize: "14px", fontWeight: "700", letterSpacing: "2px", cursor: "pointer",
    background: bg, color: col, marginBottom: mb, fontFamily: SANS }),
  ghost: { width: "100%", padding: "13px", borderRadius: "3px", border: `1px solid ${C.line}`,
    fontSize: "13px", fontWeight: "600", letterSpacing: "2px", cursor: "pointer",
    background: "transparent", color: C.muted, marginBottom: "10px" },
  lbl: { fontSize: "10px", color: C.muted, letterSpacing: "3px", marginBottom: "10px",
    display: "block", fontWeight: "600" },
  hr: { border: "none", borderTop: `1px solid ${C.line}`, margin: "14px 0" },
};

const Owl = ({ size = 1, color = C.red, glow = false }) => {
  const px = 64 * size;
  return (
    <svg width={px} height={px} viewBox="0 0 64 64" fill="none"
      style={{ filter: glow ? `drop-shadow(0 0 ${8 * size}px ${color}88)` : "none", display: "block" }}>
      <path d="M20 16 L15 6 L24 13 Z" fill={color} />
      <path d="M44 16 L49 6 L40 13 Z" fill={color} />
      <path d="M32 10 C18 10 12 21 12 33 C12 47 21 56 32 56 C43 56 52 47 52 33 C52 21 46 10 32 10 Z"
        stroke={color} strokeWidth="2.4" fill="none" strokeLinejoin="round" />
      <path d="M32 16 C26 22 24 30 26 40" stroke={color} strokeWidth="1.4" fill="none" opacity="0.5" />
      <path d="M32 16 C38 22 40 30 38 40" stroke={color} strokeWidth="1.4" fill="none" opacity="0.5" />
      <circle cx="32" cy="30" r="12" stroke={color} strokeWidth="2.4" fill="none" />
      <circle cx="32" cy="30" r="6.4" fill={color} />
      <circle cx="34.4" cy="27.6" r="2" fill={C.bg} />
      <path d="M32 42 L28 47 L36 47 Z" fill={color} />
      <path d="M24 50 Q28 53 32 50 Q36 53 40 50" stroke={color} strokeWidth="1.4" fill="none" opacity="0.6" />
    </svg>
  );
};

const Redacted = () => (
  <span style={{ display: "inline-block", background: C.text, color: C.text,
    borderRadius: "2px", padding: "2px 0", width: "7em", height: "1.2em",
    verticalAlign: "middle", opacity: 0.85 }} />
);

export default function TekomiInsider() {
  const myId = useRef(genId()).current;
  const [screen, setScreen] = useState("home");
  const screenRef = useRef("home");
  const setS = (s) => { screenRef.current = s; setScreen(s); };

  const [myName, setMyName] = useState("");
  const [isMaster, setIsMaster] = useState(false);
  const [isInsider, setIsInsider] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [qInput, setQInput] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [lb, setLb] = useState(null);

  const [fName, setFName] = useState("");
  const [fCode, setFCode] = useState("");
  const [creating, setCreating] = useState(false);

  const [cat, setCat] = useState("おまかせ");
  const [manualWord, setManualWord] = useState("");

  // ── 採点 ──
  const finalize = useCallback(async (code, data) => {
    if (data.scored) return data;
    const insiderId = dec(data.insiderEnc || "");
    const scores = { ...(data.scores || {}) };
    const add = (name, pts) => { scores[name] = (scores[name] || 0) + pts; };
    let outcome;
    let winners = [];

    if (!data.wordGuessed) {
      const ins = data.players.find((p) => p.id === insiderId);
      if (ins) { add(ins.name, 1); winners = [ins.name]; }
      outcome = "timeout";
    } else {
      const vc = {};
      Object.values(data.votes || {}).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
      const maxV = Math.max(0, ...Object.values(vc));
      const top = Object.entries(vc).filter(([, v]) => v === maxV).map(([k]) => k);
      const caught = top.length === 1 && top[0] === insiderId;
      if (caught) {
        data.players.forEach((p) => {
          if (p.id === data.masterId) { add(p.name, 1); winners.push(p.name); }
          else if (p.id !== insiderId) { add(p.name, 2); winners.push(p.name); }
        });
        outcome = "commons";
      } else {
        const ins = data.players.find((p) => p.id === insiderId);
        if (ins) { add(ins.name, 3); winners = [ins.name]; }
        outcome = "insider";
      }
    }

    const board = await loadLeaderboard();
    data.players.forEach((p) => {
      const e = board[p.name] || { pts: 0, games: 0, wins: 0 };
      e.games += 1;
      e.pts += (scores[p.name] || 0) - ((data.scores || {})[p.name] || 0);
      if (winners.includes(p.name)) e.wins += 1;
      board[p.name] = e;
    });
    try { await saveLeaderboard(board); } catch {}

    const updated = { ...data, phase: "result", scores, scored: true, outcome };
    await saveRoom(code, updated);
    return updated;
  }, []);

  // ── Firebase リアルタイム購読 ──
  useEffect(() => {
    if (!roomCode) return;
    const unsub = subscribeRoom(roomCode, async (data) => {
      const cur = screenRef.current;
      if (cur === "home" || cur === "lb" || !data) return;
      if (data.insiderEnc) setIsInsider(dec(data.insiderEnc) === myId);

      if (data.phase === "vote") {
        const voters = data.players.filter((p) => p.id !== data.masterId);
        if (Object.keys(data.votes || {}).length >= voters.length && voters.length > 0 && !data.scored) {
          const updated = await finalize(roomCode, data);
          setRoom(updated);
          setS("result");
          return;
        }
      }

      setRoom(data);
      if (data.phase === "lobby" && (cur === "result" || cur === "vote")) {
        setRoleRevealed(false); setS("lobby");
      }
      if (data.phase === "playing" && cur === "lobby") { setRoleRevealed(false); setS("reveal"); }
      if (data.phase === "vote" && (cur === "game" || cur === "reveal")) setS("vote");
      if (data.phase === "result" && cur !== "result") setS("result");
      if (data.phase === "playing" && data.startTime) {
        setTimeLeft(Math.max(0, data.duration - Math.floor((Date.now() - data.startTime) / 1000)));
      }
    });
    return () => unsub();
  }, [roomCode, myId, finalize]);

  useEffect(() => {
    if (screen !== "game") return;
    const id = setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => clearInterval(id);
  }, [screen]);

  // ── actions ──
  const doCreate = async () => {
    if (!fName.trim()) return setErr("名前を入れてね");
    setLoading(true); setErr("");
    const code = genCode();
    const data = { phase: "lobby", round: 1, wordEnc: null, masterId: myId, insiderEnc: null,
      players: [{ id: myId, name: fName.trim() }], startTime: null, duration: 300,
      wordGuessed: false, votes: {}, qa: [], scores: {}, scored: false, usedWords: [] };
    await saveRoom(code, data);
    setMyName(fName.trim()); setRoomCode(code); setRoom(data); setIsMaster(true);
    setS("lobby"); setLoading(false);
  };

  const doJoin = async () => {
    if (!fName.trim() || !fCode.trim()) return setErr("名前とコードを入れてね");
    setLoading(true); setErr("");
    const code = fCode.trim().toUpperCase();
    const data = await loadRoom(code);
    if (!data) { setErr("ルームが見つかりません"); setLoading(false); return; }
    if (data.phase !== "lobby") { setErr("ラウンド進行中です。少し待ってね"); setLoading(false); return; }
    const already = data.players.find((p) => p.id === myId);
    const updated = already ? data : { ...data, players: [...data.players, { id: myId, name: fName.trim() }] };
    if (!already) await saveRoom(code, updated);
    setMyName(fName.trim()); setRoomCode(code); setRoom(updated);
    setIsMaster(updated.masterId === myId);
    setS("lobby"); setLoading(false);
  };

  const doGenWord = async () => {
    setErr("");
    const word = pickWord(cat, room?.usedWords || []);
    const updated = { ...room, wordEnc: enc(word) };
    await saveRoom(roomCode, updated); setRoom(updated);
  };

  const doManualWord = async () => {
    if (!manualWord.trim()) return;
    const updated = { ...room, wordEnc: enc(manualWord.trim()) };
    await saveRoom(roomCode, updated); setRoom(updated); setManualWord("");
  };

  const doStart = async () => {
    if (!room?.wordEnc) return setErr("お題を決めてね");
    if (room.players.length < 3) return setErr("3人以上必要です");
    const nonMasters = room.players.filter((p) => p.id !== myId);
    const insider = nonMasters[Math.floor(Math.random() * nonMasters.length)];
    const updated = { ...room, phase: "playing", insiderEnc: enc(insider.id),
      startTime: Date.now(), usedWords: [...(room.usedWords || []), dec(room.wordEnc)] };
    await saveRoom(roomCode, updated);
    setRoom(updated); setIsInsider(false); setTimeLeft(updated.duration); setS("reveal");
  };

  const doAsk = async () => {
    if (!qInput.trim() || !room) return;
    const qa = room.qa || [];
    if (qa.length > 0 && qa[qa.length - 1].ans === null) return;
    const updated = { ...room, qa: [...qa, { id: genId(), q: qInput.trim(), ans: null, by: myName }] };
    await saveRoom(roomCode, updated); setRoom(updated); setQInput("");
  };

  const doAnswer = async (ans) => {
    const qa = [...(room?.qa || [])];
    if (!qa.length || qa[qa.length - 1].ans !== null) return;
    qa[qa.length - 1] = { ...qa[qa.length - 1], ans };
    const updated = { ...room, qa };
    await saveRoom(roomCode, updated); setRoom(updated);
  };

  const doWordGuessed = async () => {
    const updated = { ...room, phase: "vote", wordGuessed: true };
    await saveRoom(roomCode, updated); setRoom(updated); setS("vote");
  };

  const doTimeUp = async () => {
    const updated = await finalize(roomCode, { ...room, wordGuessed: false });
    setRoom(updated); setS("result");
  };

  const doVote = async (targetId) => {
    if (!room || room.votes?.[myId]) return;
    const updated = { ...room, votes: { ...room.votes, [myId]: targetId } };
    await saveRoom(roomCode, updated); setRoom(updated);
  };

  const doNextRound = async () => {
    const updated = { ...room, phase: "lobby", round: (room.round || 1) + 1,
      wordEnc: null, insiderEnc: null, startTime: null, wordGuessed: false,
      votes: {}, qa: [], scored: false, outcome: null };
    await saveRoom(roomCode, updated);
    setRoom(updated); setRoleRevealed(false); setS("lobby");
  };

  const doReset = () => {
    setS("home"); setMyName(""); setIsMaster(false); setIsInsider(false);
    setRoomCode(""); setRoom(null); setRoleRevealed(false); setQInput("");
    setErr(""); setFName(""); setFCode(""); setCreating(false);
  };

  const openLb = async () => { setLb(await loadLeaderboard()); setS("lb"); };

  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  const Header = ({ sub }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <Owl size={0.42} />
        <span style={{ fontFamily: SERIF, fontSize: "16px", letterSpacing: "0.5px" }}>てこみンサイダーゲーム<span style={{ color: C.red }}>❤️</span></span>
      </div>
      <div style={{ fontSize: "10px", color: C.muted, letterSpacing: "2px" }}>{sub}</div>
    </div>
  );

  // ════ HOME ════
  if (screen === "home") return (
    <div style={St.page}>
      <div style={{ textAlign: "center", padding: "40px 0 32px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}><Owl size={1.7} glow /></div>
        <div style={{ fontFamily: SERIF, fontSize: "31px", fontWeight: "700", letterSpacing: "2px", lineHeight: 1.3 }}>
          てこみンサイダー<br />ゲーム<span style={{ color: C.red }}>❤️</span>
        </div>
        <div style={{ fontSize: "11px", color: C.muted, letterSpacing: "4px", marginTop: "14px" }}>
          ひとつ目は、すべてを視ている。
        </div>
      </div>

      {!creating ? (
        <>
          <div style={St.card}>
            <span style={St.lbl}>ルームに参加</span>
            <input style={St.inp} placeholder="あなたの名前" value={fName} onChange={(e) => setFName(e.target.value)} maxLength={10} />
            <input style={{ ...St.inp, letterSpacing: "8px", fontFamily: "monospace", fontSize: "24px", textAlign: "center" }}
              placeholder="●●●●●" value={fCode} onChange={(e) => setFCode(e.target.value.toUpperCase())} maxLength={5} />
            <button style={St.btn(C.text)} onClick={doJoin} disabled={loading}>{loading ? "…" : "参加する"}</button>
          </div>
          <button style={St.ghost} onClick={() => { setCreating(true); setErr(""); }}>ルームを作る（マスター）</button>
          <button style={St.ghost} onClick={openLb}>通算成績を見る</button>
        </>
      ) : (
        <div style={St.card}>
          <span style={St.lbl}>新規ルーム作成</span>
          <input style={St.inp} placeholder="マスターの名前" value={fName} onChange={(e) => setFName(e.target.value)} maxLength={10} />
          <div style={{ fontSize: "12px", color: C.muted, marginBottom: "12px", lineHeight: 1.6 }}>
            お題はルーム作成後に内蔵リストから引く or 手入力できます
          </div>
          <button style={St.btn(C.text)} onClick={doCreate} disabled={loading}>{loading ? "…" : "作成する"}</button>
          <button style={{ ...St.ghost, marginBottom: 0 }} onClick={() => setCreating(false)}>戻る</button>
        </div>
      )}
      {err && <div style={{ color: C.red, fontSize: "13px", textAlign: "center" }}>{err}</div>}

      <hr style={St.hr} />
      <div style={{ fontSize: "12px", color: C.muted, lineHeight: 1.9 }}>
        <span style={{ color: C.gold }}>マスター</span>　お題を知り、Yes/Noで答える<br />
        <span style={{ color: C.red }}>インサイダー</span>　お題を知るが、正体は秘密<br />
        <span style={{ color: C.text }}>コモン</span>　質問でお題を当て、潜入者を暴く<br />
        <br />
        <span style={St.lbl}>得点</span>
        コモン勝利：コモン+2 ／ マスター+1<br />
        インサイダー逃げ切り：+3<br />
        時間切れ：インサイダーのみ+1
      </div>
    </div>
  );

  // ════ LEADERBOARD ════
  if (screen === "lb") {
    const rows = Object.entries(lb || {}).sort((a, b) => b[1].pts - a[1].pts);
    return (
      <div style={St.page}>
        <Header sub="通算成績" />
        <div style={St.card}>
          {rows.length === 0 && <div style={{ color: C.muted, fontSize: "13px", textAlign: "center", padding: "16px 0" }}>まだ記録がありません</div>}
          {rows.map(([name, e], i) => (
            <div key={name} style={{ display: "flex", alignItems: "baseline", padding: "10px 0",
              borderBottom: i < rows.length - 1 ? `1px solid ${C.line}` : "none" }}>
              <div style={{ width: "28px", fontFamily: SERIF, color: i === 0 ? C.gold : C.muted, fontSize: "15px" }}>{i + 1}</div>
              <div style={{ flex: 1, fontWeight: i === 0 ? "700" : "400" }}>{name}</div>
              <div style={{ fontSize: "11px", color: C.muted, marginRight: "12px" }}>{e.wins}勝 / {e.games}戦</div>
              <div style={{ fontFamily: SERIF, fontSize: "19px", color: i === 0 ? C.gold : C.text }}>{e.pts}<span style={{ fontSize: "10px", color: C.muted }}> pt</span></div>
            </div>
          ))}
        </div>
        <button style={St.ghost} onClick={() => setS(roomCode ? "result" : "home")}>戻る</button>
      </div>
    );
  }

  // ════ LOBBY ════
  if (screen === "lobby") {
    const players = room?.players || [];
    const wordSet = !!room?.wordEnc;
    return (
      <div style={St.page}>
        <Header sub={`ROUND ${room?.round || 1}`} />
        <div style={{ textAlign: "center", padding: "10px 0 22px" }}>
          <span style={St.lbl}>ルームコード</span>
          <div style={{ fontFamily: "monospace", fontSize: "44px", letterSpacing: "12px", textIndent: "12px" }}>{roomCode}</div>
        </div>

        <div style={St.card}>
          <span style={St.lbl}>参加者　{players.length}名</span>
          {players.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: "15px" }}>
              <span style={{ color: p.id === room?.masterId ? C.gold : C.text }}>
                {p.id === room?.masterId ? "◆ " : "・ "}{p.name}{p.id === myId ? "（あなた）" : ""}
              </span>
              <span style={{ fontFamily: SERIF, color: C.muted }}>{(room?.scores || {})[p.name] || 0} pt</span>
            </div>
          ))}
        </div>

        {isMaster ? (
          <div style={St.card}>
            <span style={St.lbl}>お題の設定</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "12px" }}>
              {CATS.map((c) => (
                <button key={c} onClick={() => setCat(c)} style={{
                  padding: "7px 12px", borderRadius: "2px", fontSize: "12px", cursor: "pointer",
                  border: `1px solid ${cat === c ? C.gold : C.line}`,
                  background: cat === c ? "rgba(216,168,86,0.12)" : "transparent",
                  color: cat === c ? C.gold : C.muted }}>{c}</button>
              ))}
            </div>
            <button style={St.btn(C.gold)} onClick={doGenWord}>
              お題をひく
            </button>
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
              <input style={{ ...St.inp, marginBottom: 0, flex: 1 }} placeholder="または手入力"
                value={manualWord} onChange={(e) => setManualWord(e.target.value)} maxLength={20} />
              <button style={{ ...St.ghost, width: "auto", marginBottom: 0, padding: "0 16px" }} onClick={doManualWord}>決定</button>
            </div>
            {wordSet && (
              <div style={{ textAlign: "center", padding: "12px", background: C.surf2, borderRadius: "3px", marginBottom: "12px" }}>
                <span style={{ fontSize: "10px", color: C.muted, letterSpacing: "2px" }}>現在のお題　</span>
                <span style={{ fontFamily: SERIF, fontSize: "20px", color: C.gold }}>「{dec(room.wordEnc)}」</span>
              </div>
            )}
            <button style={St.btn(wordSet && players.length >= 3 ? C.text : C.surf2, wordSet && players.length >= 3 ? C.bg : C.muted, "0")}
              onClick={doStart} disabled={!wordSet || players.length < 3}>
              {players.length < 3 ? `開始まであと${3 - players.length}名` : !wordSet ? "お題を決めてください" : "ラウンド開始"}
            </button>
            {err && <div style={{ color: C.red, fontSize: "12px", marginTop: "8px" }}>{err}</div>}
          </div>
        ) : (
          <div style={{ ...St.card, textAlign: "center", color: C.muted, fontSize: "13px", padding: "26px" }}>
            マスターの開始を待っています…<br />
            <span style={{ fontSize: "11px" }}>{wordSet ? "お題は設定済み" : "お題を選定中"}</span>
          </div>
        )}
      </div>
    );
  }

  // ════ REVEAL ════
  if (screen === "reveal") {
    const role = isMaster ? "master" : isInsider ? "insider" : "common";
    const word = dec(room?.wordEnc || "");
    return (
      <div style={{ ...St.page, display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "100vh" }}>
        {!roleRevealed ? (
          <div style={{ textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "20px" }}><Owl size={1.3} glow /></div>
            <div style={{ fontFamily: SERIF, fontSize: "22px", marginBottom: "8px" }}>{myName} 殿</div>
            <div style={{ color: C.muted, fontSize: "13px", marginBottom: "36px", lineHeight: 1.8 }}>
              辞令を交付する。<br />他言無用のこと。
            </div>
            <button style={{ ...St.btn(C.text), maxWidth: "240px", margin: "0 auto" }} onClick={() => setRoleRevealed(true)}>開封する</button>
          </div>
        ) : (
          <div style={{ textAlign: "center" }}>
            {role === "master" && <>
              <div style={{ fontFamily: SERIF, fontSize: "30px", color: C.gold, marginBottom: "8px" }}>マスター</div>
              <div style={{ color: C.muted, fontSize: "13px", marginBottom: "28px" }}>質問に Yes / No で答えよ</div>
              <div style={{ ...St.card, border: `1px solid ${C.gold}`, padding: "24px" }}>
                <span style={St.lbl}>お題</span>
                <div style={{ fontFamily: SERIF, fontSize: "32px", color: C.gold }}>「{word}」</div>
              </div>
            </>}
            {role === "insider" && <>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><Owl size={1.1} glow /></div>
              <div style={{ fontFamily: SERIF, fontSize: "30px", color: C.red, marginBottom: "8px" }}>インサイダー</div>
              <div style={{ color: C.muted, fontSize: "13px", marginBottom: "28px" }}>正体を隠し、皆をお題へ導け</div>
              <div style={{ ...St.card, border: `1px solid ${C.red}`, padding: "24px" }}>
                <span style={St.lbl}>お題</span>
                <div style={{ fontFamily: SERIF, fontSize: "32px", color: C.red }}>「{word}」</div>
              </div>
            </>}
            {role === "common" && <>
              <div style={{ fontFamily: SERIF, fontSize: "30px", marginBottom: "8px" }}>コモン</div>
              <div style={{ color: C.muted, fontSize: "13px", marginBottom: "28px" }}>質問でお題を暴け。潜入者に気をつけろ</div>
              <div style={{ ...St.card, padding: "24px" }}>
                <span style={St.lbl}>お題</span>
                <div style={{ fontSize: "26px" }}><Redacted /></div>
              </div>
            </>}
            <button style={{ ...St.btn(C.text), marginTop: "24px" }} onClick={() => setS("game")}>任務開始</button>
          </div>
        )}
      </div>
    );
  }

  // ════ GAME ════
  if (screen === "game") {
    const qa = room?.qa || [];
    const pending = qa.length > 0 && qa[qa.length - 1].ans === null;
    const word = dec(room?.wordEnc || "");
    const tColor = timeLeft < 60 ? C.red : C.text;
    return (
      <div style={St.page}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
          <div style={{ fontSize: "11px", color: isMaster ? C.gold : isInsider ? C.red : C.muted, letterSpacing: "2px" }}>
            {isMaster ? "マスター" : isInsider ? "インサイダー" : "コモン"}
          </div>
          <div style={{ fontFamily: "monospace", fontSize: "36px", color: tColor }}>{fmt(timeLeft)}</div>
          <div style={{ fontSize: "11px", color: C.muted, fontFamily: "monospace" }}>{roomCode}</div>
        </div>

        {(isMaster || isInsider) && (
          <div style={{ padding: "10px 14px", marginBottom: "12px", borderLeft: `2px solid ${isMaster ? C.gold : C.red}`, background: C.surf }}>
            <span style={{ fontSize: "10px", color: C.muted, letterSpacing: "2px" }}>お題　</span>
            <span style={{ fontFamily: SERIF, fontSize: "18px", color: isMaster ? C.gold : C.red }}>「{word}」</span>
          </div>
        )}

        <div style={{ ...St.card, maxHeight: "300px", overflowY: "auto" }}>
          <span style={St.lbl}>尋問記録　{qa.length}件</span>
          {qa.length === 0 && <div style={{ color: C.muted, fontSize: "13px", textAlign: "center", padding: "16px 0" }}>最初の質問を待っている…</div>}
          {qa.map((item, i) => (
            <div key={item.id || i} style={{ padding: "10px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ fontSize: "11px", color: C.muted, marginBottom: "3px" }}>{item.by}</div>
              <div style={{ fontSize: "15px", marginBottom: "7px" }}>{item.q}</div>
              {item.ans === null ? (
                isMaster ? (
                  <div style={{ display: "flex", gap: "6px" }}>
                    {[["YES", C.green], ["NO", C.red], ["？", C.muted]].map(([a, col]) => (
                      <button key={a} onClick={() => doAnswer(a)} style={{ flex: 1, padding: "9px", borderRadius: "2px",
                        border: `1px solid ${col}`, background: "transparent", color: col,
                        fontWeight: "700", fontSize: "13px", letterSpacing: "1px", cursor: "pointer" }}>{a}</button>
                    ))}
                  </div>
                ) : <div style={{ fontSize: "12px", color: C.muted, fontStyle: "italic" }}>回答待ち…</div>
              ) : (
                <div style={{ fontFamily: SERIF, fontSize: "17px",
                  color: item.ans === "YES" ? C.green : item.ans === "NO" ? C.red : C.muted }}>― {item.ans}</div>
              )}
            </div>
          ))}
        </div>

        {!isMaster && (
          <div style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
            <input style={{ ...St.inp, marginBottom: 0, flex: 1 }} placeholder="質問する（例：食べられる？）"
              value={qInput} onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pending && doAsk()} disabled={pending} />
            <button style={{ ...St.btn(pending ? C.surf2 : C.text, pending ? C.muted : C.bg, "0"), width: "auto", padding: "0 18px" }}
              onClick={doAsk} disabled={pending}>送信</button>
          </div>
        )}

        {isMaster && <>
          <button style={St.btn(C.green, C.bg)} onClick={doWordGuessed}>お題的中 → 投票へ</button>
          {timeLeft === 0 && <button style={St.btn(C.red, "#fff")} onClick={doTimeUp}>時間切れ → 結果へ</button>}
        </>}
        {!isMaster && timeLeft === 0 && (
          <div style={{ textAlign: "center", color: C.red, fontSize: "13px", padding: "10px" }}>時間切れ。マスターの操作を待て</div>
        )}
      </div>
    );
  }

  // ════ VOTE ════
  if (screen === "vote") {
    const votable = (room?.players || []).filter((p) => p.id !== room?.masterId && p.id !== myId);
    const voteCount = Object.keys(room?.votes || {}).length;
    const totalVoters = (room?.players || []).filter((p) => p.id !== room?.masterId).length;
    const myVote = room?.votes?.[myId];
    return (
      <div style={{ ...St.page, paddingTop: "48px" }}>
        <div style={{ textAlign: "center", marginBottom: "30px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "14px" }}><Owl size={1.1} color={C.gold} /></div>
          <div style={{ fontFamily: SERIF, fontSize: "24px", marginBottom: "6px" }}>お題は暴かれた</div>
          <div style={{ color: C.muted, fontSize: "13px" }}>潜入者は誰だ。一斉投票せよ</div>
          <div style={{ fontSize: "11px", color: C.muted, marginTop: "10px", letterSpacing: "2px" }}>{voteCount} / {totalVoters} 票</div>
        </div>
        {isMaster ? (
          <div style={{ ...St.card, textAlign: "center", color: C.muted, fontSize: "13px", padding: "24px" }}>マスターは投票しない。開票を待て</div>
        ) : myVote ? (
          <div style={{ ...St.card, textAlign: "center", color: C.muted, fontSize: "13px", padding: "24px" }}>投票完了。開票を待て</div>
        ) : (
          <div style={St.card}>
            <span style={St.lbl}>インサイダーだと思う者</span>
            {votable.map((p) => (
              <button key={p.id} style={{ ...St.ghost, color: C.text, fontSize: "15px" }} onClick={() => doVote(p.id)}>{p.name}</button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ════ RESULT ════
  if (screen === "result") {
    const insiderId = dec(room?.insiderEnc || "");
    const insiderPlayer = room?.players?.find((p) => p.id === insiderId);
    const word = dec(room?.wordEnc || "");
    const votes = room?.votes || {};
    const vc = {};
    Object.values(votes).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
    const oc = room?.outcome;
    const title = oc === "commons" ? "コモン側の勝利" : oc === "insider" ? "インサイダーの勝利" : "時間切れ — 任務失敗";
    const tcol = oc === "commons" ? C.green : C.red;
    return (
      <div style={St.page}>
        <Header sub={`ROUND ${room?.round || 1} 結果`} />
        <div style={{ textAlign: "center", padding: "16px 0 24px" }}>
          <div style={{ fontFamily: SERIF, fontSize: "26px", color: tcol, marginBottom: "6px" }}>{title}</div>
          <div style={{ fontSize: "13px", color: C.muted }}>
            お題　<span style={{ fontFamily: SERIF, fontSize: "18px", color: C.gold }}>「{word}」</span>
          </div>
        </div>

        <div style={{ ...St.card, textAlign: "center", border: `1px solid ${C.red}` }}>
          <span style={St.lbl}>インサイダーの正体</span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px" }}>
            <Owl size={0.7} />
            <span style={{ fontFamily: SERIF, fontSize: "26px", color: C.red }}>{insiderPlayer?.name || "?"}</span>
          </div>
        </div>

        <div style={St.card}>
          <span style={St.lbl}>得点</span>
          {(room?.players || []).map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "baseline", padding: "8px 0", borderBottom: `1px solid ${C.line}` }}>
              <div style={{ flex: 1 }}>
                <span style={{ color: p.id === insiderId ? C.red : p.id === room.masterId ? C.gold : C.text }}>
                  {p.name}{p.id === myId ? "（あなた）" : ""}
                </span>
                {vc[p.id] ? <span style={{ fontSize: "11px", color: C.muted }}>　{vc[p.id]}票</span> : null}
              </div>
              <div style={{ fontFamily: SERIF, fontSize: "19px" }}>{(room?.scores || {})[p.name] || 0}<span style={{ fontSize: "10px", color: C.muted }}> pt</span></div>
            </div>
          ))}
        </div>

        {isMaster ? (
          <button style={St.btn(C.text)} onClick={doNextRound}>同じメンバーで次のラウンド</button>
        ) : (
          <div style={{ textAlign: "center", color: C.muted, fontSize: "12px", marginBottom: "10px" }}>マスターが次のラウンドを開始できます</div>
        )}
        <button style={St.ghost} onClick={openLb}>通算成績を見る</button>
        <button style={St.ghost} onClick={doReset}>解散する</button>
      </div>
    );
  }

  return <div style={St.page}><div style={{ textAlign: "center", paddingTop: "48px", color: C.muted }}>…</div></div>;
}
