import { useState, useEffect, useRef, useCallback } from "react";
import { subscribeRoom, saveRoom, setRoomField, loadRoom, loadLeaderboard, saveLeaderboard } from "./lib/db";
import { pickWord, dealMagicCards } from "./lib/words";
import { sfxClick, sfxCorrect, sfxDrumroll, sfxResult, setSound, isSound } from "./lib/sound";
import { applyLeaderboard, addScores } from "./lib/scoring";
import { genId, ROOM, enc, dec, fmt, computeFlair, topVote, OwlDoc, Logo, Bubble, Shell, Redacted, Header, ErrBox, ScoreRows, ModeCard } from "./ui";
import Guide from "./Guide";
import { WolfSettings, WolfGame, startWolfRound, resetWolfRound } from "./games/WordWolf";
import { JammerSettings, JammerGame, startJammerRound, resetJammerRound } from "./games/WordJammer";

const NONE_ID = "__none__";
const GATE = "__gate__"; // 開閉フラグの保存先（rooms/ 配下なので既存ルールでOK）
const HOST_KEY = "tekomi"; // 主催者キー（開閉できる人だけが知る合言葉。変更可）
const CATS = ["おまかせ", "食べもの", "場所", "モノ", "生きもの", "エンタメ", "むずかしめ"];

// ── 遊べるゲーム。ロビーで部屋主が切り替える（同じ部屋・同じメンバーのまま移動できる）──
export const GAMES = {
  insider:  { label: "インサイダー", emoji: "🕵️", color: "#D4AF37", min: 3, desc: "質問でお題を当て、知ってるフリの潜入者を暴く" },
  wordwolf: { label: "ワードウルフ", emoji: "🐺", color: "#5b8def", min: 3, desc: "みんなでお題を語り合い、1人だけ違うお題の“ウルフ”を探す" },
  jammer:   { label: "ワードジャマー", emoji: "📝", color: "#3cb371", min: 3, desc: "本当の答えに嘘を2つ混ぜて、見抜けるか騙し合う" },
};

// 各オプションは独立ON/OFF。マジカルは役職構造が変わるので、平和村・フォロワーとは同時に使わない。
const OPTS = [
  { key: "magic",    label: "マジカル🪄", emoji: "🧙", desc: "マスター＝魔術師。村人は正解を知らないが誰がインサイダーか知っている。しゃべり方の縛り“魔術カード”つき", color: "#5b8def" },
  { key: "peace",    label: "平和村",      emoji: "😇", desc: "10%でインサイダー不在。疑心暗鬼MAX", color: "#8a8a8a" },
  { key: "adult",    label: "アダルト🔞", emoji: "🌶️", desc: "お題がきわどく…完全身内専用", color: "#a020e0" },
  { key: "follower", label: "フォロワー",  emoji: "🥷", desc: "6人以上で発動。インサイダーの隠れ味方が1人", color: "#7a2fa0" },
];
// 有効なオプションの要約ラベル
const optsSummary = (r) => {
  if (!r) return "ふつう";
  const on = [];
  if (r.magic) on.push("マジカル");
  if (r.peace && !r.magic) on.push("平和村");
  if (r.adult) on.push("アダルト");
  if (r.follower && !r.magic) on.push("フォロワー");
  return on.length ? on.join("＋") : "ふつう";
};

const MASTER_RULES = {
  random: { label: "ランダム", emoji: "🎲", desc: "毎ラウンド、ランダムに抽選" },
  robin:  { label: "じゅんぐり", emoji: "🔁", desc: "参加順に1人ずつローテーション" },
  fixed:  { label: "固定", emoji: "📌", desc: "部屋主がずっとマスター" },
};

const TIMES = [{ s: 300, label: "5分" }, { s: 420, label: "7分" }, { s: 540, label: "9分" }];

// 未回答の質問かどうか。Firebase は null のキーを保存しないので、
// 読み戻すと ans は undefined になる（=== null では判定できない）。
const isUnanswered = (item) => item?.ans === null || item?.ans === undefined;

// 残り時間は startTime を正として各端末が自分で計算する。
// （マスターの端末がスリープしても全員の時計が止まらない。延長は duration を伸ばす）
const calcLeft = (d) => {
  if (!d?.startTime) return d?.duration || 300;
  return Math.max(0, (d.duration || 300) - Math.floor((Date.now() - d.startTime) / 1000));
};

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


