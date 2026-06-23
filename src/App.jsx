import { useState, useEffect, useRef, useCallback } from "react";
import { subscribeRoom, saveRoom, setRoomField, loadRoom, loadLeaderboard, saveLeaderboard } from "./lib/db";
import { pickWord } from "./lib/words";
import { sfxClick, sfxSelect, sfxCorrect, sfxDrumroll, sfxResult, setSound, isSound } from "./lib/sound";

const genId = () => Math.random().toString(36).slice(2, 11);
const NONE_ID = "__none__";
const BOTTOM_ICON = "💩";

// 累計ポイント順位フレア（1位👑 / ビリ💩・同点は全員に付与）。全員同点なら付けない。
function computeFlair(players, board) {
  const flair = {};
  if (!players || players.length < 2) return flair;
  const pts = players.map((p) => ({ name: p.name, pt: (board?.[p.name]?.pts) || 0 }));
  const max = Math.max(...pts.map((x) => x.pt));
  const min = Math.min(...pts.map((x) => x.pt));
  if (max > min) {
    pts.forEach((x) => { if (x.pt === max) flair[x.name] = "👑"; else if (x.pt === min) flair[x.name] = BOTTOM_ICON; });
  }
  return flair;
}
const ROOM = "main"; // 身内専用：全員ひとつの部屋に集まる（ルームコード廃止）
const GATE = "__gate__"; // 開閉フラグの保存先（rooms/ 配下なので既存ルールでOK）
const HOST_KEY = "tekomi"; // 主催者キー（開閉できる人だけが知る合言葉。変更可）
const enc = (t) => { try { return btoa(unescape(encodeURIComponent(t))); } catch { return btoa(t); } };
const dec = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };
const CATS = ["おまかせ", "食べもの", "場所", "モノ", "生きもの", "エンタメ", "むずかしめ"];

// 各オプションは独立ON/OFF。組み合わせOK。
const OPTS = [
  { key: "peace",    label: "平和村",      emoji: "😇", desc: "10%でインサイダー不在。疑心暗鬼MAX", color: "#8a8a8a" },
  { key: "adult",    label: "アダルト🔞", emoji: "🌶️", desc: "お題がきわどく…完全身内専用", color: "#a020e0" },
  { key: "follower", label: "フォロワー",  emoji: "🥷", desc: "6人以上で発動。インサイダーの隠れ味方が1人", color: "#7a2fa0" },
];
// 有効なオプションの要約ラベル
const optsSummary = (r) => {
  if (!r) return "ふつう";
  const on = [];
  if (r.peace) on.push("平和村");
  if (r.adult) on.push("アダルト");
  if (r.follower) on.push("フォロワー");
  return on.length ? on.join("＋") : "ふつう";
};

const MASTER_RULES = {
  random: { label: "ランダム", emoji: "🎲", desc: "毎ラウンド、ランダムに抽選" },
  robin:  { label: "じゅんぐり", emoji: "🔁", desc: "参加順に1人ずつローテーション" },
  fixed:  { label: "固定", emoji: "📌", desc: "部屋主がずっとマスター" },
};

const TIMES = [{ s: 300, label: "5分" }, { s: 420, label: "7分" }, { s: 540, label: "9分" }];

