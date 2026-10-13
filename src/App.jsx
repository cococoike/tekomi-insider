import { useState, useEffect, useRef, useContext } from "react";
import { subscribeRoom, saveRoom, setRoomField, updateRoom, loadRoom, transactRoom, loadLeaderboard, saveLeaderboard } from "./lib/db";
import { pickWord, dealMagicCards, categoryOf, ADULT_LEVELS, adultLevelLabel } from "./lib/words";
import { sfxClick, sfxCorrect, sfxDrumroll, sfxResult, sfxReveal, sfxVote } from "./lib/sound";
import { finalizeRound } from "./lib/scoring";
import { genId, ROOM, NONE_ID, enc, dec, computeFlair, scorerOf, TAKEOVER_MS, topVote, sanitizeName } from "./lib/util";
import {
  freshRoom, applyJoin, applyLeave, screenFor, isUnanswered, calcLeft, roleOf, votesComplete, scoreInsider, startInsider, toLobby,
} from "./lib/rules";
import { ROLES, GAMES } from "./lib/roles";
import { device } from "./lib/device";
import { useWakeLock, useNow, useSound, useAction, buzz, MSG_TIMEOUT, MSG_FAIL } from "./lib/hooks";
import { ShotCtx } from "./lib/shotctx";
import { Icon } from "./icons";
import { OwlDoc, RoleChar, Logo, Bubble, Shell, Header, Panel, ErrBox, PlayerRows, Tile, OptRow, Seg, Secret, TimerBar, HostMenu, Fold } from "./ui";
import Guide from "./Guide";
import { WolfOptions, WolfLobby, WolfGame } from "./games/WordWolf";
import { JammerOptions, JammerLobby, JammerGame } from "./games/WordJammer";
import { startWolfRound, startJammerRound } from "./lib/rounds";

const GATE = "__gate__"; // 開閉フラグの保存先（rooms/ 配下なので既存ルールでOK）
const HOST_KEY = "tekomi"; // 主催者キー（開閉できる人だけが知る合言葉。変更可）
const CATS = ["おまかせ", "食べもの", "場所", "モノ", "生きもの", "エンタメ", "しごと・学校", "むずかしめ"];
const OVERLAYS = new Set(["tutorial", "lb"]); // 見ている間もゲームは進む画面

// インサイダーのオプション（独立 ON/OFF。マジカルは役職の形が変わるので平和村・フォロワーとは同時に使わない）
const OPTS = [
  { key: "magic",    label: "マジカル",   icon: "wand",  color: "#3f6fd6", desc: "魔術師 vs 村人チーム。しゃべり方の縛りつき" },
  { key: "peace",    label: "平和村",     icon: "halo",  color: "#8a8a8a", desc: "10%でインサイダーがいない回" },
  { key: "adult",    label: "アダルト",   icon: "chili", color: "#a020e0", desc: "お題がきわどく…身内だけの席で" },
  { key: "follower", label: "フォロワー", icon: "ninja", color: "#7a2fa0", desc: "6人以上で、インサイダーに隠れ味方" },
  { key: "hint",     label: "カテゴリ公開", icon: "book",  color: "#2e9a5f", desc: "お題のカテゴリを全員に見せる（初めての人向け・やさしめ）" },
];
// ロビーで待っている人に出すコツ（ラウンドごとに変わる）
const TIPS = [
  "質問は「はい／いいえ」で答えられる形にするてこ。「どこで使う？」より「家で使う？」てこ",
  "最初は大きく分けるてこ：食べ物？生き物？手に持てる？",
  "やけに鋭い人と、やけに黙っている人。どっちも怪しいてこ",
  "インサイダーは「当てさせたい」。正解に近づく質問を誰が出したか覚えておくてこ",
  "時間切れはみんな損。迷ったら、とにかく質問するてこ",
  "当たった瞬間の「誰がうれしそうか」も手がかりてこ",
  "マスターの答えが「わからない」のときは、質問の言い方を変えるてこ",
];
// 結果画面のてこみんの一言（展開に合わせて変える）
function resultComment(room, players) {
  const oc = room?.outcome;
  const votes = room?.votes || {};
  const insiderId = room?.isPeaceVillage ? null : dec(room?.insiderEnc || "");
  const onInsider = Object.values(votes).filter((v) => v === insiderId).length;
  const n = Object.keys(votes).length;
  const word = dec(room?.wordEnc || "");
  const ins = players.find((p) => p.id === insiderId)?.name || "インサイダー";
  switch (oc) {
    case "commons": return n > 0 && onInsider === n ? `満場一致てこ！ ${ins}、一瞬でバレたてこ…` : onInsider * 2 >= n ? "よく見抜いたてこ！ 鋭い質問が効いたてこ" : "票は割れたけど、ちゃんと見抜いたてこ！";
    case "insider": return onInsider === 0 ? `完全犯罪てこ…！ 誰も ${ins} を疑わなかったてこ` : "票が割れて逃げ切り！ インサイダーは冷や汗てこ";
    case "timeout": return `時間切れ…お題は「${word}」だったてこ。「はい／いいえ」で答えられる質問が近道てこ`;
    case "peace_win": return "インサイダーはいなかった！ 疑いすぎなかったのがえらいてこ";
    case "peace_lose": return "いない犯人を探してしまったてこ…疑心暗鬼てこ";
    case "peace_timeout": return `時間切れ…お題は「${word}」。しかも誰も裏切っていなかったてこ`;
    case "magic_wizard": return "魔術師の目は節穴じゃなかったてこ！ 村人の演技、どこでバレた？";
    case "magic_village": return "村人チームの演技勝ちてこ！ 魔術カードの縛りの中でよくやったてこ";
    case "magic_timeout": return `時間切れ…お題は「${word}」。縛りがきつすぎた？てこ`;
    default: return "";
  }
}
const optsSummary = (r) => {
  const on = [];
  if (r?.magic) on.push("マジカル");
  if (r?.peace && !r?.magic) on.push("平和村");
  if (r?.adult) on.push(`アダルト（${adultLevelLabel(r.adultLevel)}）`);
  if (r?.follower && !r?.magic) on.push("フォロワー");
  if (r?.hint) on.push("ヒント");
  return on.length ? on.join("＋") : "ふつう";
};

const MASTER_RULES = [
  { k: "random", label: "ランダム", icon: "dice" },
  { k: "robin", label: "じゅんぐり", icon: "loop" },
  { k: "fixed", label: "固定", icon: "pin" },
];
const TIMES = [{ k: 300, label: "5分" }, { k: 420, label: "7分" }, { k: 540, label: "9分" }];
// 暗い地の上で読める役職の色
const GLOW = { master: "#D4AF37", insider: "#ff6b5e", common: "#8fb3ff", follower: "#c58cf0", wizard: "#8fb3ff", villager: "#8fb3ff" };

