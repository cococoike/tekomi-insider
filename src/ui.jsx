// 共通UI・ユーティリティ（インサイダー／ワードウルフ／ワードジャマーで共有）
export const genId = () => Math.random().toString(36).slice(2, 11);
export const BOTTOM_ICON = "💩";
export const ROOM = "main"; // 身内専用：全員ひとつの部屋に集まる
export const enc = (t) => { try { return btoa(unescape(encodeURIComponent(t))); } catch { return btoa(t); } };
export const dec = (s) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };
export const fmt = (t) => `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
export const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

// 累計ポイント順位フレア（1位👑 / ビリ💩・同点は全員に付与）。全員同点なら付けない。
export function computeFlair(players, board) {
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

// 票の集計 → 最多得票（単独のとき）を返す。同数なら null
export function topVote(votes) {
  const vc = {};
  Object.values(votes || {}).forEach((t) => { vc[t] = (vc[t] || 0) + 1; });
  const maxV = Math.max(0, ...Object.values(vc));
  const top = Object.entries(vc).filter(([, v]) => v === maxV).map(([k]) => k);
  return { vc, top: top.length === 1 ? top[0] : null, tied: top };
}

export const CSS = `
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
/* ── あそびかた（ビジュアル説明書）── */
.gd-tabs { display:flex; gap:5px; overflow-x:auto; padding-bottom:6px; margin-bottom:12px; }
.gd-tab { flex:0 0 auto; font-family:inherit; font-size:11px; padding:7px 10px 6px; border:2.5px solid #000;
  border-radius:9px; background:#2a2a2a; color:#ddd; box-shadow:0 3px 0 #000; cursor:pointer; letter-spacing:1px; }
.gd-tab.on { background:linear-gradient(180deg,#f1d885,#D4AF37 60%,#937017); color:#1a1200; box-shadow:0 3px 0 #5e4810; }
.gd-card { display:flex; gap:10px; align-items:flex-start; background:#fff; border:3px solid #000; border-radius:12px;
  box-shadow:0 4px 0 #000; padding:9px 10px; }
.gd-avatar { position:relative; flex:0 0 auto; }
.gd-badge { position:absolute; right:-6px; bottom:-5px; font-size:15px; filter:drop-shadow(1px 1px 0 #000); }
.gd-name { font-size:12px; letter-spacing:1px; }
.gd-desc { font-size:10.5px; color:#555; line-height:1.55; margin-top:2px; }
.gd-step { display:grid; grid-template-columns:30px 1fr; gap:9px; align-items:start; padding:7px 0; border-bottom:2px dashed #ddd; }
.gd-step:last-child { border-bottom:none; }
.gd-num { font-size:13px; color:#D4AF37; background:#1a1a1a; border:2px solid #000; border-radius:7px;
  text-align:center; line-height:26px; height:28px; }
.gd-step-t { font-size:12px; color:#111; }
.gd-step-d { font-size:10.5px; color:#555; line-height:1.55; }
.gd-pt { display:flex; gap:8px; align-items:center; padding:7px 0; border-bottom:2px dashed #ddd; }
.gd-pt:last-child { border-bottom:none; }
.gd-pt-t { flex:1; font-size:11px; color:#111; line-height:1.5; }
.gd-chip { flex:0 0 auto; font-size:11px; border:2px solid #000; border-radius:7px; padding:3px 7px;
  box-shadow:0 2px 0 #000; white-space:nowrap; }
.gd-plus { background:#D4AF37; color:#1a1200; }
.gd-minus { background:#E53935; color:#fff; }
.gd-zero { background:#ccc; color:#333; }
.gd-grid { display:grid; grid-template-columns:1fr; gap:8px; }
`;

export const STARS = [
  { t: "6%", l: "12%", s: 11, c: "#FFD700", d: "0s" }, { t: "10%", l: "82%", s: 9, c: "#fff", d: ".4s" },
  { t: "20%", l: "50%", s: 7, c: "#ffec8a", d: ".8s" }, { t: "30%", l: "8%", s: 8, c: "#fff", d: "1.1s" },
  { t: "34%", l: "90%", s: 12, c: "#FFD700", d: ".2s" }, { t: "48%", l: "20%", s: 7, c: "#fff", d: ".9s" },
  { t: "55%", l: "78%", s: 9, c: "#ffec8a", d: "1.3s" }, { t: "66%", l: "6%", s: 10, c: "#FFD700", d: ".5s" },
  { t: "72%", l: "92%", s: 8, c: "#fff", d: "1s" }, { t: "82%", l: "30%", s: 7, c: "#ffec8a", d: ".3s" },
  { t: "88%", l: "70%", s: 11, c: "#FFD700", d: ".7s" }, { t: "92%", l: "14%", s: 8, c: "#fff", d: "1.2s" },
];
export const Stars = () => (
  <>{STARS.map((s, i) => (
    <div key={i} className="mp-star" style={{
      top: s.t, left: s.l, width: s.s, height: s.s, background: s.c,
      clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)",
      animation: `mp-tw 2s ease-in-out ${s.d} infinite`,
    }} />
  ))}</>
);

// オリジナルのドット絵てこみん（SVG・透過）。黒×白の帽＋金の星、金縁の服。表情5種。
export const PX = { W: "#F4F1EA", K: "#1E1E1E", G: "#D4AF37", S: "#F6D9B8", E: "#141414", H: "#ffffff" };
// 帽子・顔・服のベース（顔の中身は表情で描く）
export const BASE = [
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
export const EXPRS = ["normal", "thinking", "surprised", "suspicious", "happy"];
// 表情ごとの目・口（[x,y,w,h,色キー]）
export const FACES = {
  normal:     [[4,9,2,2,"E"],[10,9,2,2,"E"],[4,9,1,1,"H"],[10,9,1,1,"H"],[6,12,4,1,"E"]],
  happy:      [[4,10,1,1,"E"],[5,9,1,1,"E"],[10,9,1,1,"E"],[11,10,1,1,"E"],[6,11,4,1,"E"],[7,12,2,1,"E"]],
  surprised:  [[4,9,2,2,"E"],[10,9,2,2,"E"],[4,9,1,1,"H"],[10,9,1,1,"H"],[7,11,2,2,"E"]],
  thinking:   [[4,9,2,1,"E"],[10,9,2,1,"E"],[7,12,3,1,"E"]],
  suspicious: [[3,10,3,1,"E"],[10,10,3,1,"E"],[8,12,3,1,"E"],[10,11,1,1,"E"]],
};
// pal で色を差し替えると「役職ちがいのてこみん」になる（W=体/帽・G=星や服の縁・S=顔）
export const OwlDoc = ({ size = 54, bob = false, expr = "normal", pal = null }) => {
  const P = pal ? { ...PX, ...pal } : PX;
  const e = EXPRS.includes(expr) ? expr : "normal";
  const cells = [];
  BASE.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = P[row[x]];
      if (c) cells.push(<rect key={`b${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={c} />);
    }
  });
  FACES[e].forEach(([x, y, w, h, k], i) => cells.push(<rect key={`f${i}`} x={x} y={y} width={w} height={h} fill={P[k]} />));
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
export const Logo = () => (
  <div className="tk-logo">
    <div className="tk-logo-top">てこみの</div>
    <div className="tk-logo-main">INSIDER</div>
    <div className="tk-logo-sub"><span className="tk-logo-bar" />GAME<span className="tk-logo-bar" /></div>
  </div>
);

export const Bubble = ({ name = "てこみん", children, arrow = false, expr = "normal" }) => (
  <div className="mp-bubble">
    <span className="mp-bubble-owl"><OwlDoc size={52} bob expr={expr} /></span>
    <span className="mp-bubble-name">{name}</span>
    {children}
    {arrow && <span style={{ position: "absolute", bottom: 8, right: 12, color: "#E53935", fontSize: 12, animation: "mp-blink .8s steps(1) infinite" }}>▼</span>}
  </div>
);

export const Shell = ({ children }) => (
  <>
    <style>{CSS}</style>
    <div className="mp-page"><Stars />{children}</div>
  </>
);

export const Redacted = () => (
  <span style={{ display: "inline-block", background: "#111", borderRadius: 3, width: "7em", height: "1.1em", verticalAlign: "middle" }} />
);


// 画面上部の小ヘッダー
export const Header = ({ sub, onBack, title = "てこみンサイダー❤" }) => (
  <div className="mp-row" style={{ marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {onBack && (
        <button onClick={onBack} className="mp-btn mp-blue"
          style={{ width: "auto", padding: "5px 9px", margin: 0, fontSize: 12, borderRadius: 8, boxShadow: "0 3px 0 #000,0 4px 0 #D4AF37" }}>←</button>
      )}
      <OwlDoc size={28} />
      <span style={{ fontSize: 13, color: "#D4AF37", textShadow: "1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6)" }}>{title}</span>
    </div>
    <div style={{ fontSize: 10, textShadow: "1px 1px 0 #000", letterSpacing: 1 }}>{sub}</div>
  </div>
);

// 赤いエラー帯
export const ErrBox = ({ children }) => children ? (
  <div style={{ color: "#fff", background: "#E53935", border: "2px solid #000", borderRadius: 8, fontSize: 12, textAlign: "center", padding: 8, marginBottom: 10 }}>{children}</div>
) : null;

// 得点行（結果画面共通）
export const ScoreRows = ({ players, scores, myId, flair = {}, colorOf = () => "#111", extra = () => null }) => (
  <div className="mp-panel">
    <div className="mp-panel-head">★ とくてん ★</div>
    {players.map((p) => (
      <div key={p.id} className="mp-row" style={{ padding: "7px 0", borderBottom: "2px dashed #ddd" }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, color: colorOf(p) }}>
            {flair[p.name] ? flair[p.name] + " " : ""}{p.name}{p.id === myId ? "（あなた）" : ""}
          </span>
          {extra(p)}
        </div>
        <div style={{ fontSize: 18, color: "#D4AF37", WebkitTextStroke: "0.4px #000" }}>{(scores || {})[p.name] || 0}<span style={{ fontSize: 9, color: "#888" }}>pt</span></div>
      </div>
    ))}
  </div>
);

// ロビーの設定カード（トグル／選択で共用）
export const ModeCard = ({ on, color = "#D4AF37", emoji, label, desc, onClick, toggle = false }) => (
  <div className="mp-modecard" onClick={onClick}
    style={{ borderColor: on ? color : "#000", boxShadow: on ? `0 4px 0 ${color}` : "0 4px 0 #000", background: on ? "#fff8e6" : "#fff" }}>
    <div style={{ fontSize: 22, filter: "drop-shadow(1px 1px 0 #000)" }}>{emoji}</div>
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 12, fontWeight: 700 }}>{label}{on ? " ✓" : ""}</div>
      <div style={{ fontSize: 9, color: "#666", lineHeight: 1.3 }}>{desc}</div>
    </div>
    {toggle && (
      <div style={{ width: 34, height: 20, borderRadius: 10, position: "relative", border: "2px solid #000", background: on ? color : "#ccc" }}>
        <div style={{ position: "absolute", top: 1, left: on ? 15 : 1, width: 14, height: 14, borderRadius: "50%", background: "#fff", border: "1px solid #000" }} />
      </div>
    )}
  </div>
);