// 次のマスターを決める
function nextMaster(players, curId, rule, hostId) {
  if (!players || players.length === 0) return hostId;
  if (rule === "fixed") return hostId;
  const idx = players.findIndex((p) => p.id === curId);
  if (rule === "robin") return players[(idx + 1) % players.length].id;
  // random（直前のマスターはなるべく避ける）
  const pool = players.length > 1 ? players.filter((p) => p.id !== curId) : players;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

const TUTORIAL = [
  "ようこそ『てこみンサイダーゲーム』へてこ！これは“知ってるフリ”を見破る心理ゲームだてこ。3人以上で遊べるてこ。",
  "役は3つあるてこ。【マスター】はお題を知ってて質問に答える人。【インサイダー】もお題を知ってるけど正体はナイショ。【コモン】はお題を知らずに当てにいく人だてこ。",
  "コモンが質問して、マスターがYES/NOで答えるてこ。制限時間内にみんなでお題を当てるのが目標だてこ。",
  "でも、インサイダーが紛れてる…！お題が当たったら、全員で『インサイダーは誰だ？』と一斉投票するてこ。",
  "見破れたらコモンの勝ち、逃げ切ればインサイダーの勝ちだてこ。飲みながら、疑いながらワイワイやるのが一番てこ🍺",
  "とくてんはこうだてこ → お題＆犯人を当てたら【コモン・マスター ともに+2】、インサイダーが逃げ切ったら【インサイダー+3】。時間内にお題が当たらなかったら【マスター0・コモン−1・インサイダー−2】！みんな損するから、インサイダーも“バレずに当てさせる”のがコツてこ。フォロワーはインサイダーと運命共同体てこ！",
  "慣れたら【平和村】【カオス】【アダルト🔞】も試すてこ！部屋主がロビーで“ゲーム設定”からモードやフォロワーを選べるてこ。それじゃ、いってらっしゃいてこ！",
];

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DotGothic16&display=swap');
* { box-sizing: border-box; }
.mp-page, .mp-page * { font-family:'DotGothic16','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif; }
.mp-page { min-height:100vh; max-width:460px; margin:0 auto;
  background: radial-gradient(ellipse at 50% 16%, #232323, #0d0d0d 60%, #050505); color:#F2F2F2;
  padding:18px 16px 44px; position:relative; overflow-x:hidden; }
.mp-title { font-size:26px; color:#D4AF37;
  text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,2px 2px 0 #000,-2px 2px 0 #000,4px 4px 0 rgba(0,0,0,.6);
  text-align:center; line-height:1.3; letter-spacing:1px; }
.mp-sub { font-size:11px; text-align:center; letter-spacing:3px; text-shadow:1px 1px 0 #000; margin-top:6px; color:#F2F2F2; }
.tk-logo { text-align:center; line-height:1; user-select:none; }
.tk-logo-top { font-size:15px; color:#F4F1EA; letter-spacing:6px; text-indent:6px;
  text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6); margin-bottom:4px; }
.tk-logo-main { font-size:46px; color:#D4AF37; letter-spacing:4px; text-indent:4px; font-weight:400;
  text-shadow:3px 0 0 #000,-3px 0 0 #000,0 3px 0 #000,0 -3px 0 #000,3px 3px 0 #000,-3px 3px 0 #000,3px -3px 0 #000,-3px -3px 0 #000,5px 6px 0 rgba(0,0,0,.55); }
.tk-logo-sub { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:7px;
  font-size:18px; color:#D4AF37; letter-spacing:8px; text-indent:8px;
  text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,2px 2px 0 rgba(0,0,0,.6); }
.tk-logo-bar { display:inline-block; width:34px; height:4px; background:#D4AF37; box-shadow:0 2px 0 #000, 0 0 0 1px #000; }
.mp-h { font-size:13px; color:#D4AF37;
  text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6);
  letter-spacing:2px; text-align:center; margin-bottom:10px; }
.mp-panel { background:#F4EFE3; border:4px solid #D4AF37; border-radius:16px; box-shadow:0 7px 0 #000;
  padding:14px 12px; margin-bottom:14px; color:#1a1a1a; }
.mp-panel-head { background:linear-gradient(180deg,#e8cd72,#D4AF37); color:#0D0D0D; border:2.5px solid #000; border-radius:8px; text-align:center;
  font-size:11px; padding:5px; margin-bottom:10px; letter-spacing:2px; }
.mp-btn { display:block; width:100%; border:3px solid #000; border-radius:12px; font-family:inherit;
  font-size:14px; padding:13px 0 11px; cursor:pointer; letter-spacing:1px; margin-bottom:10px; color:#fff;
  -webkit-text-stroke:0.3px #000; transition:transform .07s, box-shadow .07s; }
.mp-btn:active { transform:translateY(5px); box-shadow:none !important; }
.mp-btn:disabled { filter:grayscale(0.6) brightness(0.8); cursor:default; transform:none; }
.mp-red    { background:linear-gradient(180deg,#ff7b6e,#E53935 50%,#9c150f); box-shadow:0 6px 0 #5e0d09,0 7px 0 #000; text-shadow:1px 1px 0 #600; }
.mp-blue   { background:linear-gradient(180deg,#3a3a3a,#1e1e1e 50%,#0d0d0d); border-color:#D4AF37; box-shadow:0 6px 0 #000,0 7px 0 #D4AF37; color:#D4AF37; text-shadow:1px 1px 0 #000; }
.mp-yellow { background:linear-gradient(180deg,#fbf3da,#e7d49f 50%,#c2a557); box-shadow:0 6px 0 #8a7434,0 7px 0 #000; color:#3a2a00; text-shadow:1px 1px 0 rgba(255,255,255,.5); }
.mp-green  { background:linear-gradient(180deg,#f1d885,#D4AF37 50%,#937017); box-shadow:0 6px 0 #5e4810,0 7px 0 #000; color:#1a1200; text-shadow:1px 1px 0 #f5e9c4; }
.mp-purple { background:linear-gradient(180deg,#e29bff,#a020e0 50%,#6a0fa0); box-shadow:0 6px 0 #4a0a78,0 7px 0 #000; text-shadow:1px 1px 0 #408; }
.mp-input { width:100%; background:#fbf7ec; border:3px solid #000; border-radius:8px;
  box-shadow:inset 0 3px 0 rgba(0,0,0,.12); padding:11px 12px; font-family:inherit; font-size:16px;
  color:#111; margin-bottom:10px; outline:none; }
.mp-bubble { background:#fffef0; border:4px solid #000; border-radius:14px;
  box-shadow:0 5px 0 #000, inset 0 0 0 2px #D4AF37; padding:12px 12px 10px 58px; position:relative;
  min-height:56px; color:#111; font-size:12px; line-height:1.65; margin-bottom:14px; }
.mp-bubble-name { position:absolute; top:-12px; left:54px; background:#D4AF37; border:2.5px solid #000;
  border-radius:8px; font-size:10px; padding:1px 8px; box-shadow:1px 2px 0 #000; color:#0D0D0D; }
.mp-bubble-owl { position:absolute; left:-8px; top:-12px; }
.mp-row { display:flex; justify-content:space-between; align-items:center; }
.mp-star { position:absolute; pointer-events:none; }
.mp-bob { animation: mp-bob 1.3s ease-in-out infinite; }
@keyframes mp-tw { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:1;transform:scale(1.35)} }
@keyframes mp-bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
@keyframes mp-blink { 50%{opacity:0} }
/* ファミコン風 2フレーム：カクッとホップ＋たまにまばたき */
.tk-hop { animation: tk-hop .62s infinite; }
@keyframes tk-hop { 0%,50%{transform:translateY(0)} 50.01%,100%{transform:translateY(-3px)} }
.tk-lid { transform-box: fill-box; transform-origin: center; animation: tk-blink 3.4s steps(1) infinite; }
@keyframes tk-blink { 0%,93%{transform:scaleY(0)} 94%,98%{transform:scaleY(1)} 100%{transform:scaleY(0)} }
.mp-modecard { display:flex; align-items:center; gap:9px; text-align:left; width:100%;
  border:3px solid #000; border-radius:12px; padding:9px 10px; margin-bottom:9px; cursor:pointer;
  box-shadow:0 4px 0 #000; background:#fff; color:#111; font-family:inherit; }
.mp-modecard:active { transform:translateY(3px); box-shadow:none; }
`;

const STARS = [
  { t: "6%", l: "12%", s: 11, c: "#FFD700", d: "0s" }, { t: "10%", l: "82%", s: 9, c: "#fff", d: ".4s" },
  { t: "20%", l: "50%", s: 7, c: "#ffec8a", d: ".8s" }, { t: "30%", l: "8%", s: 8, c: "#fff", d: "1.1s" },
  { t: "34%", l: "90%", s: 12, c: "#FFD700", d: ".2s" }, { t: "48%", l: "20%", s: 7, c: "#fff", d: ".9s" },
  { t: "55%", l: "78%", s: 9, c: "#ffec8a", d: "1.3s" }, { t: "66%", l: "6%", s: 10, c: "#FFD700", d: ".5s" },
  { t: "72%", l: "92%", s: 8, c: "#fff", d: "1s" }, { t: "82%", l: "30%", s: 7, c: "#ffec8a", d: ".3s" },
  { t: "88%", l: "70%", s: 11, c: "#FFD700", d: ".7s" }, { t: "92%", l: "14%", s: 8, c: "#fff", d: "1.2s" },
];
const Stars = () => (
  <>{STARS.map((s, i) => (
    <div key={i} className="mp-star" style={{
      top: s.t, left: s.l, width: s.s, height: s.s, background: s.c,
      clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
      animation: `mp-tw 2s ease-in-out ${s.d} infinite`,
    }} />
  ))}</>
);

// オリジナルのドット絵てこみん（SVG・透過）。黒×白の帽＋金の星、金縁の服。表情5種。
const PX = { W: "#F4F1EA", K: "#1E1E1E", G: "#D4AF37", S: "#F6D9B8", E: "#141414", H: "#ffffff" };
// 帽子・顔・服のベース（顔の中身は表情で描く）
const BASE = [
  "....WWWWWWWW....",
  "..WWWWWWWWWWWW..",
  ".WWWWWWKKKKKWWW.",
  "WWWWWWKKKGKKKWWW",
  "WWWWWKKGGGGKKWWW",
  "WWWWWKKKGGKKKWWW",
  ".WWWWWWKKKKKWWW.",
  "..WWWWWWWWWWWW..",
  "...SSSSSSSSSS...",
  "..SSSSSSSSSSSS..",
  "..SSSSSSSSSSSS..",
  "..SSSSSSSSSSSS..",
  "...SSSSSSSSSS...",
  "...KKKKKKKKKK...",
  "..KKKGGGGGGKKK..",
  "..KKK....KKK....",
];
const EXPRS = ["normal", "thinking", "surprised", "suspicious", "happy"];
// 表情ごとの目・口（[x,y,w,h,色キー]）
const FACES = {
  normal:     [[4,9,2,2,"E"],[10,9,2,2,"E"],[4,9,1,1,"H"],[10,9,1,1,"H"],[6,12,4,1,"E"]],
  happy:      [[4,10,1,1,"E"],[5,9,1,1,"E"],[10,9,1,1,"E"],[11,10,1,1,"E"],[6,11,4,1,"E"],[7,12,2,1,"E"]],
  surprised:  [[4,9,2,2,"E"],[10,9,2,2,"E"],[4,9,1,1,"H"],[10,9,1,1,"H"],[7,11,2,2,"E"]],
  thinking:   [[4,9,2,1,"E"],[10,9,2,1,"E"],[7,12,3,1,"E"]],
  suspicious: [[3,10,3,1,"E"],[10,10,3,1,"E"],[8,12,3,1,"E"],[10,11,1,1,"E"]],
};
const OwlDoc = ({ size = 54, bob = false, expr = "normal" }) => {
  const e = EXPRS.includes(expr) ? expr : "normal";
  const cells = [];
  BASE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = PX[row[x]];
      if (c) cells.push(<rect key={`b${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />);
    }
  });
  FACES[e].forEach(([x, y, w, h, k], i) => cells.push(<rect key={`f${i}`} x={x} y={y} width={w} height={h} fill={PX[k]} />));
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" className={bob ? "tk-hop" : ""}
      shapeRendering="crispEdges" style={{ display: "block", filter: "drop-shadow(1px 1.5px 0 rgba(0,0,0,.55))" }}>
      {cells}
      {bob && <rect className="tk-lid" x="3" y="9" width="10" height="2" fill="#F6D9B8" />}
    </svg>
  );
};

// INSIDER GAME ロゴ（public/logo.png。無ければテキスト）
// タイトルロゴ（ドットフォント＋金の袋文字）
const Logo = () => (
  <div className="tk-logo">
    <div className="tk-logo-top">てこみの</div>
    <div className="tk-logo-main">INSIDER</div>
    <div className="tk-logo-sub"><span className="tk-logo-bar" />GAME<span className="tk-logo-bar" /></div>
  </div>
);

const Bubble = ({ name = "てこみん", children, arrow = false, expr = "normal" }) => (
  <div className="mp-bubble">
    <span className="mp-bubble-owl"><OwlDoc size={52} bob expr={expr} /></span>
    <span className="mp-bubble-name">{name}</span>
    {children}
    {arrow && <span style={{ position: "absolute", bottom: 8, right: 12, color: "#E53935", fontSize: 12, animation: "mp-blink .8s steps(1) infinite" }}>▼</span>}
  </div>
);

const Shell = ({ children }) => (
  <>
    <style>{CSS}</style>
    <div className="mp-page"><Stars />{children}</div>
  </>
);

const PointsPanel = () => (
  <div className="mp-panel">
    <div className="mp-panel-head">★ とくてん ★</div>
    <div style={{ fontSize: 11, lineHeight: 1.85, color: "#1a1a1a" }}>
      <div><b style={{ color: "#b8901f" }}>コモン勝利</b>（お題＆犯人を当てた）：コモン・マスター ともに <b>+2</b></div>
      <div><b style={{ color: "#E53935" }}>インサイダー逃げ切り</b>（お題は判明したが犯人を当てられなかった）：インサイダー <b>+3</b></div>
      <div><b style={{ color: "#E53935" }}>時間切れ</b>（お題を当てられず）：マスター0／コモン <b>−1</b>／インサイダー <b>−2</b></div>
      <div style={{ color: "#7a2fa0" }}>フォロワーはインサイダーと運命共同体（逃げ切り <b>+2</b> ／ 時間切れ <b>−2</b>）</div>
      <div style={{ color: "#6a6a6a" }}>平和村：全員が「インサイダーなし」に投票できたら全員 <b>+1</b></div>
    </div>
  </div>
);

const Redacted = () => (
  <span style={{ display: "inline-block", background: "#111", borderRadius: 3, width: "7em", height: "1.1em", verticalAlign: "middle" }} />
);

export default function TekomiInsider() {
  // 端末ごとの安定ID（localStorage永続）。同名入室時は既存プレイヤーIDを引き継ぐ。
  const [myId, setMyId] = useState(() => {
    let v = localStorage.getItem("tekomi_uid");
    if (!v) { v = genId(); localStorage.setItem("tekomi_uid", v); }
    return v;
  });
  const [screen, setScreen] = useState("home");
  const screenRef = useRef("home");
  const setS = (s) => { screenRef.current = s; setScreen(s); };

  const [myName, setMyName] = useState("");
  const [isMaster, setIsMaster] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isInsider, setIsInsider] = useState(false);
  const [isFollower, setIsFollower] = useState(false);
  const [soundOn, setSoundOn] = useState(isSound());
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [qInput, setQInput] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [lb, setLb] = useState(null);
  const [tutStep, setTutStep] = useState(0);

  const [fName, setFName] = useState("");
  const [cat, setCat] = useState("おまかせ");
  const [gateOpen, setGateOpen] = useState(null); // null=読込中
  const [hostUnlocked, setHostUnlocked] = useState(false);

  // 開閉フラグを購読＋主催者ロック状態を復元
  useEffect(() => {
    if (localStorage.getItem("tekomi_host") === "1") setHostUnlocked(true);
    const unsub = subscribeRoom(GATE, (d) => setGateOpen(!!(d && d.open)));
    return () => unsub();
  }, []);

  // すべての<button>クリックでクリック音（鳴らない取りこぼしを防ぐ）
  useEffect(() => {
    const h = (e) => { if (e.target.closest && e.target.closest("button")) sfxClick(); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  const setGate = async (open) => { await saveRoom(GATE, { open }); setGateOpen(open); };
  const tryHostUnlock = () => {
    const k = window.prompt("主催者キーを入力してね");
    if (k === null) return;
    if (k === HOST_KEY) { setHostUnlocked(true); localStorage.setItem("tekomi_host", "1"); }
    else window.alert("キーがちがうよ");
  };

  // 効果音 ON/OFF（localStorage 永続）
  useEffect(() => {
    const saved = localStorage.getItem("tekomi_sound");
    if (saved !== null) { const on = saved === "1"; setSound(on); setSoundOn(on); }
  }, []);
  const toggleSound = () => {
    const next = !soundOn;
    setSound(next); setSoundOn(next);
    localStorage.setItem("tekomi_sound", next ? "1" : "0");
    if (next) sfxCorrect();
  };

  // 累計成績（順位フレア用）をロビー／結果でロード
  useEffect(() => {
    if (screen === "lobby" || screen === "result") {
      loadLeaderboard().then(setLb).catch(() => {});
    }
  }, [screen, room?.scored, room?.round]);

  // 結果ジングル（ラウンドごと1回）
  const resultPlayed = useRef(null);
  useEffect(() => {
    if (screen === "result" && room?.outcome) {
      const key = `${room.round}-${room.outcome}`;
      if (resultPlayed.current !== key) {
        resultPlayed.current = key;
        sfxResult(["commons", "peace_win"].includes(room.outcome));
      }
    }
  }, [screen, room?.outcome, room?.round]);

  // ── 採点 ──
  const finalize = useCallback(async (code, data) => {
    if (data.scored) return data;
    const isPeace = !!data.isPeaceVillage;
    const insiderId = isPeace ? null : dec(data.insiderEnc || "");
    const followerId = dec(data.followerEnc || "");
    const scores = { ...(data.scores || {}) };
    const add = (name, pts) => { scores[name] = (scores[name] || 0) + pts; };
    let outcome;
    let winners = [];

    if (isPeace) {
      // 平和村ルート
      if (!data.wordGuessed) {
        outcome = "peace_timeout";
      } else {
        const vc = {};
        Object.values(data.votes || {}).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
        const maxV = Math.max(0, ...Object.values(vc));
        const top = Object.entries(vc).filter(([, v]) => v === maxV).map(([k]) => k);
        const villageWon = top.length === 1 && top[0] === NONE_ID;
        if (villageWon) {
          data.players.forEach((p) => { add(p.name, 1); winners.push(p.name); });
          outcome = "peace_win";
        } else {
          outcome = "peace_lose";
        }
      }
    } else {
      // 通常ルート（ふつう／アダルト）。フォロワーはインサイダーと運命共同体。
      const fol = followerId ? data.players.find((p) => p.id === followerId) : null;
      if (!data.wordGuessed) {
        // 時間切れ：マスター0／コモン-1／インサイダー・フォロワー-2。
        data.players.forEach((p) => {
          if (p.id === data.masterId) return;
          if (p.id === insiderId || p.id === followerId) add(p.name, -2);
          else add(p.name, -1);
        });
        outcome = "timeout";
      } else {
        const vc = {};
        Object.values(data.votes || {}).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
        const maxV = Math.max(0, ...Object.values(vc));
        const top = Object.entries(vc).filter(([, v]) => v === maxV).map(([k]) => k);
        const caught = top.length === 1 && top[0] === insiderId;
        if (caught) {
          data.players.forEach((p) => {
            if (p.id === data.masterId) { add(p.name, 2); winners.push(p.name); }
            else if (p.id !== insiderId && p.id !== followerId) { add(p.name, 2); winners.push(p.name); }
          });
          outcome = "commons";
        } else {
          const ins = data.players.find((p) => p.id === insiderId);
          if (ins) { add(ins.name, 3); winners = [ins.name]; }
          if (fol) { add(fol.name, 2); winners.push(fol.name); }
          outcome = "insider";
        }
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
      if (cur === "home" || cur === "lb" || cur === "tutorial" || !data) return;
      setIsMaster(data.masterId === myId);
      setIsHost(data.hostId === myId);
      setIsInsider(data.insiderEnc ? dec(data.insiderEnc) === myId : false);
      setIsFollower(data.followerEnc ? dec(data.followerEnc) === myId : false);

      if (data.phase === "vote") {
        // マスターも投票する → 全員ぶん揃ったら開票
        const voters = data.players;
        if (Object.keys(data.votes || {}).length >= voters.length && voters.length > 0 && !data.scored) {
          sfxDrumroll();
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
      // 残り時間はマスターが正。非マスターはマスターの配信値（timeLeft）を表示するだけ。
      if (data.phase === "playing") {
        if (data.masterId !== myId) {
          const t = typeof data.timeLeft === "number"
            ? data.timeLeft
            : Math.max(0, (data.duration || 300) - Math.floor((Date.now() - (data.startTime || Date.now())) / 1000));
          setTimeLeft(Math.max(0, t));
        }
      }
    });
    return () => unsub();
  }, [roomCode, myId, finalize]);

  // マスターだけが時計を進め、毎秒Firebaseへ配信（全員が同じ残り時間を見る）
  const tlRef = useRef(0);
  tlRef.current = timeLeft;
  useEffect(() => {
    if (screen !== "game" || !isMaster) return;
    const id = setInterval(() => {
      const n = Math.max(0, tlRef.current - 1);
      setTimeLeft(n);
      setRoomField(ROOM, "timeLeft", n);
    }, 1000);
    return () => clearInterval(id);
  }, [screen, isMaster]);

  // ── actions ──
  const freshRoom = (name, uid = myId) => ({
    phase: "lobby", round: 1, peace: false, adult: false, follower: false, masterRule: "random",
    hostId: uid, masterId: uid, wordEnc: null,
    insiderEnc: null, followerEnc: null, players: [{ id: uid, name }],
    startTime: null, duration: 300, wordGuessed: false, votes: {}, qa: [], scores: {}, scored: false,
    usedWords: [], isPeaceVillage: false,
  });

  const doEnter = async () => {
    if (!gateOpen && !hostUnlocked) return setErr("いまは開いてないよ。主催者がオープンにするまで待ってね");
    if (!fName.trim()) return setErr("なまえをいれてね");
    setLoading(true); setErr("");
    const name = fName.trim();
    let data = await loadRoom(ROOM);
    let uid = myId;
    if (!data || !data.players) {
      data = freshRoom(name, uid);
      await saveRoom(ROOM, data);
    } else if (data.phase !== "lobby") {
      // 同名の既存プレイヤーがいれば「復帰」を許可（同一アカウント扱い）
      const sameName = data.players.find((p) => p.name === name);
      if (!sameName) { setErr("いまゲーム中…ロビーに戻るまで待ってね（だれもいなければ下のリセット）"); setLoading(false); return; }
      uid = sameName.id;
    } else {
      const sameName = data.players.find((p) => p.name === name);
      if (sameName) {
        uid = sameName.id; // 同名は同一アカウントとして引き継ぐ（重複させない）
      } else {
        let nd = { ...data, players: [...data.players, { id: uid, name }] };
        await saveRoom(ROOM, nd); data = nd;
      }
      if (hostUnlocked && data.hostId !== uid) { // 主催者は部屋主（設定権）を引き継ぐ
        const nd = { ...data, hostId: uid }; await saveRoom(ROOM, nd); data = nd;
      }
    }
    if (uid !== myId) setMyId(uid);
    setMyName(name); setRoomCode(ROOM); setRoom(data);
    setIsMaster(data.masterId === uid); setIsHost(data.hostId === uid);
    setS("lobby"); setLoading(false);
  };

  const doResetRoom = async () => {
    const name = (myName || fName).trim() || "プレイヤー";
    const data = freshRoom(name);
    await saveRoom(ROOM, data);
    setMyName(name); setRoomCode(ROOM); setRoom(data); setIsMaster(true); setIsHost(true);
    setRoleRevealed(false); setErr(""); setS("lobby");
  };

  const toggleOpt = async (key) => {
    if (!room) return;
    const u = { ...room, [key]: !room[key] };
    // アダルトを切り替えたら現在のお題はリセット（語彙ソースが変わるため）
    if (key === "adult") u.wordEnc = null;
    await saveRoom(ROOM, u); setRoom(u);
  };

  const setDuration = async (sec) => {
    if (!room) return;
    const u = { ...room, duration: sec };
    await saveRoom(ROOM, u); setRoom(u);
  };

  const doExtend = async () => {
    if (!room) return;
    const n = tlRef.current + 60;
    setTimeLeft(n);
    await setRoomField(ROOM, "duration", (room.duration || 300) + 60);
    await setRoomField(ROOM, "timeLeft", n); // 全員へ即同期
  };

  const setMasterRule = async (rule) => {
    if (!room) return;
    // 固定にしたら今回のマスターを部屋主へ。それ以外はそのまま。
    const masterId = rule === "fixed" ? room.hostId : room.masterId;
    const u = { ...room, masterRule: rule, masterId };
    await saveRoom(ROOM, u); setRoom(u);
  };

  const doGenWord = async () => {
    setErr("");
    const word = pickWord(cat, room?.usedWords || [], !!room?.adult);
    const u = { ...room, wordEnc: enc(word) };
    await saveRoom(ROOM, u); setRoom(u);
  };

  const doStart = async () => {
    if (!room?.wordEnc) return setErr("お題を決めてね");
    if (room.players.length < 3) return setErr("3人以上ひつようだてこ");
    const nonMasters = room.players.filter((p) => p.id !== room.masterId);
    let insiderEnc = null, followerEnc = null;
    const isPeaceVillage = !!room.peace && Math.random() < 0.1; // 平和村は10%
    const insider = isPeaceVillage ? null : nonMasters[Math.floor(Math.random() * nonMasters.length)];
    insiderEnc = insider ? enc(insider.id) : null;
    // フォロワー：6人以上＆インサイダー在のときだけ、インサイダー以外から1名
    if (room.follower && insider && room.players.length >= 6) {
      const pool = nonMasters.filter((p) => p.id !== insider.id);
      if (pool.length) followerEnc = enc(pool[Math.floor(Math.random() * pool.length)].id);
    }
    const u = { ...room, phase: "playing", insiderEnc, followerEnc, isPeaceVillage,
      startTime: Date.now(), timeLeft: room.duration || 300, usedWords: [...(room.usedWords || []), dec(room.wordEnc)] };
    await saveRoom(ROOM, u);
    setRoom(u); setIsInsider(false); setIsFollower(false); setTimeLeft(u.duration); setS("reveal");
  };

  const doAsk = async () => {
    if (!qInput.trim() || !room) return;
    const qa = room.qa || [];
    if (qa.length > 0 && qa[qa.length - 1].ans === null) return;
    const u = { ...room, qa: [...qa, { id: genId(), q: qInput.trim(), ans: null, by: myName }] };
    await saveRoom(ROOM, u); setRoom(u); setQInput("");
  };

  const doAnswer = async (ans) => {
    const qa = [...(room?.qa || [])];
    if (!qa.length || qa[qa.length - 1].ans !== null) return;
    qa[qa.length - 1] = { ...qa[qa.length - 1], ans };
    const u = { ...room, qa };
    await saveRoom(ROOM, u); setRoom(u);
  };

  const doWordGuessed = async () => {
    sfxCorrect();
    const u = { ...room, phase: "vote", wordGuessed: true };
    await saveRoom(ROOM, u); setRoom(u); setS("vote");
  };

  const doTimeUp = async () => {
    const u = await finalize(ROOM, { ...room, wordGuessed: false });
    setRoom(u); setS("result");
  };

  const doVote = async (targetId) => {
    if (!room || room.votes?.[myId]) return;
    const u = { ...room, votes: { ...room.votes, [myId]: targetId } };
    await saveRoom(ROOM, u); setRoom(u);
  };

  // 電波不良などで全員の票が揃わないとき、主催者が今ある票で強制開票
  const doForceFinalize = async () => {
    if (!room || room.scored) return;
    sfxDrumroll();
    const u = await finalize(ROOM, room);
    setRoom(u); setS("result");
  };

  const doNextRound = async () => {
    const newMaster = nextMaster(room.players, room.masterId, room.masterRule || "random", room.hostId);
    const u = { ...room, phase: "lobby", round: (room.round || 1) + 1, masterId: newMaster,
      wordEnc: null, insiderEnc: null, followerEnc: null, isPeaceVillage: false,
      startTime: null, wordGuessed: false, votes: {}, qa: [], scored: false, outcome: null };
    await saveRoom(ROOM, u);
    setRoom(u); setRoleRevealed(false); setS("lobby");
  };

  const doReset = () => {
    setS("home"); setMyName(""); setIsMaster(false); setIsInsider(false);
    setRoomCode(""); setRoom(null); setRoleRevealed(false); setQInput(""); setErr(""); setFName("");
    setIsFollower(false); setIsHost(false);
  };

  const openLb = async () => { setLb(await loadLeaderboard()); setS("lb"); };

  const doClearLeaderboard = async () => {
    if (!window.confirm("通算成績を全部消すよ？（全員ぶん・元に戻せない）")) return;
    try { await saveLeaderboard({}); } catch {}
    setLb({});
  };

  const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
  const Header = ({ sub, onBack }) => (
    <div className="mp-row" style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {onBack && (
          <button onClick={onBack} className="mp-btn mp-blue"
            style={{ width: "auto", padding: "5px 9px", margin: 0, fontSize: 12, borderRadius: 8, boxShadow: "0 3px 0 #000,0 4px 0 #D4AF37" }}>←</button>
        )}
        <OwlDoc size={28} />
        <span style={{ fontSize: 13, color: "#D4AF37", textShadow: "1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6)" }}>てこみンサイダー❤</span>
      </div>
      <div style={{ fontSize: 10, textShadow: "1px 1px 0 #000", letterSpacing: 1 }}>{sub}</div>
    </div>
  );

  // ════ HOME ════
  if (screen === "home") return (
    <Shell>
      <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
        <Logo width={250} />
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 6px" }}><OwlDoc size={96} bob /></div>
        <div className="mp-sub">～みんなでなぞを解け！～</div>
      </div>

      {gateOpen === null ? (
        <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 22 }}>…よみこみ中…</div>
      ) : (gateOpen || hostUnlocked) ? (
        <div className="mp-panel">
          <input className="mp-input" placeholder="あなたのなまえ" value={fName}
            onChange={(e) => setFName(e.target.value)} maxLength={10} />
          <button className="mp-btn mp-green" onClick={doEnter} disabled={loading}>
            {loading ? "…" : "▶ はじめる"}
          </button>
          {hostUnlocked && (
            <button className="mp-btn mp-blue" onClick={doResetRoom} style={{ marginBottom: 0 }}>🔄 部屋をリセットして新しく始める</button>
          )}
          {hostUnlocked && !gateOpen && <div style={{ fontSize: 11, color: "#E53935", textAlign: "center", marginTop: 6 }}>※今はクローズ中。下でオープンにすると みんな入れるよ</div>}
        </div>
      ) : (
        <div className="mp-panel" style={{ textAlign: "center", padding: 22 }}>
          <div style={{ fontSize: 30 }}>🔒</div>
          <div style={{ fontSize: 14, fontWeight: 700, margin: "6px 0" }}>いまは閉まっています</div>
          <div style={{ fontSize: 11, color: "#666" }}>主催者がオープンにするまで待ってね</div>
        </div>
      )}

      {hostUnlocked ? (
        gateOpen
          ? <button className="mp-btn mp-red" onClick={() => setGate(false)}>🔒 クローズする（締め切る）</button>
          : <button className="mp-btn mp-green" onClick={() => setGate(true)}>🔓 オープンにする（みんな入れる）</button>
      ) : (
        <button className="mp-btn mp-blue" onClick={tryHostUnlock}>🔑 主催者メニュー</button>
      )}

      <button className="mp-btn mp-yellow" onClick={() => { setTutStep(0); setS("tutorial"); }}>📖 あそびかた</button>
      <button className="mp-btn mp-blue" onClick={openLb}>★ つうさんせいせき</button>
      <button className="mp-btn mp-yellow" onClick={toggleSound}>{soundOn ? "🔊 こうかおん ON" : "🔇 こうかおん OFF"}</button>

      {err && <div style={{ color: "#fff", background: "#E53935", border: "2px solid #000", borderRadius: 8, fontSize: 12, textAlign: "center", padding: "8px", marginTop: 6 }}>{err}</div>}

      <Bubble arrow>
        ようこそてこ！<br />なまえを入れて「みんなで あつまる」を押すてこ。はじめてなら「あそびかた」を見るといいてこ！
      </Bubble>
    </Shell>
  );

  // ════ TUTORIAL ════
  if (screen === "tutorial") return (
    <Shell>
      <Header sub="あそびかた" onBack={() => setS("home")} />
      <div className="mp-h">★ てこみんのあそびかた講座 ★</div>
      <div style={{ display: "flex", justifyContent: "center", margin: "10px 0 14px" }}><OwlDoc size={80} bob /></div>
      <div className="mp-bubble" style={{ paddingLeft: 14, minHeight: 110, fontSize: 13 }}>
        <span className="mp-bubble-name" style={{ left: 16 }}>てこみん</span>
        <div style={{ paddingTop: 4 }}>{TUTORIAL[tutStep]}</div>
      </div>
      <div style={{ textAlign: "center", fontSize: 11, marginBottom: 10, letterSpacing: 2 }}>
        {tutStep + 1} / {TUTORIAL.length}
      </div>
      {tutStep < TUTORIAL.length - 1 ? (
        <button className="mp-btn mp-green" onClick={() => setTutStep((s) => s + 1)}>つぎへ ▶</button>
      ) : (
        <button className="mp-btn mp-green" onClick={() => setS("home")}>とじる ✓</button>
      )}
      <div className="mp-row" style={{ gap: 8 }}>
        <button className="mp-btn mp-blue" style={{ flex: 1, marginBottom: 0 }} disabled={tutStep === 0}
          onClick={() => setTutStep((s) => Math.max(0, s - 1))}>◀ もどる</button>
        <button className="mp-btn mp-yellow" style={{ flex: 1, marginBottom: 0 }} onClick={() => setS("home")}>やめる</button>
      </div>
    </Shell>
  );

  // ════ LEADERBOARD ════
  if (screen === "lb") {
    const rows = Object.entries(lb || {}).sort((a, b) => b[1].pts - a[1].pts);
    return (
      <Shell>
        <Header sub="つうさんせいせき" onBack={() => setS(roomCode ? "result" : "home")} />
        <div className="mp-h">★ つうさん せいせき ★</div>
        <div className="mp-panel">
          {rows.length === 0 && <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: "16px 0" }}>まだ記録がないてこ</div>}
          {rows.map(([name, e], i) => {
            const spread = rows.length > 1 && rows[0][1].pts > rows[rows.length - 1][1].pts;
            const icon = spread ? (i === 0 ? "👑" : i === rows.length - 1 ? "💩" : "") : "";
            return (
            <div key={name} className="mp-row" style={{ padding: "9px 0", borderBottom: i < rows.length - 1 ? "2px dashed #ddd" : "none" }}>
              <div style={{ width: 26, fontSize: 18, color: i === 0 ? "#E53935" : "#888", WebkitTextStroke: i === 0 ? "0.5px #000" : "none" }}>{i + 1}</div>
              <div style={{ flex: 1, fontSize: 13, color: "#111", fontWeight: i === 0 ? 700 : 400 }}>{icon ? icon + " " : ""}{name}</div>
              <div style={{ fontSize: 10, color: "#888", marginRight: 10 }}>{e.wins}勝/{e.games}戦</div>
              <div style={{ fontSize: 17, color: "#D4AF37", WebkitTextStroke: "0.5px #000" }}>{e.pts}<span style={{ fontSize: 9, color: "#888" }}>pt</span></div>
            </div>
            );
          })}
        </div>
        <button className="mp-btn mp-yellow" onClick={() => setS(roomCode ? "result" : "home")}>◀ もどる</button>
        <button className="mp-btn mp-red" onClick={doClearLeaderboard} style={{ fontSize: 12 }}>🗑 通算成績をリセット</button>
      </Shell>
    );
  }

  // ════ LOBBY ════
  if (screen === "lobby") {
    const players = room?.players || [];
    const wordSet = !!room?.wordEnc;
    const adult = !!room?.adult;
    const flair = computeFlair(players, lb);
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1}`} onBack={() => { if (window.confirm("ホームに戻る？（通算成績は消えないよ）")) doReset(); }} />

        <div className="mp-panel">
          <div className="mp-panel-head">★ プレイヤー {players.length}名 ★</div>
          {players.map((p) => (
            <div key={p.id} className="mp-row" style={{ padding: "6px 2px" }}>
              <span style={{ fontSize: 13, color: p.id === room?.masterId ? "#E53935" : "#111" }}>
                {flair[p.name] ? flair[p.name] + " " : (p.id === room?.masterId ? "🎤 " : "・ ")}{p.name}{p.id === myId ? "（あなた）" : ""}
              </span>
              <span style={{ fontSize: 13, color: "#D4AF37" }}>{(room?.scores || {})[p.name] || 0}pt</span>
            </div>
          ))}
          {players.length < 3 && <div style={{ fontSize: 11, color: "#E53935", textAlign: "center", marginTop: 6 }}>あと{3 - players.length}名でスタートできるてこ</div>}
        </div>

        {(() => {
          const masterName = players.find((p) => p.id === room?.masterId)?.name || "?";
          const rule = room?.masterRule || "random";
          return (
            <>
              <div className="mp-panel" style={{ textAlign: "center", padding: 10 }}>
                <span style={{ fontSize: 10, color: "#888" }}>今回のマスター（{MASTER_RULES[rule].label}）</span>
                <div style={{ fontSize: 18, color: "#E53935", WebkitTextStroke: "0.4px #000" }}>🎤 {masterName}{room?.masterId === myId ? "（あなた）" : ""}</div>
              </div>

              {isHost && (
                <div className="mp-panel">
                  <div className="mp-panel-head">★ ゲーム設定（部屋主） ★</div>
                  <div style={{ fontSize: 10, color: "#888", marginBottom: 6, letterSpacing: 1 }}>オプション（自由にON/OFF・組み合わせOK）</div>
                  {OPTS.map((o) => {
                    const on = !!room[o.key];
                    return (
                      <div key={o.key} className="mp-modecard" onClick={() => toggleOpt(o.key)}
                        style={{ borderColor: on ? o.color : "#000", boxShadow: on ? `0 4px 0 ${o.color}` : "0 4px 0 #000", background: on ? "#fff8e6" : "#fff" }}>
                        <div style={{ fontSize: 22, filter: "drop-shadow(1px 1px 0 #000)" }}>{o.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700 }}>{o.label}{on ? " ✓" : ""}</div>
                          <div style={{ fontSize: 9, color: "#666", lineHeight: 1.3 }}>{o.desc}</div>
                        </div>
                        <div style={{ width: 34, height: 20, borderRadius: 10, position: "relative", border: "2px solid #000", background: on ? o.color : "#ccc" }}>
                          <div style={{ position: "absolute", top: 1, left: on ? 15 : 1, width: 14, height: 14, borderRadius: "50%", background: "#fff", border: "1px solid #000" }} />
                        </div>
                      </div>
                    );
                  })}
                  {room.follower && players.length < 6 && (
                    <div style={{ fontSize: 10, color: "#a020e0", textAlign: "center", marginTop: 2 }}>※フォロワーは6人以上で有効。今は{players.length}人なので未発動</div>
                  )}

                  <div style={{ fontSize: 10, color: "#888", margin: "12px 0 6px", letterSpacing: 1 }}>マスターの決め方</div>
                  {Object.entries(MASTER_RULES).map(([k, r]) => (
                    <div key={k} className="mp-modecard" onClick={() => setMasterRule(k)}
                      style={{ borderColor: rule === k ? "#D4AF37" : "#000", boxShadow: rule === k ? "0 4px 0 #D4AF37" : "0 4px 0 #000", background: rule === k ? "#eef6ff" : "#fff" }}>
                      <div style={{ fontSize: 22, filter: "drop-shadow(1px 1px 0 #000)" }}>{r.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 700 }}>{r.label}{rule === k ? " ✓" : ""}</div>
                        <div style={{ fontSize: 9, color: "#666", lineHeight: 1.3 }}>{r.desc}</div>
                      </div>
                    </div>
                  ))}

                  <div style={{ fontSize: 10, color: "#888", margin: "12px 0 6px", letterSpacing: 1 }}>せいげん時間</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {TIMES.map((t) => (
                      <button key={t.s} onClick={() => setDuration(t.s)} style={{
                        flex: 1, padding: "9px 0", borderRadius: 8, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
                        border: "2.5px solid #000", boxShadow: (room.duration || 300) === t.s ? "0 3px 0 #D4AF37" : "0 3px 0 #000",
                        background: (room.duration || 300) === t.s ? "#D4AF37" : "#fff", color: "#111" }}>{t.label}</button>
                    ))}
                  </div>
                </div>
              )}

              {isMaster ? (
                <>
                  <div className="mp-panel">
                    <div className="mp-panel-head">★ お題をきめる（あなたがマスター） ★</div>
                    {adult ? (
                      <div style={{ fontSize: 11, color: "#a020e0", textAlign: "center", marginBottom: 10, lineHeight: 1.5 }}>
                        🌶️ アダルト専用のきわどいお題から出るてこ<br />（カテゴリは選べないてこ）
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
                        {CATS.map((c) => (
                          <button key={c} onClick={() => setCat(c)} style={{
                            padding: "6px 10px", borderRadius: 8, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
                            border: `2.5px solid #000`, boxShadow: "0 2px 0 #000",
                            background: cat === c ? "#D4AF37" : "#fff", color: "#111" }}>{c}</button>
                        ))}
                      </div>
                    )}
                    <button className="mp-btn mp-yellow" onClick={doGenWord}>🎲 お題をひく</button>
                    {wordSet && (
                      <div style={{ textAlign: "center", padding: 10, background: "#fff8dc", border: "3px solid #000", borderRadius: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: "#888" }}>いまのお題　</span>
                        <span style={{ fontSize: 20, color: "#E53935", WebkitTextStroke: "0.5px #000" }}>「{dec(room.wordEnc)}」</span>
                      </div>
                    )}
                  </div>
                  <button className="mp-btn mp-red" onClick={doStart} disabled={!wordSet || players.length < 3}>
                    {players.length < 3 ? `あと${3 - players.length}名` : !wordSet ? "お題をきめてね" : "▶ ゲームスタート！"}
                  </button>
                  {err && <div style={{ color: "#fff", background: "#E53935", border: "2px solid #000", borderRadius: 8, fontSize: 12, textAlign: "center", padding: 7, marginBottom: 10 }}>{err}</div>}
                </>
              ) : (
                <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 12, padding: 22 }}>
                  🎤 {masterName} がお題を準備中…<br />
                  <span style={{ fontSize: 11, color: "#D4AF37" }}>モード：{optsSummary(room)}</span><br />
                  <span style={{ fontSize: 11 }}>{wordSet ? "お題は準備OK" : "お題をえらび中"}</span>
                </div>
              )}

              {isHost && <button className="mp-btn mp-blue" onClick={doResetRoom}>🔄 部屋をリセット</button>}
            </>
          );
        })()}
        <PointsPanel />
        <Bubble>
          {isMaster ? "キミが今回のマスター！お題を引いてスタートだてこ！" : isHost ? "設定はキミ（部屋主）が管理てこ。マスターがお題を引くのを待つてこ" : "今回のマスターが準備中てこ。ちょっと待つてこ🍺"}
        </Bubble>
      </Shell>
    );
  }

  // ── 役職判定 ──
  let role = "common";
  if (isMaster) role = "master";
  else if (isFollower) role = "follower";
  else role = isInsider ? "insider" : "common";
  const knowsWord = role === "master" || role === "insider";

  // ════ REVEAL ════
  if (screen === "reveal") {
    const word = dec(room?.wordEnc || "");
    const insName = room?.players?.find((p) => p.id === dec(room?.insiderEnc || ""))?.name;
    const folName = room?.players?.find((p) => p.id === dec(room?.followerEnc || ""))?.name;
    const roleMeta = {
      master:        { name: "マスター", color: "#D4AF37", desc: "質問に YES / NO で答えるてこ" },
      insider:       { name: "インサイダー", color: "#E53935", desc: "正体を隠して、みんなをお題へ導くてこ" },
      common:        { name: "コモン", color: "#D4AF37", desc: "質問でお題を当てて、潜入者を暴くてこ" },
      follower:      { name: "フォロワー", color: "#a020e0", desc: "お題は知らないが、インサイダーの味方てこ" },
    }[role];
    return (
      <Shell>
        {!roleRevealed ? (
          <div style={{ textAlign: "center", paddingTop: 50 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><OwlDoc size={88} bob expr="surprised" /></div>
            <div className="mp-title" style={{ fontSize: 22 }}>{myName} へ</div>
            <div style={{ fontSize: 12, margin: "14px 0 28px", textShadow: "1px 1px 0 #000", lineHeight: 1.8 }}>
              役職をくばるてこ。<br />ほかの人に見られないようにてこ！
            </div>
            <button className="mp-btn mp-red" style={{ maxWidth: 260, margin: "0 auto" }} onClick={() => setRoleRevealed(true)}>▶ 開封する</button>
          </div>
        ) : (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><OwlDoc size={70} bob /></div>
            <div className="mp-title" style={{ fontSize: 30, color: roleMeta.color }}>{roleMeta.name}</div>
            <div style={{ fontSize: 12, margin: "10px 0 22px", textShadow: "1px 1px 0 #000" }}>{roleMeta.desc}</div>
            <div className="mp-panel" style={{ padding: 22 }}>
              <div className="mp-panel-head" style={{ background: roleMeta.color }}>お題</div>
              <div style={{ fontSize: 30, color: roleMeta.color, WebkitTextStroke: "0.5px #000" }}>
                {knowsWord ? `「${word}」` : <Redacted />}
              </div>
            </div>
            {role === "follower" && insName && (
              <div className="mp-panel" style={{ padding: 12, border: "5px solid #a020e0", marginTop: -2 }}>
                <span style={{ fontSize: 10, color: "#888" }}>味方のインサイダーは…　</span>
                <span style={{ fontSize: 18, color: "#a020e0", WebkitTextStroke: "0.4px #000" }}>{insName}</span>
              </div>
            )}
            {role === "insider" && folName && (
              <div className="mp-panel" style={{ padding: 12, border: "5px solid #a020e0", marginTop: -2 }}>
                <span style={{ fontSize: 10, color: "#888" }}>あなたのフォロワーは…　</span>
                <span style={{ fontSize: 18, color: "#a020e0", WebkitTextStroke: "0.4px #000" }}>{folName}</span>
              </div>
            )}
            <button className="mp-btn mp-green" onClick={() => setS("game")}>▶ 任務開始！</button>
          </div>
        )}
      </Shell>
    );
  }

  // ════ GAME ════
  if (screen === "game") {
    const qa = room?.qa || [];
    const pending = qa.length > 0 && qa[qa.length - 1].ans === null;
    const word = dec(room?.wordEnc || "");
    const roleLabel = { master: "マスター", insider: "インサイダー", common: "コモン", follower: "フォロワー" }[role];
    const roleColor = role === "master" ? "#D4AF37" : role === "insider" ? "#E53935" : role === "follower" ? "#a020e0" : "#D4AF37";
    return (
      <Shell>
        <div className="mp-panel" style={{ padding: "8px 12px", marginBottom: 12 }}>
          <div className="mp-row">
            <span style={{ fontSize: 11, color: roleColor, WebkitTextStroke: "0.3px #000" }}>{roleLabel}</span>
            <span style={{ fontSize: 30, color: timeLeft < 60 ? "#E53935" : "#111", WebkitTextStroke: "1px #000" }}>{fmt(timeLeft)}</span>
            <span style={{ fontSize: 10, color: "#888" }}>{optsSummary(room)}</span>
          </div>
        </div>

        {knowsWord && (
          <div className="mp-panel" style={{ padding: "8px 12px", marginBottom: 12, background: "#fff8dc" }}>
            <span style={{ fontSize: 10, color: "#888" }}>お題　</span>
            <span style={{ fontSize: 18, color: roleColor, WebkitTextStroke: "0.4px #000" }}>「{word}」</span>
          </div>
        )}

        <div className="mp-panel" style={{ maxHeight: 300, overflowY: "auto" }}>
          <div className="mp-panel-head">★ しつもん記録 {qa.length}件 ★</div>
          {qa.length === 0 && <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: "16px 0" }}>さいしょの質問を待ってるてこ</div>}
          {qa.map((item, i) => (
            <div key={item.id || i} style={{ padding: "9px 0", borderBottom: "2px dashed #ddd" }}>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>{item.by}</div>
              <div style={{ fontSize: 14, color: "#111", marginBottom: 6 }}>{item.q}</div>
              {item.ans === null ? (
                isMaster ? (
                  <div style={{ display: "flex", gap: 6 }}>
                    {[["YES", "mp-green"], ["NO", "mp-red"], ["？", "mp-blue"]].map(([a, cls]) => (
                      <button key={a} className={`mp-btn ${cls}`} style={{ flex: 1, marginBottom: 0, padding: "8px 0", fontSize: 13 }} onClick={() => doAnswer(a)}>{a}</button>
                    ))}
                  </div>
                ) : <div style={{ fontSize: 12, color: "#888" }}>回答待ち…</div>
              ) : (
                <div style={{ fontSize: 16, color: item.ans === "YES" ? "#D4AF37" : item.ans === "NO" ? "#E53935" : "#888" }}>― {item.ans}</div>
              )}
            </div>
          ))}
        </div>

        {!isMaster && (
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input className="mp-input" style={{ marginBottom: 0, flex: 1 }} placeholder="しつもんする（例：食べられる？）"
              value={qInput} onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !pending && doAsk()} disabled={pending} />
            <button className="mp-btn mp-green" style={{ width: "auto", padding: "0 18px", marginBottom: 0 }} onClick={doAsk} disabled={pending}>送信</button>
          </div>
        )}

        {isMaster && <>
          <button className="mp-btn mp-green" onClick={doWordGuessed}>✓ お題的中 → 投票へ</button>
          <button className="mp-btn mp-yellow" onClick={doExtend}>⏱ 1分 延長する</button>
          {timeLeft === 0 && <button className="mp-btn mp-red" onClick={doTimeUp}>⏰ 時間切れ → 結果へ</button>}
        </>}
        {!isMaster && timeLeft === 0 && (
          <div style={{ textAlign: "center", color: "#fff", background: "#E53935", border: "2px solid #000", borderRadius: 8, fontSize: 12, padding: 8, marginBottom: 8 }}>時間切れ。マスターの操作を待つてこ</div>
        )}
        {isHost && !isMaster && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: "#fff", textShadow: "1px 1px 0 #000", textAlign: "center", marginBottom: 4 }}>主催者の強制進行（マスターが反応しない時）</div>
            <button className="mp-btn mp-red" onClick={doWordGuessed}>⏩ 強制で投票へ</button>
            <button className="mp-btn mp-red" onClick={doTimeUp}>⏩ 強制で結果へ（時間切れ扱い）</button>
          </div>
        )}
      </Shell>
    );
  }

  // ════ VOTE ════
  if (screen === "vote") {
    const votable = (room?.players || []).filter((p) => p.id !== room?.masterId && p.id !== myId);
    const voteCount = Object.keys(room?.votes || {}).length;
    const totalVoters = (room?.players || []).length; // マスター含め全員が投票
    const myVote = room?.votes?.[myId];
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "30px 0 22px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><OwlDoc size={70} bob expr="suspicious" /></div>
          <div className="mp-title" style={{ fontSize: 22 }}>お題は暴かれた！</div>
          <div style={{ fontSize: 12, marginTop: 8, textShadow: "1px 1px 0 #000" }}>
            潜入者は誰だ。一斉投票せよ！
          </div>
          <div style={{ fontSize: 11, marginTop: 8, letterSpacing: 2, textShadow: "1px 1px 0 #000" }}>{voteCount} / {totalVoters} 票</div>
        </div>
        {myVote ? (
          <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>✓ 投票完了。開票を待つてこ</div>
        ) : (
          <div className="mp-panel">
            <div className="mp-panel-head">★ インサイダーは誰だ？ ★</div>
            {votable.map((p) => (
              <button key={p.id} className="mp-btn mp-blue" onClick={() => doVote(p.id)}>{p.name}</button>
            ))}
            {room?.peace && (
              <button className="mp-btn mp-green" onClick={() => doVote(NONE_ID)}>✅ インサイダーはいない（平和村）</button>
            )}
          </div>
        )}
        {isHost && (
          <button className="mp-btn mp-red" onClick={doForceFinalize} style={{ marginTop: 6 }}>
            ⏩ 強制的に開票する（揃わない時用）
          </button>
        )}
      </Shell>
    );
  }

  // ════ RESULT ════
  if (screen === "result") {
    const isPeace = !!room?.isPeaceVillage;
    const insiderId = isPeace ? null : dec(room?.insiderEnc || "");
    const insiderPlayer = room?.players?.find((p) => p.id === insiderId);
    const word = dec(room?.wordEnc || "");
    const votes = room?.votes || {};
    const vc = {};
    Object.values(votes).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
    const oc = room?.outcome;
    const titleMap = {
      commons: "コモンの勝利！", insider: "インサイダーの勝利！", timeout: "時間切れ — 失敗…",
      peace_win: "平和村 — 村の勝利！", peace_lose: "平和村 — 村の失敗…", peace_timeout: "時間切れ — 失敗…",
    };
    const title = titleMap[oc] || "結果";
    const tcol = (oc === "commons" || oc === "peace_win") ? "#D4AF37" : "#E53935";
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1} 結果`} onBack={() => { if (window.confirm("ホームに戻る？（通算成績は消えないよ）")) doReset(); }} />
        <div style={{ textAlign: "center", padding: "10px 0 18px" }}>
          <div className="mp-title" style={{ fontSize: 24, color: tcol }}>{title}</div>
          <div style={{ fontSize: 12, marginTop: 8, textShadow: "1px 1px 0 #000" }}>
            お題　<span style={{ fontSize: 18, color: "#FFD700", WebkitTextStroke: "0.4px #000" }}>「{word}」</span>
          </div>
        </div>

        {isPeace ? (
          <div className="mp-panel" style={{ textAlign: "center", border: "5px solid #D4AF37" }}>
            <div className="mp-panel-head" style={{ background: "#D4AF37" }}>このラウンドは…</div>
            <div style={{ fontSize: 22, color: "#D4AF37", WebkitTextStroke: "0.5px #000" }}>平和村 😇</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>インサイダーはいなかった</div>
          </div>
        ) : (
          <div className="mp-panel" style={{ textAlign: "center", border: "5px solid #E53935" }}>
            <div className="mp-panel-head">インサイダーの正体は…</div>
            <div className="mp-row" style={{ justifyContent: "center", gap: 10 }}>
              <OwlDoc size={40} />
              <span style={{ fontSize: 24, color: "#E53935", WebkitTextStroke: "0.5px #000" }}>{insiderPlayer?.name || "?"}</span>
            </div>
          </div>
        )}

        <div className="mp-panel">
          <div className="mp-panel-head">★ とくてん ★</div>
          {(() => {
            const flair = computeFlair(room?.players || [], lb);
            return (room?.players || []).map((p) => (
              <div key={p.id} className="mp-row" style={{ padding: "7px 0", borderBottom: "2px dashed #ddd" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, color: (!isPeace && p.id === insiderId) ? "#E53935" : p.id === room.masterId ? "#D4AF37" : "#111" }}>
                    {flair[p.name] ? flair[p.name] + " " : (p.id === room.masterId ? "🎤 " : "")}{p.name}{p.id === myId ? "（あなた）" : ""}
                  </span>
                  {vc[p.id] ? <span style={{ fontSize: 10, color: "#888" }}>　{vc[p.id]}票</span> : null}
                </div>
                <div style={{ fontSize: 18, color: "#D4AF37", WebkitTextStroke: "0.4px #000" }}>{(room?.scores || {})[p.name] || 0}<span style={{ fontSize: 9, color: "#888" }}>pt</span></div>
              </div>
            ));
          })()}
        </div>

        {Object.keys(votes).length > 0 && (
          <div className="mp-panel">
            <div className="mp-panel-head" style={{ background: "#D4AF37" }}>★ だれが だれに ★</div>
            {(room?.players || []).filter((p) => votes[p.id]).map((p) => {
              const tgt = votes[p.id];
              const tName = tgt === NONE_ID ? "インサイダーなし" : (room?.players?.find((q) => q.id === tgt)?.name || "?");
              return (
                <div key={p.id} style={{ fontSize: 12, padding: "5px 2px", color: "#111" }}>
                  {p.name} <span style={{ color: "#E53935" }}>→</span> {tName}
                </div>
              );
            })}
          </div>
        )}

        {isHost ? (
          <button className="mp-btn mp-green" onClick={doNextRound}>▶ 同じメンバーで次のラウンド</button>
        ) : (
          <div style={{ textAlign: "center", color: "#fff", fontSize: 12, marginBottom: 10, textShadow: "1px 1px 0 #000" }}>🏠 部屋主が次のラウンドを始められるてこ</div>
        )}
        <button className="mp-btn mp-blue" onClick={openLb}>★ つうさんせいせき</button>
        <button className="mp-btn mp-yellow" onClick={doReset}>🚪 解散する</button>
      </Shell>
    );
  }

  return <Shell><div style={{ textAlign: "center", paddingTop: 48 }}>…</div></Shell>;
}