const POINTS = {
  normal: [
    ["コモンの勝ち（お題も犯人も当てた）", ["コモン +2", "マスター +2"]],
    ["インサイダーの逃げ切り（犯人を外した・同票）", ["インサイダー +3", "フォロワー +2"]],
    ["時間切れ（お題が当たらない）", ["コモン −1", "インサイダー −2", "マスター 0"]],
  ],
  magic: [
    ["村人チームの勝ち（指名を外させた）", ["村人 +2", "インサイダー +2"]],
    ["魔術師の勝ち（インサイダーを見破った）", ["魔術師 +3"]],
    ["時間切れ（お題が当たらない）", ["魔術師 +2", "村人 −1"]],
  ],
};
const PointsPanel = ({ magic }) => (
  <Fold head="とくてん（押すと開く）" icon="star">
    {POINTS[magic ? "magic" : "normal"].map(([t, chips]) => (
      <div key={t} className="pt-row">
        <div style={{ fontSize: 14, lineHeight: 1.5 }}>{t}</div>
        <div className="chips-line">{chips.map((c) => <span key={c} className={`chip ${c.includes("−") ? "chip-minus" : c.endsWith(" 0") ? "chip-zero" : "chip-plus"}`}>{c}</span>)}</div>
      </div>
    ))}
  </Fold>
);