const PointsPanel = ({ magic }) => (
  <div className="mp-panel">
    <div className="mp-panel-head">★ とくてん ★</div>
    <div style={{ fontSize: 11, lineHeight: 1.85, color: "#1a1a1a" }}>
      {magic ? (
        <>
          <div><b style={{ color: "#5b8def" }}>村人チーム勝利</b>（お題を当て、魔術師が指名を外した）：村人・インサイダー <b>+2</b></div>
          <div><b style={{ color: "#E53935" }}>魔術師の勝利</b>（インサイダーを見破った）：魔術師 <b>+3</b></div>
          <div><b style={{ color: "#E53935" }}>時間切れ</b>（お題を当てられず）：魔術師 <b>+2</b>／村人チーム <b>−1</b></div>
          <div style={{ color: "#6a6a6a" }}>魔術カードの縛りを破ったら…みんなでツッコむてこ（罰は口頭で）</div>
        </>
      ) : (
        <>
          <div><b style={{ color: "#b8901f" }}>コモン勝利</b>（お題＆犯人を当てた）：コモン・マスター ともに <b>+2</b></div>
          <div><b style={{ color: "#E53935" }}>インサイダー逃げ切り</b>（お題は判明したが犯人を当てられなかった）：インサイダー <b>+3</b></div>
          <div><b style={{ color: "#E53935" }}>時間切れ</b>（お題を当てられず）：マスター0／コモン <b>−1</b>／インサイダー <b>−2</b></div>
          <div style={{ color: "#7a2fa0" }}>フォロワーはインサイダーと運命共同体（逃げ切り <b>+2</b> ／ 時間切れ <b>−2</b>）</div>
          <div style={{ color: "#6a6a6a" }}>平和村：全員が「インサイダーなし」に投票できたら全員 <b>+1</b></div>
        </>
      )}
    </div>
  </div>
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
  const myNameRef = useRef("");
  myNameRef.current = myName;
  const [isMaster, setIsMaster] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [isInsider, setIsInsider] = useState(false);
  const [isFollower, setIsFollower] = useState(false);
  const [soundOn, setSoundOn] = useState(isSound());
  const [guideBack, setGuideBack] = useState("home"); // あそびかたを開く前の画面
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const [roleRevealed, setRoleRevealed] = useState(false);
  const [qInput, setQInput] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [lb, setLb] = useState(null);

  const [fName, setFName] = useState("");
  const [cat, setCat] = useState("おまかせ");
  const [gateOpen, setGateOpen] = useState(null); // null=読込中
  const [hostUnlocked, setHostUnlocked] = useState(false);

  const game = room?.game || "insider";

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
    if (screen === "lobby" || screen === "result" || (screen === "sub" && room?.phase === "result")) {
      loadLeaderboard().then(setLb).catch(() => {});
    }
  }, [screen, room?.scored, room?.round, room?.phase]);

  // 結果ジングル（ラウンドごと1回）
  const resultPlayed = useRef(null);
  useEffect(() => {
    if (screen === "result" && room?.outcome) {
      const key = `${room.round}-${room.outcome}`;
      if (resultPlayed.current !== key) {
        resultPlayed.current = key;
        sfxResult(["commons", "peace_win", "magic_village"].includes(room.outcome));
      }
    }
  }, [screen, room?.outcome, room?.round]);

  // ── 採点（インサイダー）──
  const finalize = useCallback(async (code, data) => {
    if (data.scored) return data;
    const isPeace = !!data.isPeaceVillage;
    const isMagic = !!data.magic;
    const insiderId = isPeace ? null : dec(data.insiderEnc || "");
    const followerId = dec(data.followerEnc || "");
    const delta = {};
    const add = (name, pts) => { delta[name] = (delta[name] || 0) + pts; };
    let outcome;
    let winners = [];

    if (isMagic) {
      // マジカル：マスター＝魔術師 vs 村人チーム（インサイダー＋村人）
      const wizard = data.players.find((p) => p.id === data.masterId);
      const team = data.players.filter((p) => p.id !== data.masterId);
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
      // 平和村ルート
      if (!data.wordGuessed) {
        outcome = "peace_timeout";
      } else {
        const { top } = topVote(data.votes);
        if (top === NONE_ID) {
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
        data.players.forEach((p) => {
          if (p.id === data.masterId) return;
          if (p.id === insiderId || p.id === followerId) add(p.name, -2);
          else add(p.name, -1);
        });
        outcome = "timeout";
      } else {
        const { top } = topVote(data.votes);
        if (top === insiderId) {
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

    await applyLeaderboard(data.players, delta, winners);
    const updated = { ...data, phase: "result", scores: addScores(data.scores, delta), scored: true, outcome };
    await saveRoom(code, updated);
    return updated;
  }, []);

  // ── Firebase リアルタイム購読 ──
  useEffect(() => {
    if (!roomCode) return;
    const unsub = subscribeRoom(roomCode, async (data) => {
      const cur = screenRef.current;
      if (cur === "home" || cur === "lb" || cur === "tutorial" || !data) return;
      // 主催者が部屋をリセットすると、入っていた人は players から消える。
      // そのままでは自分のいないロビーを眺め続けることになるので、ホームへ戻して入り直してもらう。
      if (Array.isArray(data.players) && !data.players.some((p) => p.id === myId)) {
        const prevName = myNameRef.current;
        doReset();
        setFName(prevName || "");
        setErr("部屋がリセットされたてこ。もう一度「はじめる」で入ってね");
        return;
      }
      setIsMaster(data.masterId === myId);
      setIsHost(data.hostId === myId);
      setIsInsider(data.insiderEnc ? dec(data.insiderEnc) === myId : false);
      setIsFollower(data.followerEnc ? dec(data.followerEnc) === myId : false);

      // ── ワードウルフ／ワードジャマーは phase をそのまま各モジュールが描く ──
      if ((data.game || "insider") !== "insider") {
        setRoom(data);
        if (data.phase === "lobby") { if (cur !== "lobby") { setRoleRevealed(false); setS("lobby"); } }
        else if (cur !== "sub") { setRoleRevealed(false); setS("sub"); }
        return;
      }

      if (data.phase === "vote") {
        // 通常：マスターも投票する → 全員ぶん揃ったら開票。マジカル：魔術師1人の指名で開票
        const need = data.magic ? 1 : data.players.length;
        const got = data.magic ? (data.votes?.[data.masterId] ? 1 : 0) : Object.keys(data.votes || {}).length;
        if (got >= need && need > 0 && !data.scored) {
          sfxDrumroll();
          const updated = await finalize(roomCode, data);
          setRoom(updated);
          setS("result");
          return;
        }
      }

      setRoom(data);
      if (data.phase === "lobby" && (cur === "result" || cur === "vote" || cur === "sub" || cur === "game" || cur === "reveal")) {
        setRoleRevealed(false); setS("lobby");
      }
      if (data.phase === "playing" && cur === "lobby") { setRoleRevealed(false); setS("reveal"); }
      if (data.phase === "vote" && (cur === "game" || cur === "reveal")) setS("vote");
      if (data.phase === "result" && cur !== "result") setS("result");
      // 残り時間は全員が startTime から計算する（誰かの端末が止まっても影響しない）
      if (data.phase === "playing") setTimeLeft(calcLeft(data));
    });
    return () => unsub();
  }, [roomCode, myId, finalize]);

  // 各端末が自分で1秒ごとに再計算する（配信に頼らないので、誰かの画面が寝ても止まらない）
  const tlRef = useRef(0);
  tlRef.current = timeLeft;
  const roomRef = useRef(null);
  roomRef.current = room;
  useEffect(() => {
    if (screen !== "game") return;
    const id = setInterval(() => setTimeLeft(calcLeft(roomRef.current)), 1000);
    return () => clearInterval(id);
  }, [screen]);

  // ── actions ──
  const freshRoom = (name, uid = myId) => ({
    game: "insider",
    phase: "lobby", round: 1, peace: false, adult: false, follower: false, magic: false, masterRule: "random",
    hostId: uid, masterId: uid, wordEnc: null,
    insiderEnc: null, followerEnc: null, players: [{ id: uid, name }],
    startTime: null, duration: 300, wordGuessed: false, votes: {}, qa: [], scores: {}, scored: false,
    usedWords: [], isPeaceVillage: false, magicCards: {},
    wolfDuration: 180, usedPairs: [], usedQuestions: [],
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
    setS(data.phase === "lobby" || (data.game || "insider") === "insider" ? "lobby" : "sub");
    setLoading(false);
  };

  const doResetRoom = async () => {
    const name = (myName || fName).trim() || "プレイヤー";
    const data = freshRoom(name);
    await saveRoom(ROOM, data);
    setMyName(name); setRoomCode(ROOM); setRoom(data); setIsMaster(true); setIsHost(true);
    setRoleRevealed(false); setErr(""); setS("lobby");
  };

  const save = async (u) => { await saveRoom(ROOM, u); setRoom(u); };

  const toggleOpt = async (key) => {
    if (!room) return;
    const u = { ...room, [key]: !room[key] };
    // アダルトを切り替えたら現在のお題はリセット（語彙ソースが変わるため）
    if (key === "adult") u.wordEnc = null;
    // マジカルは平和村・フォロワーと排他
    if (key === "magic" && u.magic) { u.peace = false; u.follower = false; }
    if ((key === "peace" || key === "follower") && u[key]) u.magic = false;
    await save(u);
  };

  // ゲームの切り替え（ロビーのみ・部屋主）。お題などラウンド状態はクリア、メンバー・得点は引き継ぐ
  const setGame = async (g) => {
    if (!room || room.phase !== "lobby") return;
    let u = { ...room, game: g, wordEnc: null, insiderEnc: null, followerEnc: null, votes: {}, qa: [], scored: false, outcome: null, isPeaceVillage: false };
    u = resetWolfRound(u); u = resetJammerRound(u);
    await save(u);
  };

  const setDuration = async (sec) => { if (room) await save({ ...room, duration: sec }); };

  const doExtend = async () => {
    if (!room) return;
    setTimeLeft(tlRef.current + 60);
    await setRoomField(ROOM, "duration", (room.duration || 300) + 60); // 全員の計算結果が伸びる
  };

  const setMasterRule = async (rule) => {
    if (!room) return;
    const masterId = rule === "fixed" ? room.hostId : room.masterId;
    await save({ ...room, masterRule: rule, masterId });
  };

  const doGenWord = async () => {
    setErr("");
    const word = pickWord(cat, room?.usedWords || [], !!room?.adult);
    await save({ ...room, wordEnc: enc(word) });
  };

  const doStart = async () => {
    if (!room?.wordEnc) return setErr("お題を決めてね");
    if (room.players.length < 3) return setErr("3人以上ひつようだてこ");
    const nonMasters = room.players.filter((p) => p.id !== room.masterId);
    let followerEnc = null;
    const magic = !!room.magic;
    const isPeaceVillage = !magic && !!room.peace && Math.random() < 0.1; // 平和村は10%
    const insider = isPeaceVillage ? null : nonMasters[Math.floor(Math.random() * nonMasters.length)];
    const insiderEnc = insider ? enc(insider.id) : null;
    // フォロワー：6人以上＆インサイダー在のときだけ、インサイダー以外から1名（マジカル時は無し）
    if (!magic && room.follower && insider && room.players.length >= 6) {
      const pool = nonMasters.filter((p) => p.id !== insider.id);
      if (pool.length) followerEnc = enc(pool[Math.floor(Math.random() * pool.length)].id);
    }
    // マジカル：村人チーム全員に魔術カードを配る
    const magicCards = {};
    if (magic) {
      const cards = dealMagicCards(nonMasters.length);
      nonMasters.forEach((p, i) => { magicCards[p.id] = cards[i]; });
    }
    const u = { ...room, phase: "playing", insiderEnc, followerEnc, isPeaceVillage, magicCards,
      startTime: Date.now(), timeLeft: room.duration || 300, usedWords: [...(room.usedWords || []), dec(room.wordEnc)] };
    await saveRoom(ROOM, u);
    setRoom(u); setIsInsider(false); setIsFollower(false); setTimeLeft(u.duration); setS("reveal");
  };

  // ワードウルフ／ジャマーの開始（部屋主）
  const doStartSub = async () => {
    if (!room) return;
    if (room.players.length < 3) return setErr("3人以上ひつようだてこ");
    setErr("");
    const u = game === "wordwolf" ? startWolfRound(room) : startJammerRound(room);
    await saveRoom(ROOM, u);
    setRoom(u); setRoleRevealed(false); setS("sub");
  };

  const doAsk = async () => {
    if (!qInput.trim() || !room) return;
    const qa = room.qa || [];
    if (qa.length > 0 && isUnanswered(qa[qa.length - 1])) return;
    await save({ ...room, qa: [...qa, { id: genId(), q: qInput.trim(), ans: null, by: myName }] });
    setQInput("");
  };

  const doAnswer = async (ans) => {
    const qa = [...(room?.qa || [])];
    if (!qa.length || !isUnanswered(qa[qa.length - 1])) return;
    qa[qa.length - 1] = { ...qa[qa.length - 1], ans };
    await save({ ...room, qa });
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
    await save({ ...room, votes: { ...room.votes, [myId]: targetId } });
  };

  // 電波不良などで全員の票が揃わないとき、主催者が今ある票で強制開票
  const doForceFinalize = async () => {
    if (!room || room.scored) return;
    sfxDrumroll();
    const u = await finalize(ROOM, room);
    setRoom(u); setS("result");
  };

  // 次のラウンド（全ゲーム共通：ロビーへ戻す）
  const doNextRound = async () => {
    const newMaster = nextMaster(room.players, room.masterId, room.masterRule || "random", room.hostId);
    let u = { ...room, phase: "lobby", round: (room.round || 1) + 1, masterId: newMaster,
      wordEnc: null, insiderEnc: null, followerEnc: null, isPeaceVillage: false, magicCards: {},
      startTime: null, wordGuessed: false, votes: {}, qa: [], scored: false, outcome: null };
    u = resetWolfRound(u); u = resetJammerRound(u);
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
    try { await saveLeaderboard({}); } catch { /* noop */ }
    setLb({});
  };

  const backHome = () => { if (window.confirm("ホームに戻る？（通算成績は消えないよ）")) doReset(); };
  const lbBack = () => setS(roomCode ? (room?.phase === "lobby" ? "lobby" : game === "insider" ? "result" : "sub") : "home");

  // ════ HOME ════
  if (screen === "home") return (
    <Shell>
      <div style={{ textAlign: "center", padding: "20px 0 16px" }}>
        <Logo width={250} />
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 6px" }}><OwlDoc size={96} bob /></div>
        <div className="mp-sub">～みんなでなぞを解け！～</div>
        <div style={{ fontSize: 10, marginTop: 8, color: "#bbb", textShadow: "1px 1px 0 #000", letterSpacing: 1 }}>🕵️ インサイダー ／ 🐺 ワードウルフ ／ 📝 ワードジャマー</div>
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

      <button className="mp-btn mp-yellow" onClick={() => { setGuideBack("home"); setS("tutorial"); }}>📖 あそびかた</button>
      <button className="mp-btn mp-blue" onClick={openLb}>★ つうさんせいせき</button>
      <button className="mp-btn mp-yellow" onClick={toggleSound}>{soundOn ? "🔊 こうかおん ON" : "🔇 こうかおん OFF"}</button>

      <ErrBox>{err}</ErrBox>

      <Bubble arrow>
        ようこそてこ！<br />なまえを入れて「はじめる」を押すてこ。ロビーで インサイダー／ワードウルフ／ワードジャマー を選べるてこ。はじめてなら「あそびかた」を見るといいてこ！
      </Bubble>
    </Shell>
  );

  // ════ TUTORIAL（ビジュアル説明書）════
  if (screen === "tutorial") return <Guide onClose={() => setS(guideBack)} />;

  // ════ LEADERBOARD ════
  if (screen === "lb") {
    const rows = Object.entries(lb || {}).sort((a, b) => b[1].pts - a[1].pts);
    return (
      <Shell>
        <Header sub="つうさんせいせき" onBack={lbBack} />
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
        <button className="mp-btn mp-yellow" onClick={lbBack}>◀ もどる</button>
        <button className="mp-btn mp-red" onClick={doClearLeaderboard} style={{ fontSize: 12 }}>🗑 通算成績をリセット</button>
      </Shell>
    );
  }

  // ════ LOBBY（全ゲーム共通）════
  if (screen === "lobby") {
    const players = room?.players || [];
    const wordSet = !!room?.wordEnc;
    const adult = !!room?.adult;
    const magic = !!room?.magic;
    const flair = computeFlair(players, lb);
    const G = GAMES[game];
    const masterName = players.find((p) => p.id === room?.masterId)?.name || "?";
    const rule = room?.masterRule || "random";
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1}`} onBack={backHome} title={`てこみの ${G.label}`} />

        {/* いま遊ぶゲーム */}
        <div className="mp-panel" style={{ textAlign: "center", padding: 10, borderColor: G.color }}>
          <span style={{ fontSize: 10, color: "#888" }}>いまのゲーム</span>
          <div style={{ fontSize: 18, color: G.color, WebkitTextStroke: "0.4px #000" }}>{G.emoji} {G.label}</div>
          <div style={{ fontSize: 10, color: "#666" }}>{G.desc}</div>
        </div>

        <div className="mp-panel">
          <div className="mp-panel-head">★ プレイヤー {players.length}名 ★</div>
          {players.map((p) => (
            <div key={p.id} className="mp-row" style={{ padding: "6px 2px" }}>
              <span style={{ fontSize: 13, color: game === "insider" && p.id === room?.masterId ? "#E53935" : "#111" }}>
                {flair[p.name] ? flair[p.name] + " " : (game === "insider" && p.id === room?.masterId ? "🎤 " : "・ ")}{p.name}{p.id === myId ? "（あなた）" : ""}
              </span>
              <span style={{ fontSize: 13, color: "#D4AF37" }}>{(room?.scores || {})[p.name] || 0}pt</span>
            </div>
          ))}
          {players.length < G.min && <div style={{ fontSize: 11, color: "#E53935", textAlign: "center", marginTop: 6 }}>あと{G.min - players.length}名でスタートできるてこ</div>}
        </div>

        {isHost && (
          <div className="mp-panel">
            <div className="mp-panel-head">★ ゲームをえらぶ（部屋主） ★</div>
            {Object.entries(GAMES).map(([k, g]) => (
              <ModeCard key={k} on={game === k} color={g.color} emoji={g.emoji} label={g.label} desc={g.desc} onClick={() => setGame(k)} />
            ))}
          </div>
        )}

        {game === "insider" && (
          <>
            <div className="mp-panel" style={{ textAlign: "center", padding: 10 }}>
              <span style={{ fontSize: 10, color: "#888" }}>今回の{magic ? "魔術師" : "マスター"}（{MASTER_RULES[rule].label}）</span>
              <div style={{ fontSize: 18, color: "#E53935", WebkitTextStroke: "0.4px #000" }}>{magic ? "🧙" : "🎤"} {masterName}{room?.masterId === myId ? "（あなた）" : ""}</div>
            </div>

            {isHost && (
              <div className="mp-panel">
                <div className="mp-panel-head">★ ゲーム設定（部屋主） ★</div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 6, letterSpacing: 1 }}>オプション（自由にON/OFF・組み合わせOK）</div>
                {OPTS.map((o) => (
                  <ModeCard key={o.key} on={!!room[o.key]} color={o.color} emoji={o.emoji} label={o.label} desc={o.desc} toggle onClick={() => toggleOpt(o.key)} />
                ))}
                {room.follower && players.length < 6 && !magic && (
                  <div style={{ fontSize: 10, color: "#a020e0", textAlign: "center", marginTop: 2 }}>※フォロワーは6人以上で有効。今は{players.length}人なので未発動</div>
                )}
                {magic && <div style={{ fontSize: 10, color: "#5b8def", textAlign: "center", marginTop: 2 }}>※マジカル中は平和村・フォロワーは使えないてこ</div>}

                <div style={{ fontSize: 10, color: "#888", margin: "12px 0 6px", letterSpacing: 1 }}>{magic ? "魔術師" : "マスター"}の決め方</div>
                {Object.entries(MASTER_RULES).map(([k, r]) => (
                  <ModeCard key={k} on={rule === k} emoji={r.emoji} label={r.label} desc={r.desc} onClick={() => setMasterRule(k)} />
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
                  <div className="mp-panel-head">★ お題をきめる（あなたが{magic ? "魔術師" : "マスター"}） ★</div>
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
                <ErrBox>{err}</ErrBox>
              </>
            ) : (
              <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 12, padding: 22 }}>
                {magic ? "🧙" : "🎤"} {masterName} がお題を準備中…<br />
                <span style={{ fontSize: 11, color: "#D4AF37" }}>モード：{optsSummary(room)}</span><br />
                <span style={{ fontSize: 11 }}>{wordSet ? "お題は準備OK" : "お題をえらび中"}</span>
              </div>
            )}
            <PointsPanel magic={magic} />
          </>
        )}

        {game === "wordwolf" && (
          <WolfSettings room={room} isHost={isHost} save={save} onStart={doStartSub} err={err} />
        )}
        {game === "jammer" && (
          <JammerSettings room={room} isHost={isHost} save={save} onStart={doStartSub} err={err} />
        )}

        <button className="mp-btn mp-yellow" onClick={() => { setGuideBack("lobby"); setS("tutorial"); }}>📖 あそびかた（ルールを見る）</button>
        {isHost && <button className="mp-btn mp-blue" onClick={doResetRoom}>🔄 部屋をリセット</button>}
        <Bubble>
          {game !== "insider"
            ? (isHost ? `${G.label}だてこ！設定を決めて「スタート」を押すてこ` : `今回は${G.label}だてこ。部屋主のスタートを待つてこ🍺`)
            : isMaster ? (magic ? "キミが今回の魔術師！お題を引いてスタートだてこ。村人チームの中のインサイダーを見破るてこ！" : "キミが今回のマスター！お題を引いてスタートだてこ！")
            : isHost ? "設定はキミ（部屋主）が管理てこ。マスターがお題を引くのを待つてこ" : "今回のマスターが準備中てこ。ちょっと待つてこ🍺"}
        </Bubble>
      </Shell>
    );
  }

  // ════ ワードウルフ／ワードジャマー（各モジュールへ委譲）════
  if (screen === "sub") {
    const common = { room, myId, myName, isHost, save, lb, onNextRound: doNextRound, onLeave: doReset, openLb };
    return game === "wordwolf" ? <WolfGame {...common} /> : <JammerGame {...common} />;
  }

  // ── 役職判定（インサイダー）──
  const magic = !!room?.magic;
  let role;
  if (isMaster) role = magic ? "wizard" : "master";
  else if (isFollower) role = "follower";
  else role = isInsider ? "insider" : (magic ? "villager" : "common");
  const knowsWord = ["master", "wizard", "insider"].includes(role);
  const myCard = room?.magicCards?.[myId];
  const insName = room?.players?.find((p) => p.id === dec(room?.insiderEnc || ""))?.name;

  // ════ REVEAL ════
  if (screen === "reveal") {
    const word = dec(room?.wordEnc || "");
    const folName = room?.players?.find((p) => p.id === dec(room?.followerEnc || ""))?.name;
    const roleMeta = {
      master:   { name: "マスター", color: "#D4AF37", desc: "質問に YES / NO で答えるてこ" },
      wizard:   { name: "魔術師", color: "#5b8def", desc: "質問に YES / NO で答え、最後にインサイダーを見破るてこ" },
      insider:  { name: "インサイダー", color: "#E53935", desc: magic ? "村人はキミが誰か知ってる。魔術師にだけバレないように導くてこ" : "正体を隠して、みんなをお題へ導くてこ" },
      common:   { name: "コモン", color: "#D4AF37", desc: "質問でお題を当てて、潜入者を暴くてこ" },
      villager: { name: "村人", color: "#5b8def", desc: "お題は知らない。インサイダーをかばいながらお題を当てるてこ" },
      follower: { name: "フォロワー", color: "#a020e0", desc: "お題は知らないが、インサイダーの味方てこ" },
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
            {(role === "follower" || role === "villager") && insName && (
              <div className="mp-panel" style={{ padding: 12, border: `5px solid ${roleMeta.color}`, marginTop: -2 }}>
                <span style={{ fontSize: 10, color: "#888" }}>{role === "villager" ? "インサイダーは…　" : "味方のインサイダーは…　"}</span>
                <span style={{ fontSize: 18, color: roleMeta.color, WebkitTextStroke: "0.4px #000" }}>{insName}</span>
              </div>
            )}
            {role === "insider" && folName && (
              <div className="mp-panel" style={{ padding: 12, border: "5px solid #a020e0", marginTop: -2 }}>
                <span style={{ fontSize: 10, color: "#888" }}>あなたのフォロワーは…　</span>
                <span style={{ fontSize: 18, color: "#a020e0", WebkitTextStroke: "0.4px #000" }}>{folName}</span>
              </div>
            )}
            {magic && myCard && (
              <div className="mp-panel" style={{ padding: 12, border: "5px solid #5b8def", marginTop: -2, background: "#eef4ff" }}>
                <div style={{ fontSize: 10, color: "#888" }}>🪄 あなたの魔術カード</div>
                <div style={{ fontSize: 20, color: "#5b8def", WebkitTextStroke: "0.4px #000" }}>{myCard.t}</div>
                <div style={{ fontSize: 11, color: "#333" }}>{myCard.d}</div>
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
    const pending = qa.length > 0 && isUnanswered(qa[qa.length - 1]);
    const word = dec(room?.wordEnc || "");
    const roleLabel = { master: "マスター", wizard: "魔術師", insider: "インサイダー", common: "コモン", villager: "村人", follower: "フォロワー" }[role];
    const roleColor = { master: "#D4AF37", wizard: "#5b8def", insider: "#E53935", common: "#D4AF37", villager: "#5b8def", follower: "#a020e0" }[role];
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
        {magic && myCard && (
          <div className="mp-panel" style={{ padding: "8px 12px", marginBottom: 12, background: "#eef4ff", borderColor: "#5b8def" }}>
            <span style={{ fontSize: 10, color: "#888" }}>🪄 魔術カード　</span>
            <span style={{ fontSize: 14, color: "#5b8def", WebkitTextStroke: "0.3px #000" }}>{myCard.t}</span>
            <span style={{ fontSize: 10, color: "#333" }}>　{myCard.d}</span>
          </div>
        )}
        {magic && role === "villager" && insName && (
          <div style={{ fontSize: 10, color: "#bbb", textAlign: "center", marginBottom: 8, textShadow: "1px 1px 0 #000" }}>インサイダーは {insName}。魔術師にバレないようにかばうてこ</div>
        )}

        <div className="mp-panel" style={{ maxHeight: 300, overflowY: "auto" }}>
          <div className="mp-panel-head">★ しつもん記録 {qa.length}件 ★</div>
          {qa.length === 0 && <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: "16px 0" }}>さいしょの質問を待ってるてこ</div>}
          {qa.map((item, i) => (
            <div key={item.id || i} style={{ padding: "9px 0", borderBottom: "2px dashed #ddd" }}>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>{item.by}</div>
              <div style={{ fontSize: 14, color: "#111", marginBottom: 6 }}>{item.q}</div>
              {isUnanswered(item) ? (
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
          <button className="mp-btn mp-green" onClick={doWordGuessed}>{magic ? "✓ お題的中 → インサイダーを指名へ" : "✓ お題的中 → 投票へ"}</button>
          <button className="mp-btn mp-yellow" onClick={doExtend}>⏱ 1分 延長する</button>
          {timeLeft === 0 && <button className="mp-btn mp-red" onClick={doTimeUp}>⏰ 時間切れ → 結果へ</button>}
        </>}
        {!isMaster && timeLeft === 0 && (
          <div style={{ textAlign: "center", color: "#fff", background: "#E53935", border: "2px solid #000", borderRadius: 8, fontSize: 12, padding: 8, marginBottom: 8 }}>時間切れ。{magic ? "魔術師" : "マスター"}の操作を待つてこ</div>
        )}
        {isHost && !isMaster && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 10, color: "#fff", textShadow: "1px 1px 0 #000", textAlign: "center", marginBottom: 4 }}>主催者の強制進行（{magic ? "魔術師" : "マスター"}が反応しない時）</div>
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
    const totalVoters = magic ? 1 : (room?.players || []).length; // 通常はマスター含め全員／マジカルは魔術師のみ
    const myVote = room?.votes?.[myId];
    return (
      <Shell>
        <div style={{ textAlign: "center", padding: "30px 0 22px" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}><OwlDoc size={70} bob expr="suspicious" /></div>
          <div className="mp-title" style={{ fontSize: 22 }}>お題は暴かれた！</div>
          <div style={{ fontSize: 12, marginTop: 8, textShadow: "1px 1px 0 #000" }}>
            {magic ? "魔術師よ、インサイダーを見破れ！" : "潜入者は誰だ。一斉投票せよ！"}
          </div>
          <div style={{ fontSize: 11, marginTop: 8, letterSpacing: 2, textShadow: "1px 1px 0 #000" }}>{voteCount} / {totalVoters} 票</div>
        </div>
        {magic && !isMaster ? (
          <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>🧙 魔術師が推理中…<br /><span style={{ fontSize: 11 }}>ポーカーフェイスで待つてこ</span></div>
        ) : myVote ? (
          <div className="mp-panel" style={{ textAlign: "center", color: "#666", fontSize: 13, padding: 24 }}>✓ 投票完了。開票を待つてこ</div>
        ) : (
          <div className="mp-panel">
            <div className="mp-panel-head">★ インサイダーは誰だ？ ★</div>
            {votable.map((p) => (
              <button key={p.id} className="mp-btn mp-blue" onClick={() => doVote(p.id)}>{p.name}</button>
            ))}
            {room?.peace && !magic && (
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
    const { vc } = topVote(votes);
    const oc = room?.outcome;
    const titleMap = {
      commons: "コモンの勝利！", insider: "インサイダーの勝利！", timeout: "時間切れ — 失敗…",
      peace_win: "平和村 — 村の勝利！", peace_lose: "平和村 — 村の失敗…", peace_timeout: "時間切れ — 失敗…",
      magic_village: "村人チームの勝利！", magic_wizard: "魔術師の勝利！", magic_timeout: "時間切れ — 魔術師の勝利…",
    };
    const title = titleMap[oc] || "結果";
    const tcol = ["commons", "peace_win", "magic_village"].includes(oc) ? "#D4AF37" : "#E53935";
    const flair = computeFlair(room?.players || [], lb);
    return (
      <Shell>
        <Header sub={`ROUND ${room?.round || 1} 結果`} onBack={backHome} />
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
            {magic && oc !== "magic_timeout" && (
              <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>
                魔術師の指名 → <b>{room?.players?.find((p) => p.id === votes[room.masterId])?.name || "（なし）"}</b>
              </div>
            )}
          </div>
        )}

        <ScoreRows players={room?.players || []} scores={room?.scores} myId={myId} flair={flair}
          colorOf={(p) => (!isPeace && p.id === insiderId) ? "#E53935" : p.id === room.masterId ? (magic ? "#5b8def" : "#D4AF37") : "#111"}
          extra={(p) => vc[p.id] ? <span style={{ fontSize: 10, color: "#888" }}>　{vc[p.id]}票</span> : null} />

        {Object.keys(votes).length > 0 && !magic && (
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