export default function TekomiInsider({ shot = null }) {
  const shotCtx = useContext(ShotCtx);
  // 端末ごとの安定ID。同名で入ると既存プレイヤーのIDを引き継ぐ
  const [myId, setMyId] = useState(() => {
    let v = device.get("tekomi_uid");
    if (!v) { v = genId(); device.set("tekomi_uid", v); }
    return v;
  });
  const myIdRef = useRef(myId);
  const [screen, setScreen] = useState("home");
  const screenRef = useRef("home");
  const setS = (s) => { screenRef.current = s; setScreen(s); };

  const [myName, setMyName] = useState("");
  const [fName, setFName] = useState(() => device.get("tekomi_name") || "");
  const [resume, setResume] = useState(null); // この端末が部屋にいれば、その名前（つづきから）
  const [roomCode, setRoomCode] = useState("");
  const [room, setRoom] = useState(null);
  const roomRef = useRef(null);
  const [roleRevealed, setRoleRevealed] = useState(!!shotCtx.revealed);
  const [overlayBack, setOverlayBack] = useState("home");
  const [pick, setPick] = useState(null); // 投票でえらんだ人（決定前）
  const [qInput, setQInput] = useState("");
  const { busy, err, setErr, run } = useAction(); // 通信中・つながらないときの表示
  const [inRoom, setInRoom] = useState(null); // ホームに出す「いま何人いるか」
  const [slow, setSlow] = useState(false); // 読み込みが長引いている
  const [lb, setLb] = useState(null);
  const [cat, setCat] = useState("おまかせ");
  const [customWord, setCustomWord] = useState(""); // マスターが自分で書くお題
  const [gateOpen, setGateOpen] = useState(null); // null=読込中
  const [hostUnlocked, setHostUnlocked] = useState(() => device.get("tekomi_host") === "1");
  const [soundOn, toggleSound] = useSound();
  const [kickMode, setKickMode] = useState(false); // 部屋主：帰った人を外すモード

  const game = room?.game || "insider";
  const players = room?.players || [];
  const isHost = room?.hostId === myId;
  const isMaster = room?.masterId === myId;
  const magic = !!room?.magic;

  // 撮影・確認用に、いまの画面名を body に出しておく（scripts/shots.mjs が待ち合わせに使う）
  useEffect(() => { document.body.dataset.screen = screen; }, [screen]);

  // ゲーム中は画面を消さない
  useWakeLock(!!roomCode);

  // 画面が変わったら「通信の」エラー文は消す（圏外で押した操作が後から通って進んだとき、文が残らない）。
  // 「部屋から外れた」のような、画面が変わるのと同時に出す文は残す
  useEffect(() => { setErr((e) => (e === MSG_TIMEOUT || e === MSG_FAIL ? "" : e)); }, [screen, setErr]);

  // 読み込みが長引いたら、そう伝える（圏外ではないが電波が弱いとき）。表示は gateOpen === null のときだけ
  useEffect(() => {
    if (gateOpen !== null) return undefined;
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, [gateOpen]);

  // 開閉フラグを購読
  useEffect(() => subscribeRoom(GATE, (d) => setGateOpen(!!(d && d.open))), []);

  // すべての<button>クリックでクリック音
  useEffect(() => {
    const h = (e) => { if (e.target.closest && e.target.closest("button")) sfxClick(); };
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, []);

  // この端末がすでに部屋にいるか（リロード・電池切れからの復帰）。ゲーム中なら自動で戻る
  useEffect(() => {
    let alive = true;
    loadRoom(ROOM).then((d) => {
      const me = d?.players?.find((p) => p.id === myIdRef.current);
      if (!alive) return;
      setInRoom(d ? { n: (d.players || []).length, playing: !!d.phase && d.phase !== "lobby" } : null);
      if (!me) { if (shot && OVERLAYS.has(shot.screen)) openOverlay(shot.screen); return; }
      setResume(me.name);
      if ((d.phase && d.phase !== "lobby") || (shot && !shot.stay)) doEnter(me.name);
    }).catch(() => {});
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 部屋の購読。画面は「部屋の進行」から1つに決める（screenFor）
  useEffect(() => {
    if (!roomCode) return undefined;
    const unsub = subscribeRoom(roomCode, (data) => {
      const cur = screenRef.current;
      if (cur === "home") return;
      if (!data || !Array.isArray(data.players) || !data.players.some((p) => p.id === myIdRef.current)) {
        // 部屋がリセットされた／部屋主に外された
        setRoomCode(""); roomRef.current = null; setRoom(null); setRoleRevealed(false); setResume(null);
        setErr("部屋から外れたてこ。もう一度「はじめる」で入れるてこ");
        screenRef.current = "home"; setScreen("home");
        return;
      }
      roomRef.current = data;
      setRoom(data);
      if (OVERLAYS.has(cur)) return; // あそびかた・成績を見ている間は画面を変えない（閉じたときに追いつく）
      const next = screenFor(data, cur);
      if (next !== cur) {
        if (next === "reveal" || next === "lobby") setRoleRevealed(false);
        if (next === "vote") setPick(null);
        screenRef.current = next; setScreen(next);
      }
    });
    return () => unsub();
  }, [roomCode, setErr]);

  // 投票がそろったら開票（採点役＝部屋主がすぐ、寝ていたら他の端末が少し待って肩代わり。二重採点はトランザクションで防ぐ）
  useEffect(() => {
    if (!room || game !== "insider" || room.phase !== "vote" || room.scored || !votesComplete(room)) return undefined;
    const id = setTimeout(() => {
      finalizeRound((cur) => (cur.phase === "vote" && votesComplete(cur) ? scoreInsider(cur) : null)).catch(() => {});
    }, scorerOf(room) === myId ? 0 : TAKEOVER_MS);
    return () => clearTimeout(id);
  }, [room, game, myId]);

  // 開票のドラムロール・結果のジングル（ラウンドごとに1回）
  const played = useRef({});
  useEffect(() => {
    if (!room) return;
    const k = `${room.round}-${room.game}`;
    if (room.phase === "vote" && game === "insider" && votesComplete(room) && played.current.drum !== k) { played.current.drum = k; sfxDrumroll(); }
    if (room.phase === "result" && played.current.result !== k) {
      played.current.result = k;
      const winners = Object.entries(room.lastDelta || {}).filter(([, v]) => v > 0).map(([n]) => n);
      sfxResult(winners.includes(myName));
    }
  }, [room, game, myName]);

  // 通算成績（順位の印）
  useEffect(() => {
    if (screen === "lobby" || room?.phase === "result") loadLeaderboard().then(setLb).catch(() => {});
  }, [screen, room?.phase, room?.round]);

  // インサイダーの残り時間は、開始時刻から各端末が自分で計算する
  const now = useNow(screen === "game");
  const left = calcLeft(room, now);

  // ── 入退室 ──────────────────────────────────────
  async function doEnter(resumeName) {
    const name = sanitizeName(resumeName ?? fName);
    if (!name) return setErr("なまえをいれてね");
    if (!resumeName && !gateOpen && !hostUnlocked) return setErr("いまは開いてないよ。主催者がオープンにするまで待ってね");
    await run(async () => {
      let out = null;
      const res = await transactRoom(ROOM, (cur) => { out = applyJoin(cur, { name, uid: myIdRef.current, asHost: hostUnlocked }); return out.next; });
      if (!out || out.error) { setErr("いまゲーム中…このラウンドが終わってロビーに戻ったら入れるてこ"); return; }
      if (out.uid !== myIdRef.current) { myIdRef.current = out.uid; setMyId(out.uid); device.set("tekomi_uid", out.uid); }
      device.set("tekomi_name", out.name);
      setMyName(out.name); setFName(out.name); setResume(out.name);
      const data = res.value;
      roomRef.current = data; setRoom(data);
      setRoleRevealed(!!shotCtx.revealed);
      let next = screenFor(data, shot?.screen || "home");
      if (shot && OVERLAYS.has(shot.screen)) { setOverlayBack(next); next = shot.screen; if (next === "lb") loadLeaderboard().then(setLb); }
      screenRef.current = next; setScreen(next);
      setRoomCode(ROOM);
    });
  }

  // 自分の画面だけホームへ（部屋には残る。同じ名前で入り直せば戻れる）
  const toHome = () => {
    const nm = myName;
    setRoomCode(""); roomRef.current = null; setRoom(null); setRoleRevealed(false); setQInput(""); setPick(null); setErr("");
    setS("home");
    loadRoom(ROOM).then((d) => {
      setResume(d?.players?.some((p) => p.id === myIdRef.current) ? nm : null);
      setInRoom(d ? { n: (d.players || []).length, playing: !!d.phase && d.phase !== "lobby" } : null);
    }).catch(() => {});
  };
  const goHome = () => {
    if (window.confirm("ホームにもどる？\nゲームは続いているので、「つづきから」でいつでも戻れるてこ")) toHome();
  };
  // ロビーから部屋を抜ける（名前が一覧から消える。同じ名前で入り直せば点数はそのまま）
  const doLeave = async () => {
    if (!window.confirm("部屋から抜けてホームにもどる？\n同じ名前で入り直せば、点数はそのままてこ")) return;
    try { await transactRoom(ROOM, (cur) => applyLeave(cur, myIdRef.current)); } catch { /* 電波不良でもホームへは戻る */ }
    toHome();
  };
  const doKick = async (p) => {
    if (!window.confirm(`「${p.name}」を部屋から外す？\n（帰った人・電波が切れた人をはずす用。同じ名前で入り直せば戻れる）`)) return;
    await run(() => transactRoom(ROOM, (cur) => applyLeave(cur, p.id)));
  };

  const doResetRoom = async () => {
    if (!window.confirm("部屋をリセットする？\n入っている人は全員ホームに戻され、部屋の点数も消えるてこ（通算成績は残る）")) return;
    const name = sanitizeName(myName || fName) || "主催者";
    const data = freshRoom(name, myIdRef.current);
    const ok = await run(async () => { await saveRoom(ROOM, data); return true; });
    if (!ok) return;
    device.set("tekomi_name", name);
    setMyName(name); setFName(name); setResume(name);
    roomRef.current = data; setRoom(data); setRoleRevealed(false); setErr("");
    setS("lobby"); setRoomCode(ROOM);
  };

  const setGate = (open) => run(async () => { await saveRoom(GATE, { open }); setGateOpen(open); });
  const tryHostUnlock = () => {
    const k = window.prompt("主催者キーを入力してね");
    if (k === null) return;
    if (k === HOST_KEY) { setHostUnlocked(true); device.set("tekomi_host", "1"); }
    else window.alert("キーがちがうよ");
  };

  const openOverlay = async (s) => {
    setOverlayBack(screenRef.current);
    if (s === "lb") setLb(await loadLeaderboard().catch(() => ({})));
    setS(s);
  };
  const closeOverlay = () => setS(roomCode && roomRef.current ? screenFor(roomRef.current, overlayBack) : "home");

  const doClearLeaderboard = async () => {
    if (!window.confirm("通算成績を全部消すよ？（全員ぶん・元に戻せない）")) return;
    const ok = await run(async () => { await saveLeaderboard({}); return true; });
    if (ok) setLb({});
  };

  // ── ロビーの設定（部屋主）。変える項目だけ書く＝同時に入ってきた人を消さない ──
  const toggleOpt = (key) => {
    if (!room) return;
    const patch = { [key]: !room[key] };
    if (key === "adult") patch.wordEnc = null; // 語彙が変わるので、引いたお題は引き直し
    if (key === "magic" && patch.magic) { patch.peace = false; patch.follower = false; }
    if ((key === "peace" || key === "follower") && patch[key]) patch.magic = false;
    updateRoom(ROOM, patch);
  };
  const setGame = (g) => {
    if (!room || room.phase !== "lobby" || room.game === g) return;
    updateRoom(ROOM, { game: g, wordEnc: null, wolf: null, wolfEndAt: null, jam: null, votes: null, qa: null, scored: false, outcome: null });
  };
  const setMasterRule = (rule) => {
    if (!room) return;
    updateRoom(ROOM, { masterRule: rule, ...(rule === "fixed" ? { masterId: room.hostId } : {}) });
  };

  // ── インサイダーの進行 ──────────────────────────────
  const doGenWord = () => {
    const w = pickWord(cat, room?.usedWords || [], !!room?.adult);
    updateRoom(ROOM, { wordEnc: enc(w), wordCat: categoryOf(w) }); // wordCat は「カテゴリ公開」のヒント用（秘密ではない）
  };
  // 自由お題：マスターが好きなお題を書く（ヒントのカテゴリは「自由お題」）
  const doCustomWord = () => {
    const w = customWord.trim().replace(/\s+/g, " ").slice(0, 20);
    if (!w) return;
    run(() => updateRoom(ROOM, { wordEnc: enc(w), wordCat: "自由お題" }));
    setCustomWord("");
  };
  // エロ度（部屋主がラウンドごとに選ぶ）。語彙が変わるので、引いたお題は引き直し
  const setAdultLevel = (lv) => updateRoom(ROOM, { adultLevel: lv, ...(game === "insider" ? { wordEnc: null } : {}) });
  // どの操作も run() を通す：押している間は busy、8秒返ってこなければ「電波を確かめて」と出る
  const doStart = async () => {
    const res = await run(() => transactRoom(ROOM, (cur) => startInsider(cur, { deal: dealMagicCards })));
    if (res && !res.committed) setErr("始められなかったてこ（お題と3人以上が必要）");
  };
  const doStartSub = async () => {
    const res = await run(() => transactRoom(ROOM, (cur) => {
      if (!cur || cur.phase !== "lobby" || (cur.players || []).length < 3) return undefined;
      return (cur.game || "insider") === "wordwolf" ? startWolfRound(cur) : startJammerRound(cur);
    }));
    if (res && !res.committed) setErr("始められなかったてこ（3人以上が必要）");
  };
  const doAsk = async () => {
    const q = qInput.trim();
    if (!q) return;
    const res = await run(() => transactRoom(ROOM, (cur) => {
      if (!cur || cur.phase !== "playing") return undefined;
      const qa = cur.qa || [];
      if (qa.length && isUnanswered(qa[qa.length - 1])) return undefined; // 1問ずつ
      return { ...cur, qa: [...qa, { id: genId(), q: q.slice(0, 60), by: myName }] };
    }));
    if (res?.committed) setQInput("");
  };
  const doAnswer = (i, ans) => run(() => setRoomField(ROOM, `qa/${i}/ans`, ans));
  const doWordGuessed = async () => {
    // 押し間違いで投票へ飛ぶと戻せない（ラウンド中止しかない）ので、ひと言たしかめる
    if (!window.confirm("お題が当たった？\n「OK」で投票へ進むてこ")) return;
    const res = await run(() => transactRoom(ROOM, (cur) => (cur?.phase === "playing" ? { ...cur, phase: "vote", wordGuessed: true, votes: null } : undefined)));
    if (res?.committed) sfxCorrect();
  };
  const doExtend = () => run(() => transactRoom(ROOM, (cur) => (cur?.phase === "playing" ? { ...cur, duration: (cur.duration || 300) + 60 } : undefined)));
  const doTimeUp = () => run(() => finalizeRound((cur) => (cur.phase === "playing"
    ? { ...scoreInsider({ ...cur, wordGuessed: false }), patch: { wordGuessed: false } } : null)));
  const doVote = async (targetId) => {
    if (!targetId || room?.votes?.[myId]) return;
    sfxVote(); buzz(40);
    await run(() => setRoomField(ROOM, `votes/${myId}`, targetId)); // 自分の票だけ書く（他人の票を消さない）
  };
  const doForceFinalize = () => run(() => finalizeRound((cur) => (cur.phase === "vote" ? scoreInsider(cur) : null)));
  const doNextRound = () => run(() => transactRoom(ROOM, (cur) => (cur?.phase === "result" ? toLobby(cur) : undefined)));
  const doAbort = () => {
    if (!window.confirm("このラウンドを中止してロビーにもどる？（点数は入らない）")) return;
    run(() => transactRoom(ROOM, (cur) => (cur && cur.phase !== "lobby" ? toLobby(cur) : undefined)));
  };

  // ════ HOME ════
  if (screen === "home") return (
    <Shell>
      <div className="center" style={{ padding: "16px 0 8px" }}>
        <Logo />
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0 4px" }}><OwlDoc size={96} bob /></div>
        <div className="mp-sub">～みんなでなぞを解け！～</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 12, fontSize: 13, color: "#ddd", textShadow: "1px 1px 0 #000" }}>
          {Object.values(GAMES).map((g) => <span key={g.icon} style={{ display: "flex", alignItems: "center", gap: 5 }}><Icon name={g.icon} size={24} />{g.short}</span>)}
        </div>
      </div>

      {resume && (
        <button className="btn btn-gold pop" onClick={() => doEnter(resume)} disabled={busy} style={{ marginTop: 10 }}>
          <Icon name="arrowR" size={24} />「{resume}」でつづきから
        </button>
      )}

      {gateOpen === null ? (
        <Panel><div className="panel-note center" style={{ padding: 10 }}>…よみこみ中…{slow && gateOpen === null && <><br />つながるのに時間がかかっているてこ。電波を確かめてね</>}</div></Panel>
      ) : (gateOpen || hostUnlocked) ? (
        <Panel>
          <input className="mp-input" placeholder="あなたのなまえ（10文字まで）" value={fName} maxLength={10} enterKeyHint="go"
            onChange={(e) => setFName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doEnter(); }} />
          <button className={`btn ${resume ? "btn-cream" : "btn-gold"}`} onClick={() => doEnter()} disabled={busy} style={{ marginBottom: 0 }}>
            <Icon name="arrowR" size={24} />{busy ? "通信中…" : resume ? "この名前ではじめる" : "はじめる"}
          </button>
          {inRoom && inRoom.n > 0 && !resume && (
            <div className="panel-note center" style={{ marginTop: 10 }}>
              いま部屋に <b style={{ color: "#7d5f10" }}>{inRoom.n}人</b>{inRoom.playing ? "（ゲーム中。ロビーに戻ったら入れるてこ）" : "いるてこ"}
            </div>
          )}
          {hostUnlocked && !gateOpen && <div className="panel-note center" style={{ marginTop: 10, color: "#c62828" }}>いまはクローズ中。下の「オープンにする」でみんなが入れるてこ</div>}
        </Panel>
      ) : (
        <Panel>
          <div className="center" style={{ padding: "6px 0" }}>
            <div style={{ display: "flex", justifyContent: "center" }}><Icon name="lock" size={48} /></div>
            <div style={{ fontSize: 17, margin: "8px 0 4px" }}>いまは閉まっています</div>
            <div className="panel-note">主催者がオープンにするまで待ってね</div>
          </div>
        </Panel>
      )}

      <ErrBox>{err}</ErrBox>

      <div className="btn-row">
        <button className="btn btn-cream btn-col" onClick={() => openOverlay("tutorial")}><Icon name="book" size={36} />あそびかた</button>
        <button className="btn btn-cream btn-col" onClick={() => openOverlay("lb")}><Icon name="trophy" size={36} />せいせき</button>
        <button className="btn btn-cream btn-col" onClick={toggleSound}><Icon name={soundOn ? "sound" : "mute"} size={36} />{soundOn ? "音 ON" : "音 OFF"}</button>
      </div>

      {hostUnlocked ? (
        <Panel head="主催者メニュー" icon="key">
          {gateOpen
            ? <button className="btn btn-red btn-sm" onClick={() => setGate(false)} disabled={busy}><Icon name="lock" size={24} />クローズする（締め切る）</button>
            : <button className="btn btn-gold btn-sm" onClick={() => setGate(true)} disabled={busy}><Icon name="unlock" size={24} />オープンにする（みんな入れる）</button>}
          <button className="btn btn-dark btn-sm" onClick={doResetRoom} style={{ marginBottom: 0 }}><Icon name="refresh" size={24} />部屋をリセットして新しく始める</button>
        </Panel>
      ) : (
        <button className="btn btn-dark btn-sm" onClick={tryHostUnlock}><Icon name="key" size={24} />主催者メニュー</button>
      )}

      <Bubble arrow>
        ようこそてこ！<br />なまえを入れて「はじめる」を押すてこ。ロビーで インサイダー／ワードウルフ／ワードジャマー を選べるてこ。はじめてなら「あそびかた」を見るといいてこ！
      </Bubble>
    </Shell>
  );

  // ════ あそびかた ════
  if (screen === "tutorial") return <Guide onClose={closeOverlay} initialTab={shot?.guideTab} />;

  // ════ 通算成績 ════
  if (screen === "lb") {
    const rows = Object.entries(lb || {}).sort((a, b) => b[1].pts - a[1].pts);
    const spread = rows.length > 1 && rows[0][1].pts > rows[rows.length - 1][1].pts;
    const top = rows[0]?.[1].pts, bottom = rows[rows.length - 1]?.[1].pts;
    return (
      <Shell>
        <Header title="つうさんせいせき" icon="trophy" onHome={closeOverlay} />
        <Panel head="名前ごとの通算" icon="trophy">
          {rows.length === 0 && <div className="panel-note center" style={{ padding: "14px 0" }}>まだ記録がないてこ</div>}
          {rows.map(([name, e], i) => (
            <div key={name} className="prow">
              <span style={{ width: 28, fontSize: 20, color: i === 0 ? "#c62828" : "#777", textAlign: "center" }}>{i + 1}</span>
              <span className="prow-mark">{spread && e.pts === top ? <Icon name="crown" size={24} /> : spread && e.pts === bottom ? <Icon name="poop" size={24} /> : null}</span>
              <span className="prow-nm">{name}</span>
              <span className="prow-note">{e.wins}勝／{e.games}戦</span>
              <span className="prow-pt">{e.pts}<small>pt</small></span>
            </div>
          ))}
        </Panel>
        <button className="btn btn-cream" onClick={closeOverlay}><Icon name="arrowL" size={24} />もどる</button>
        {hostUnlocked && <button className="btn btn-dark btn-sm" onClick={doClearLeaderboard}><Icon name="trash" size={24} />通算成績をリセット（主催者）</button>}
      </Shell>
    );
  }

  // ════ ロビー（全ゲーム共通）════
  // 並び：人 → このラウンドの操作（お題・スタート）→ ゲームと設定（2ラウンド目からは折りたたみ）→ とくてん → あそびかた
  if (screen === "lobby") {
    const G = GAMES[game];
    const flair = computeFlair(players, lb);
    const wordSet = !!room?.wordEnc;
    const masterName = players.find((p) => p.id === room?.masterId)?.name || "?";
    const rule = room?.masterRule || "random";
    const round = room?.round || 1;
    const who = magic ? "魔術師" : "マスター";
    const summary = game === "insider"
      ? `${G.short}・${optsSummary(room)}・${(room?.duration || 300) / 60}分・${MASTER_RULES.find((r) => r.k === rule)?.label || ""}`
      : game === "wordwolf"
        ? `${G.short}・話し合い${(room?.wolfDuration || 180) / 60}分${room?.adult ? `・アダルト（${adultLevelLabel(room.adultLevel)}）` : ""}`
        : `${G.short}${room?.adult ? `・アダルト（${adultLevelLabel(room.adultLevel)}）` : ""}`;
    return (
      <Shell>
        <Header title={G.label} icon={G.icon} sub={`ROUND ${round}`} onHome={doLeave} />

        <Panel head={`プレイヤー ${players.length}人`} icon="people">
          <PlayerRows players={players} scores={room?.scores} myId={myId}
            mark={(p) => flair[p.name] || (game === "insider" && p.id === room?.masterId ? (magic ? "wizard" : "mic") : null)}
            note={(p) => (p.id === room?.hostId ? <span className="prow-note">部屋主</span> : null)}
            onKick={isHost && kickMode ? doKick : undefined} />
          {players.length < G.min && <div className="panel-note center" style={{ color: "#c62828", marginTop: 8 }}>あと{G.min - players.length}人でスタートできるてこ</div>}
          {game === "insider" && (
            <div className="note-bar" style={{ background: "#fff", margin: "10px 0 0", justifyContent: "flex-start", textAlign: "left", fontSize: 14 }}>
              <Icon name={magic ? "wizard" : "mic"} size={24} />
              <span>今回の{who}：<b style={{ color: "#c62828", fontSize: 16 }}>{masterName}</b>{room?.masterId === myId ? "（あなた）" : ""}
                <br /><span className="small">決め方：{MASTER_RULES.find((r) => r.k === rule)?.label}{room?.masterId !== myId ? (wordSet ? "・お題は準備OK" : "・お題をえらび中") : ""}</span></span>
            </div>
          )}
          {isHost && players.length > 1 && (
            <button className="btn btn-cream btn-sm" onClick={() => setKickMode((k) => !k)} style={{ margin: "12px 0 0" }}>
              <Icon name="cross" size={24} />{kickMode ? "外すのをやめる" : "帰った人を外す"}
            </button>
          )}
        </Panel>

        {/* ── このラウンドの操作 ── */}
        {game === "insider" && (isMaster ? (
          <>
            <Panel head={`お題をきめる（あなたが${who}）`} icon={magic ? "wizard" : "mic"}>
              {room?.adult
                ? <div className="panel-note center" style={{ color: "#8a1fc2", marginBottom: 10 }}>アダルト（{adultLevelLabel(room.adultLevel)}）のお題から出るてこ</div>
                : <div className="chips">{CATS.map((c) => <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>{c}</button>)}</div>}
              <button className="btn btn-cream btn-sm" onClick={doGenWord}><Icon name="dice" size={24} />{wordSet ? "お題を引き直す" : "お題をひく"}</button>
              <div className="label">または、自分でお題を書く（まわりに見せない）</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input className="mp-input" style={{ marginBottom: 0, flex: 1 }} placeholder="好きなお題（20文字まで）" value={customWord} maxLength={20}
                  enterKeyHint="done" autoComplete="off" onChange={(e) => setCustomWord(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doCustomWord(); }} />
                <button className="btn btn-gold btn-sm" style={{ width: "auto", padding: "0 14px", marginBottom: 0 }} onClick={doCustomWord} disabled={!customWord.trim() || busy}>決定</button>
              </div>
              {wordSet && (
                <Secret label="引いたお題" hint="押しているあいだだけ見える（まわりに見せない）">
                  <div className="center" style={{ fontSize: 26, color: "#c62828" }}>「{dec(room.wordEnc)}」</div>
                </Secret>
              )}
            </Panel>
            <button className="btn btn-red" onClick={doStart} disabled={!wordSet || players.length < 3 || busy}>
              <Icon name="arrowR" size={24} />{busy ? "通信中…" : players.length < 3 ? `あと${3 - players.length}人` : !wordSet ? "お題をひいてね" : "ゲームスタート！"}
            </button>
            <ErrBox>{err}</ErrBox>
          </>
        ) : (
          <div className="note-bar note-dark"><span>モード：{optsSummary(room)} ／ {who}のスタートを待つてこ</span></div>
        ))}
        {game === "wordwolf" && <WolfLobby room={room} isHost={isHost} onStart={doStartSub} err={err} busy={busy} />}
        {game === "jammer" && <JammerLobby room={room} isHost={isHost} onStart={doStartSub} err={err} busy={busy} />}

        {/* ── エロ度（部屋主・アダルトONのとき）。ラウンドごとに変えるので、たたまずに出しておく ── */}
        {isHost && room?.adult && (
          <Panel head="エロ度（このラウンド）" icon="chili" headStyle={{ background: "linear-gradient(180deg,#e29bff,#a020e0)", color: "#fff" }}>
            <Seg items={ADULT_LEVELS} value={room.adultLevel ?? "mix"} onChange={setAdultLevel} />
            <div className="panel-note center" style={{ marginTop: 8 }}>ほんのり＝恋愛・ドキッ／きわどい＝体・下着・夜の店／どエロ＝行為・プレイ</div>
          </Panel>
        )}

        {/* ── ゲームと設定（部屋主）。1ラウンド目は開いておき、2ラウンド目からは閉じて要約だけ ── */}
        {isHost && (
          <Fold head="ゲームと設定（部屋主）" icon="key" open={round === 1} note={summary}>
            <div className="label">あそぶゲーム</div>
            <div className="tiles">
              {Object.entries(GAMES).map(([k, g]) => <Tile key={k} on={game === k} color={g.color} icon={g.icon} label={g.short} onClick={() => setGame(k)} />)}
            </div>
            <div className="panel-note center" style={{ marginTop: 8 }}>{G.desc}</div>
            {game === "insider" && (
              <>
                <div className="label">オプション</div>
                {OPTS.map((o) => <OptRow key={o.key} on={!!room[o.key]} color={o.color} icon={o.icon} label={o.label} desc={o.desc} onClick={() => toggleOpt(o.key)} />)}
                {room.follower && players.length < 6 && !magic && <div className="panel-note center">フォロワーは6人以上で有効（いまは{players.length}人）</div>}
                {magic && <div className="panel-note center">マジカル中は 平和村・フォロワー は使えないてこ</div>}
                <div className="label">{who}の決め方</div>
                <Seg items={MASTER_RULES} value={rule} onChange={setMasterRule} />
                <div className="label">せいげん時間</div>
                <Seg items={TIMES} value={room.duration || 300} onChange={(sec) => updateRoom(ROOM, { duration: sec })} />
              </>
            )}
            {game === "wordwolf" && <WolfOptions room={room} />}
            {game === "jammer" && <JammerOptions room={room} />}
          </Fold>
        )}

        {game === "insider" && <PointsPanel magic={magic} />}
        <button className="btn btn-cream btn-sm" onClick={() => openOverlay("tutorial")}><Icon name="book" size={24} />あそびかた（ルールを見る）</button>
        {isHost && <HostMenu><button className="btn btn-dark btn-sm" onClick={doResetRoom}><Icon name="refresh" size={24} />部屋をリセット（全員ホームへ）</button></HostMenu>}
        <Bubble>
          {game !== "insider"
            ? (isHost ? `${G.label}だてこ！ 設定を決めて「スタート」を押すてこ` : `今回は${G.label}だてこ。部屋主のスタートを待つてこ`)
            : isMaster ? (magic ? "キミが今回の魔術師！ お題を引いてスタートだてこ。村人チームの中のインサイダーを見破るてこ！" : "キミが今回のマスター！ お題を引いてスタートだてこ！")
            : isHost ? "設定はキミ（部屋主）が決めるてこ。帰った人は × で外せるてこ" : `今回のマスターが準備中てこ。コツ：${TIPS[(round + players.length) % TIPS.length]}`}
        </Bubble>
      </Shell>
    );
  }

  // ════ ワードウルフ／ワードジャマー（各モジュールへ）════
  if (screen === "sub") {
    const common = { room, myId, myName, isHost, lb, onHome: goHome, onAbort: doAbort, onNextRound: doNextRound, openLb: () => openOverlay("lb") };
    return game === "wordwolf" ? <WolfGame {...common} /> : <JammerGame {...common} />;
  }

  // ── インサイダーの役職 ──
  const role = roleOf(room, myId);
  const R = ROLES[role];
  const knowsWord = ["master", "wizard", "insider"].includes(role);
  const word = dec(room?.wordEnc || "");
  const myCard = room?.magicCards?.[myId];
  const insName = players.find((p) => p.id === dec(room?.insiderEnc || ""))?.name;
  const folName = players.find((p) => p.id === dec(room?.followerEnc || ""))?.name;
  const hdr = <Header title={magic ? "マジカル" : "インサイダー"} icon={magic ? "wand" : "eye"} sub={`ROUND ${room?.round || 1}`} onHome={goHome} />;

  // 役とお題（役職配りと、ゲーム中の「押して見る」カードで共用）
  const roleCard = (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <RoleChar role={role} size={48} bob={false} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, color: R.color }}>{R.name}</div>
          <div className="small" style={{ lineHeight: 1.5 }}>{R.desc}</div>
        </div>
      </div>
      <div className="center" style={{ margin: "12px 0 4px", fontSize: knowsWord ? 28 : 16, color: knowsWord ? "#c62828" : "#666" }}>
        {knowsWord ? `「${word}」` : "お題はナイショ（知らない役）"}
      </div>
      {(role === "follower" || role === "villager") && insName && (
        <div className="center" style={{ fontSize: 15 }}>インサイダーは <b style={{ color: "#c62828", fontSize: 18 }}>{insName}</b></div>
      )}
      {role === "insider" && folName && <div className="center" style={{ fontSize: 15 }}>あなたのフォロワーは <b style={{ color: "#7a2fa0", fontSize: 18 }}>{folName}</b></div>}
    </>
  );

  // ════ 役職配り ════
  if (screen === "reveal") return (
    <Shell>
      {hdr}
      {!roleRevealed ? (
        <div className="center" style={{ paddingTop: 24 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}><OwlDoc size={96} bob expr="surprised" /></div>
          <div className="mp-title" style={{ fontSize: 24 }}>{myName} へ</div>
          <div className="mp-lead" style={{ margin: "12px 0 26px" }}>役職をくばるてこ。<br />まわりに見られないようにてこ！</div>
          <button className="btn btn-red" onClick={() => { setRoleRevealed(true); sfxReveal(); buzz(60); }}><Icon name="eye" size={24} />開封する</button>
        </div>
      ) : (
        <div className="flip">
          <div className="center" style={{ display: "flex", justifyContent: "center", margin: "8px 0 6px" }}><RoleChar role={role} size={96} /></div>
          <div className="mp-title" style={{ fontSize: 32, color: GLOW[role] }}>{R.name}</div>
          <div className="mp-lead" style={{ margin: "6px 0 16px" }}>{R.desc}</div>
          <Panel head="お題">
            <div className="center" style={{ fontSize: knowsWord ? 32 : 17, color: knowsWord ? "#c62828" : "#666", padding: "4px 0" }}>
              {knowsWord ? `「${word}」` : "あなたはお題を知らない役てこ"}
            </div>
            {(role === "follower" || role === "villager") && insName && (
              <div className="center" style={{ marginTop: 8, fontSize: 16 }}>{role === "villager" ? "インサイダーは" : "味方のインサイダーは"} <b style={{ color: "#c62828", fontSize: 20 }}>{insName}</b></div>
            )}
            {role === "insider" && folName && <div className="center" style={{ marginTop: 8, fontSize: 16 }}>あなたのフォロワーは <b style={{ color: "#7a2fa0", fontSize: 20 }}>{folName}</b></div>}
          </Panel>
          {magic && myCard && (
            <Panel head="あなたの魔術カード" icon="wand" style={{ borderColor: "#5b8def" }}>
              <div className="center" style={{ fontSize: 22, color: "#2f5fc4" }}>{myCard.t}</div>
              <div className="center" style={{ fontSize: 15, marginTop: 4 }}>{myCard.d}</div>
            </Panel>
          )}
          {room?.hint && room?.wordCat && !knowsWord && (
            <div className="note-bar" style={{ background: "#fff", color: "#1a1a1a" }}><Icon name="book" size={24} />ヒント：お題のカテゴリは「{room.wordCat}」</div>
          )}
          <button className="btn btn-gold" onClick={() => setS("game")}><Icon name="check" size={24} />おぼえた！ スタート</button>
          <div className="mp-lead" style={{ fontSize: 13, color: "#bbb" }}>ここからは、押しているあいだだけ表示するてこ</div>
        </div>
      )}
    </Shell>
  );

  // ════ ゲーム（質問タイム）════
  if (screen === "game") {
    const qa = room?.qa || [];
    const lastI = qa.length - 1;
    const pending = lastI >= 0 && isUnanswered(qa[lastI]) ? qa[lastI] : null;
    return (
      <Shell>
        {hdr}
        <ErrBox>{err}</ErrBox>
        <TimerBar left={left} total={room?.duration || 300} keeper={isMaster} labelL="のこり時間" labelR={optsSummary(room)} />
        <Secret>{roleCard}</Secret>
        {room?.hint && room?.wordCat && (
          <div className="note-bar" style={{ background: "#fff", color: "#1a1a1a" }}><Icon name="book" size={24} />ヒント：お題のカテゴリは「{room.wordCat}」</div>
        )}
        {magic && myCard && (
          <div className="note-bar note-dark" style={{ justifyContent: "flex-start", textAlign: "left" }}>
            <Icon name="wand" size={24} /><span><b>魔術カード「{myCard.t}」</b><br />{myCard.d}</span>
          </div>
        )}

        {isMaster && pending && (
          <Panel head={`${pending.by} の質問`} icon="question" className="pop">
            <div className="center" style={{ fontSize: 20, margin: "2px 0 12px", lineHeight: 1.5 }}>{pending.q}</div>
            <div className="btn-row" style={{ marginBottom: 0 }}>
              <button className="btn btn-gold" onClick={() => doAnswer(lastI, "YES")}>YES</button>
              <button className="btn btn-red" onClick={() => doAnswer(lastI, "NO")}>NO</button>
              <button className="btn btn-dark" onClick={() => doAnswer(lastI, "？")} style={{ fontSize: 14, padding: "10px 4px" }}>わからない</button>
            </div>
          </Panel>
        )}
        {isMaster && (
          <>
            <button className="btn btn-gold" onClick={doWordGuessed} disabled={busy}><Icon name="check" size={24} />お題的中！ → {magic ? "インサイダーを指名" : "投票へ"}</button>
            <div className="btn-row">
              <button className="btn btn-cream btn-sm" onClick={doExtend} disabled={busy}><Icon name="clock" size={24} />1分のばす</button>
              {left === 0 && <button className="btn btn-red btn-sm" onClick={doTimeUp} disabled={busy}><Icon name="hourglass" size={24} />時間切れで終了</button>}
            </div>
          </>
        )}
        {!isMaster && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="mp-input" style={{ marginBottom: 0, flex: 1 }} placeholder={pending ? "回答待ち…" : "質問を書く（例：食べられる？）"}
              value={qInput} maxLength={60} enterKeyHint="send" onChange={(e) => setQInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !pending) doAsk(); }} disabled={!!pending} />
            <button className="btn btn-gold btn-sm" style={{ width: "auto", padding: "0 16px", marginBottom: 0 }} onClick={doAsk} disabled={!!pending || !qInput.trim() || busy}>送る</button>
          </div>
        )}
        {!isMaster && left === 0 && <div className="note-bar note-red"><Icon name="hourglass" size={24} />時間切れ！ {magic ? "魔術師" : "マスター"}の判定を待つてこ</div>}

        <Panel head={`しつもん記録 ${qa.length}件`} icon="memo">
          {qa.length === 0 && <div className="panel-note center">口で質問してもOK。ここに書くと記録が残るてこ</div>}
          {[...qa].map((item, i) => ({ item, i })).reverse().map(({ item, i }) => (
            <div key={item.id || i} style={{ padding: "8px 0", borderBottom: "2px dashed #d9d2bf", display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small">{item.by}</div>
                <div style={{ fontSize: 16, lineHeight: 1.5 }}>{item.q}</div>
              </div>
              {isUnanswered(item)
                ? <span className="chip chip-zero">回答待ち</span>
                : <span className={`chip ${item.ans === "YES" ? "chip-plus" : item.ans === "NO" ? "chip-minus" : "chip-zero"}`}>{item.ans === "？" ? "わからない" : item.ans}</span>}
            </div>
          ))}
        </Panel>

        {isHost && (
          <HostMenu note={isMaster ? "困ったときだけ使う" : `${magic ? "魔術師" : "マスター"}の電波が切れた・反応しない時だけ使う`}>
            {!isMaster && <button className="btn btn-red btn-sm" onClick={doWordGuessed}>強制で投票へ（お題的中あつかい）</button>}
            {!isMaster && <button className="btn btn-red btn-sm" onClick={() => { if (window.confirm("時間切れで終わらせる？（点数が入る）")) doTimeUp(); }}>強制で時間切れ</button>}
            <button className="btn btn-dark btn-sm" onClick={doAbort}>ラウンド中止（点数なし・ロビーへ）</button>
          </HostMenu>
        )}
      </Shell>
    );
  }

  // ════ 投票 ════
  if (screen === "vote") {
    const votes = room?.votes || {};
    const votable = players.filter((p) => p.id !== room?.masterId && p.id !== myId);
    const voters = magic ? players.filter((p) => p.id === room?.masterId) : players;
    const voteCount = voters.filter((p) => votes[p.id]).length;
    const waiting = voters.filter((p) => !votes[p.id]).map((p) => p.name);
    const myVote = votes[myId];
    const nameOf = (id) => (id === NONE_ID ? "インサイダーはいない" : players.find((p) => p.id === id)?.name || "?");
    return (
      <Shell>
        {hdr}
        <div className="center" style={{ paddingTop: 4 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><OwlDoc size={72} bob expr="suspicious" /></div>
          <div className="mp-title" style={{ fontSize: 26 }}>お題は暴かれた！</div>
          <div className="mp-lead" style={{ margin: "6px 0 14px" }}>{magic ? "魔術師よ、インサイダーを見破れ！" : "インサイダーは誰だ？ 全員で投票！"}</div>
        </div>
        <ErrBox>{err}</ErrBox>
        <div className="note-bar note-dark"><Icon name="people" size={24} />{voteCount} / {voters.length} 人が投票{waiting.length > 0 && voteCount > 0 ? `（まだ：${waiting.join("・")}）` : ""}</div>

        {magic && !isMaster ? (
          <Panel><div className="center" style={{ padding: 10 }}><div style={{ display: "flex", justifyContent: "center" }}><Icon name="wizard" size={48} /></div><div style={{ fontSize: 17, marginTop: 8 }}>魔術師が推理中…</div><div className="panel-note">ポーカーフェイスで待つてこ</div></div></Panel>
        ) : myVote ? (
          <Panel><div className="center" style={{ padding: 8 }}><div className="small">あなたの投票</div><div style={{ fontSize: 22, margin: "4px 0" }}>{nameOf(myVote)}</div><div className="panel-note">開票を待つてこ</div></div></Panel>
        ) : (
          <Panel head={magic ? "インサイダーを指名" : "インサイダーは誰だ？"} icon="mask">
            {votable.map((p) => (
              <button key={p.id} className={`btn btn-sm ${pick === p.id ? "btn-gold" : "btn-dark"}`} onClick={() => setPick(p.id)} aria-pressed={pick === p.id}>
                {pick === p.id && <Icon name="check" size={24} />}{p.name}
              </button>
            ))}
            {room?.peace && !magic && (
              <button className={`btn btn-sm ${pick === NONE_ID ? "btn-gold" : "btn-cream"}`} onClick={() => setPick(NONE_ID)}><Icon name="halo" size={24} />インサイダーはいない（平和村）</button>
            )}
            <button className="btn btn-red" onClick={() => doVote(pick)} disabled={!pick || busy} style={{ marginBottom: 0 }}>
              {busy ? "通信中…" : pick ? `「${nameOf(pick)}」に決定！` : "えらんでから決定してね"}
            </button>
          </Panel>
        )}
        {isHost && (
          <HostMenu note="電波が悪くて票がそろわない時に使う">
            <button className="btn btn-red btn-sm" onClick={doForceFinalize}>いまある票で開票する</button>
            <button className="btn btn-dark btn-sm" onClick={doAbort}>ラウンド中止（点数なし・ロビーへ）</button>
          </HostMenu>
        )}
      </Shell>
    );
  }

  // ════ 結果 ════
  if (screen === "result") {
    const isPeace = !!room?.isPeaceVillage;
    const insiderId = isPeace ? null : dec(room?.insiderEnc || "");
    const insiderPlayer = players.find((p) => p.id === insiderId);
    const votes = room?.votes || {};
    const { vc } = topVote(votes);
    const oc = room?.outcome;
    const TITLES = {
      commons: "コモンの勝利！", insider: "インサイダーの勝利！", timeout: "時間切れ…",
      peace_win: "平和村 ― 村の勝利！", peace_lose: "平和村 ― 見抜けず…", peace_timeout: "時間切れ…",
      magic_village: "村人チームの勝利！", magic_wizard: "魔術師の勝利！", magic_timeout: "時間切れ ― 魔術師の勝ち",
    };
    const good = ["commons", "peace_win", "magic_village"].includes(oc);
    const nameOf = (id) => (id === NONE_ID ? "いない" : players.find((p) => p.id === id)?.name || "?");
    const markOf = (p) => (p.id === insiderId ? "mask" : p.id === room?.masterId ? (magic ? "wizard" : "mic") : (room?.followerEnc && dec(room.followerEnc) === p.id ? "ninja" : null));
    return (
      <Shell>
        <Header title={magic ? "マジカル" : "インサイダー"} icon={magic ? "wand" : "eye"} sub={`ROUND ${room?.round || 1} 結果`} onHome={goHome} />
        <div className="center pop">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
            {oc?.includes("timeout") ? <Icon name="hourglass" size={72} /> : <OwlDoc size={72} bob expr={good ? "happy" : "surprised"} />}
          </div>
          <div className="mp-title" style={{ fontSize: 28, color: good ? "#D4AF37" : "#ff6b5e" }}>{TITLES[oc] || "結果"}</div>
        </div>
        <div className="mp-lead rise" style={{ animationDelay: ".25s", margin: "6px 0 14px" }}>お題 <span style={{ fontSize: 22, color: "#FFD700" }}>「{dec(room?.wordEnc || "")}」</span></div>

        {isPeace ? (
          <Panel head="このラウンドは…" className="pop" style={{ animationDelay: ".5s" }}>
            <div className="center" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}><Icon name="halo" size={48} /><span style={{ fontSize: 24 }}>平和村</span></div>
            <div className="panel-note center" style={{ marginTop: 6 }}>インサイダーはいなかった！</div>
          </Panel>
        ) : (
          <Panel head="インサイダーの正体は…" className="pop" style={{ animationDelay: ".5s", borderColor: "#E53935" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
              <RoleChar role="insider" size={48} />
              <span style={{ fontSize: 28, color: "#c62828" }}>{insiderPlayer?.name || "?"}</span>
            </div>
            {magic && oc !== "magic_timeout" && <div className="panel-note center" style={{ marginTop: 8 }}>魔術師の指名 → <b>{nameOf(votes[room?.masterId])}</b></div>}
          </Panel>
        )}

        {magic && room?.magicCards && (
          <Panel head="みんなの魔術カード" icon="wand" className="rise" style={{ animationDelay: ".6s" }}>
            {players.filter((p) => room.magicCards[p.id]).map((p) => (
              <div key={p.id} className="prow" style={{ minHeight: 40 }}>
                <span className="prow-nm" style={{ fontSize: 15 }}>{p.name}</span>
                <span style={{ fontSize: 15, color: "#2f5fc4" }}>「{room.magicCards[p.id].t}」</span>
              </div>
            ))}
            <div className="panel-note center" style={{ marginTop: 6 }}>縛りを守れてた？ 破ってたらみんなでツッコむてこ</div>
          </Panel>
        )}

        <Panel head="とくてん（このラウンド／合計）" icon="star">
          <PlayerRows players={players} scores={room?.scores} delta={room?.lastDelta || {}} myId={myId} mark={markOf} animate
            nameColor={(p) => (p.id === insiderId ? "#c62828" : undefined)}
            note={(p) => (vc[p.id] ? <span className="prow-note">{vc[p.id]}票</span> : null)} />
        </Panel>

        {Object.keys(votes).length > 0 && !magic && (
          <Panel head="だれが だれに" icon="people">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px" }}>
              {players.filter((p) => votes[p.id]).map((p) => (
                <div key={p.id} style={{ fontSize: 15, padding: "3px 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.name} <span style={{ color: "#c62828" }}>→</span> <b style={{ color: votes[p.id] === insiderId ? "#1f7a4c" : "#1a1a1a" }}>{nameOf(votes[p.id])}</b>
                </div>
              ))}
            </div>
          </Panel>
        )}

        {resultComment(room, players) && <Bubble expr={good ? "happy" : "thinking"}>{resultComment(room, players)}</Bubble>}
        <ErrBox>{err}</ErrBox>
        {isHost
          ? <button className="btn btn-gold" onClick={doNextRound} disabled={busy}><Icon name="arrowR" size={24} />{busy ? "通信中…" : "次のラウンドへ（ロビー）"}</button>
          : <div className="note-bar note-dark">部屋主が次のラウンドを始めるてこ</div>}
        <div className="btn-row">
          <button className="btn btn-dark btn-sm" onClick={() => openOverlay("lb")}><Icon name="trophy" size={24} />せいせき</button>
          <button className="btn btn-cream btn-sm" onClick={goHome}><Icon name="door" size={24} />ホームへ</button>
        </div>
      </Shell>
    );
  }

  return <Shell><div className="center" style={{ paddingTop: 48 }}>…</div></Shell>;
}
