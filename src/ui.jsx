// 共通の画面部品（インサイダー／ワードウルフ／ワードジャマーで共有）。
// 見た目の決まりは DESIGN.md。色・文字の大きさ・押せる大きさはここの CSS 変数が正本。
import { useContext, useEffect, useRef, useState } from "react";
import { Icon } from "./icons";
import { ROLES } from "./lib/roles";
import { fmt } from "./lib/util";
import { useSound, buzz, useConnected } from "./lib/hooks";
import { sfxTick, sfxBuzzer } from "./lib/sound";
import { ShotCtx } from "./lib/shotctx";

const CSS = `
* { box-sizing: border-box; }
html, body { margin:0; background:#050505; }
.mp-page {
  --gold:#D4AF37; --gold-hi:#f6e3a1; --gold-lo:#8f6f17; --red:#E53935; --paper:#F4EFE3; --ink:#1a1a1a; --dim:#5f5f5f;
  --t-gold:#7d5f10; --t-red:#c62828; --t-blue:#2f5fc4; --t-green:#1f7a4c; --t-purple:#8a1fc2;
  --fs-xs:12px; --fs-s:13px; --fs-m:15px; --fs-l:17px; --fs-xl:22px;
  --tap:48px;
  font-family:'DotGothic16','Hiragino Kaku Gothic ProN','Yu Gothic',sans-serif;
  min-height:100vh; min-height:100dvh; max-width:460px; margin:0 auto; color:#F2F2F2; position:relative; overflow-x:hidden;
  background: radial-gradient(ellipse at 50% 12%, #262626, #0d0d0d 60%, #050505);
  padding: calc(14px + env(safe-area-inset-top)) 14px calc(44px + env(safe-area-inset-bottom));
  -webkit-tap-highlight-color: transparent; -webkit-text-size-adjust: 100%;
  line-break: strict; /* 「ー」や小さい「ゃ」で行を始めない */
}
.panel-note, .gd-desc, .gd-step-d, .mp-bubble, .opt-d, .small { text-wrap: pretty; } /* 最後の行が1文字だけにならないように */
.mp-lead, .mp-title { text-wrap: balance; } /* 中央ぞろえの文は、行の長さをそろえる */
.mp-page button, .mp-page input { font-family: inherit; }
.mp-body { position:relative; z-index:1; }
.mp-star { position:absolute; z-index:0; pointer-events:none; }

/* ── 見出し・文字 ── */
.mp-title { font-size:28px; color:var(--gold); text-align:center; line-height:1.3; letter-spacing:1px;
  text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,2px 2px 0 #000,-2px 2px 0 #000,4px 4px 0 rgba(0,0,0,.6); }
.mp-lead { font-size:var(--fs-m); text-align:center; line-height:1.7; text-shadow:1px 1px 0 #000; color:#f2f2f2; }
.mp-sub { font-size:var(--fs-s); text-align:center; letter-spacing:3px; text-shadow:1px 1px 0 #000; margin-top:6px; }
.mp-h { font-size:var(--fs-l); color:var(--gold); text-align:center; letter-spacing:2px; margin:4px 0 12px;
  text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6); }
.small { font-size:var(--fs-xs); color:var(--dim); }
.center { text-align:center; }

/* ── ロゴ ── */
.tk-logo { text-align:center; line-height:1; user-select:none; }
.tk-logo-top { font-size:16px; color:#F4F1EA; letter-spacing:6px; text-indent:6px; margin-bottom:4px;
  text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6); }
.tk-logo-main { font-size:48px; color:var(--gold); letter-spacing:4px; text-indent:4px;
  text-shadow:3px 0 0 #000,-3px 0 0 #000,0 3px 0 #000,0 -3px 0 #000,3px 3px 0 #000,-3px 3px 0 #000,3px -3px 0 #000,-3px -3px 0 #000,5px 6px 0 rgba(0,0,0,.55); }
.tk-logo-sub { display:flex; align-items:center; justify-content:center; gap:10px; margin-top:7px; font-size:18px; color:var(--gold);
  letter-spacing:8px; text-indent:8px; text-shadow:2px 0 0 #000,-2px 0 0 #000,0 2px 0 #000,0 -2px 0 #000,2px 2px 0 rgba(0,0,0,.6); }
.tk-logo-bar { display:inline-block; width:34px; height:4px; background:var(--gold); box-shadow:0 2px 0 #000, 0 0 0 1px #000; }

/* ── 上の帯 ── */
.hdr { display:flex; align-items:center; gap:8px; margin-bottom:14px; min-height:var(--tap); }
.hdr-btn { flex:0 0 auto; width:var(--tap); height:var(--tap); display:flex; align-items:center; justify-content:center; cursor:pointer;
  background:linear-gradient(180deg,#3a3a3a,#141414); border:3px solid var(--gold); border-radius:10px; box-shadow:0 3px 0 #000; padding:0; }
.hdr-btn:active { transform:translateY(3px); box-shadow:none; }
.hdr-owl { flex:0 0 auto; }
.hdr-title { flex:1; min-width:0; display:flex; align-items:center; gap:6px; font-size:var(--fs-m); color:var(--gold);
  text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,2px 2px 0 rgba(0,0,0,.6); white-space:nowrap; overflow:hidden; }
.hdr-title span { overflow:hidden; text-overflow:ellipsis; }
.hdr-sub { flex:0 0 auto; font-size:var(--fs-xs); letter-spacing:1px; text-shadow:1px 1px 0 #000; color:#ddd; }

/* ── 紙のパネル ── */
.panel { background:var(--paper); border:4px solid var(--gold); border-radius:16px; box-shadow:0 7px 0 #000;
  padding:14px 12px; margin-bottom:16px; color:var(--ink); }
.panel-head { display:flex; align-items:center; justify-content:center; gap:8px; background:linear-gradient(180deg,#ecd27a,var(--gold));
  color:#0d0d0d; border:3px solid #000; border-radius:9px; font-size:var(--fs-m); padding:6px 8px; margin-bottom:12px; letter-spacing:2px; }
.panel-note { font-size:var(--fs-s); color:var(--dim); line-height:1.6; }
.label { font-size:var(--fs-s); color:var(--dim); letter-spacing:1px; margin:14px 0 8px; }
.label:first-child { margin-top:0; }

/* ── ボタン（厚みのある板。押すと沈む）── */
.btn { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; min-height:56px; border:3px solid #000; border-radius:12px;
  font-size:var(--fs-l); letter-spacing:1px; padding:10px 14px; margin:0 0 14px; cursor:pointer; color:#1a1200; line-height:1.3;
  transition:transform .07s, box-shadow .07s, filter .1s; touch-action:manipulation; user-select:none; -webkit-user-select:none; text-align:center; }
.btn:active:not(:disabled) { transform:translateY(5px); box-shadow:none !important; }
.btn:disabled { filter:grayscale(.75) brightness(.72); cursor:default; }
.btn:focus-visible, .seg button:focus-visible, .opt:focus-visible, .tile:focus-visible, .hdr-btn:focus-visible { outline:3px solid #fff; outline-offset:2px; }
.btn-gold  { background:linear-gradient(180deg,#f6e3a1,#D4AF37 55%,#9c7a1c); box-shadow:0 6px 0 #5e4810,0 7px 0 #000; }
.btn-red   { background:linear-gradient(180deg,#ff8a7e,#E53935 55%,#a3160f); box-shadow:0 6px 0 #5e0d09,0 7px 0 #000; color:#fff; text-shadow:0 2px 0 #7a0e08; }
.btn-dark  { background:linear-gradient(180deg,#3a3a3a,#1c1c1c 55%,#0d0d0d); border-color:var(--gold); box-shadow:0 6px 0 #000,0 7px 0 var(--gold); color:#f3dc8f; }
.btn-cream { background:linear-gradient(180deg,#fffaf0,#eadcb4 55%,#c9ad63); box-shadow:0 6px 0 #8a7434,0 7px 0 #000; color:#3a2a00; }
.btn-sm { min-height:48px; font-size:var(--fs-m); border-radius:10px; }
.btn-row { display:flex; gap:10px; margin-bottom:14px; }
.btn-row > .btn { flex:1; margin-bottom:0; min-width:0; }
.btn .px-icon { flex:0 0 auto; }
.btn-col { flex-direction:column; gap:4px; font-size:var(--fs-s); min-height:76px; padding:8px 4px; }

/* ── 入力 ── */
.mp-input { width:100%; background:#fbf7ec; border:3px solid #000; border-radius:10px; box-shadow:inset 0 3px 0 rgba(0,0,0,.12);
  padding:12px 12px; font-size:17px; color:#111; margin-bottom:12px; outline:none; min-height:var(--tap); }
.mp-input:focus { border-color:var(--gold-lo); }

/* ── 選択（2〜3択の切り替え）── */
.seg { display:flex; gap:8px; }
.seg button { flex:1; min-width:0; min-height:var(--tap); font-size:var(--fs-m); border:3px solid #000; border-radius:10px; background:#fff; color:var(--ink);
  box-shadow:0 3px 0 #000; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px; padding:4px; }
.seg button.on { background:var(--gold); box-shadow:0 3px 0 #5e4810; }
.seg.col button { flex-direction:column; gap:3px; min-height:66px; font-size:var(--fs-s); }
.seg button:active { transform:translateY(3px); box-shadow:none; }
.chips { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:12px; }
.chips button { min-height:44px; padding:6px 12px; font-size:var(--fs-m); border:3px solid #000; border-radius:10px; background:#fff; color:var(--ink); box-shadow:0 3px 0 #000; cursor:pointer; }
.chips button.on { background:var(--gold); box-shadow:0 3px 0 #5e4810; }

/* ── ゲームの札（3つ並び）── */
.tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
.tile { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:10px 4px 8px; min-height:96px;
  border:3px solid #000; border-radius:12px; background:#fff; color:var(--ink); font-size:var(--fs-s); box-shadow:0 4px 0 #000; cursor:pointer; }
.tile.on { background:#fff3cf; border-color:var(--c); box-shadow:0 4px 0 var(--c); }
.tile:active { transform:translateY(3px); box-shadow:none; }

/* ── ON/OFF の行 ── */
.opt { display:flex; align-items:center; gap:10px; width:100%; text-align:left; border:3px solid #000; border-radius:12px; padding:10px;
  margin-bottom:10px; background:#fff; color:var(--ink); box-shadow:0 4px 0 #000; cursor:pointer; min-height:64px; }
.opt.on { background:#fff3cf; border-color:var(--c,#D4AF37); box-shadow:0 4px 0 var(--c,#D4AF37); }
.opt:active { transform:translateY(3px); box-shadow:none; }
.opt-body { flex:1; min-width:0; }
.opt-t { font-size:var(--fs-l); }
.opt-d { font-size:var(--fs-xs); color:var(--dim); line-height:1.5; margin-top:2px; }
.switch { width:50px; height:30px; border-radius:15px; border:3px solid #000; background:#bdbdbd; position:relative; flex:0 0 auto; }
.switch::after { content:""; position:absolute; top:2px; left:2px; width:20px; height:20px; border-radius:50%; background:#fff; border:2px solid #000; transition:left .12s; }
.opt.on .switch { background:var(--c,#D4AF37); }
.opt.on .switch::after { left:22px; }

/* ── 人の一覧・得点 ── */
.prow { display:flex; align-items:center; gap:8px; padding:6px 2px; min-height:48px; border-bottom:2px dashed #d9d2bf; }
.prow:last-child { border-bottom:none; }
.prow-mark { width:24px; flex:0 0 24px; display:flex; }
.prow-nm { flex:1; min-width:0; font-size:var(--fs-l); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.prow-nm small { font-size:var(--fs-xs); color:var(--dim); margin-left:4px; }
.prow-note { font-size:var(--fs-xs); color:var(--dim); flex:0 0 auto; }
.prow-pt { font-size:var(--fs-l); color:var(--t-gold); min-width:52px; text-align:right; flex:0 0 auto; }
.prow-pt small { font-size:var(--fs-xs); color:var(--dim); margin-left:1px; }
.kick { flex:0 0 auto; width:44px; height:44px; display:flex; align-items:center; justify-content:center; border:3px solid #000; border-radius:10px;
  background:#fff; box-shadow:0 3px 0 #000; cursor:pointer; padding:0; }
.kick:active { transform:translateY(3px); box-shadow:none; }
.chip { display:inline-flex; align-items:center; justify-content:center; min-width:48px; font-size:var(--fs-m); border:2px solid #000; border-radius:8px;
  padding:3px 7px; box-shadow:0 2px 0 #000; white-space:nowrap; flex:0 0 auto; }
.chip-plus { background:var(--gold); color:#1a1200; }
.chip-minus { background:var(--red); color:#fff; }
.chip-zero { background:#d6d6d6; color:#333; }
.chip-wrap { white-space:normal; max-width:52%; text-align:center; line-height:1.35; font-size:var(--fs-s); }

/* ── てこみんの吹き出し ── */
.mp-bubble { background:#fffef0; border:4px solid #000; border-radius:14px; box-shadow:0 5px 0 #000, inset 0 0 0 2px var(--gold);
  padding:14px 14px 12px 62px; position:relative; min-height:64px; color:#111; font-size:var(--fs-m); line-height:1.7; margin:18px 0 16px; }
.mp-bubble-name { position:absolute; top:-14px; left:58px; background:var(--gold); border:3px solid #000; border-radius:8px; font-size:var(--fs-xs);
  padding:1px 8px; box-shadow:1px 2px 0 #000; color:#0d0d0d; }
.mp-bubble-owl { position:absolute; left:-8px; top:-14px; }

/* ── 押しているあいだだけ見えるカード ── */
.secret { user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; touch-action:pan-y; cursor:pointer; margin-bottom:16px; }
.secret-cover { display:flex; align-items:center; gap:12px; background:repeating-linear-gradient(135deg,#1e1e1e 0 10px,#262626 10px 20px);
  border:4px solid var(--gold); border-radius:16px; box-shadow:0 7px 0 #000; padding:14px; min-height:84px; }
.secret-cover:active { transform:translateY(4px); box-shadow:0 3px 0 #000; }
.secret-t { font-size:var(--fs-l); color:#f3dc8f; }
.secret-d { font-size:var(--fs-s); color:#bbb; margin-top:3px; }
.secret-open { background:var(--paper); border:4px solid var(--gold); border-radius:16px; box-shadow:0 3px 0 #000; padding:14px 12px;
  color:var(--ink); transform:translateY(4px); }

/* ── タイマー ── */
.timer { background:var(--paper); border:4px solid var(--gold); border-radius:16px; padding:10px 14px 12px; box-shadow:0 7px 0 #000; margin-bottom:16px; color:var(--ink); }
.timer-top { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:var(--fs-s); color:var(--dim); min-height:24px; }
.timer-num { font-size:52px; text-align:center; line-height:1.05; letter-spacing:3px; color:#111; }
.timer-bar { height:14px; border:3px solid #000; border-radius:8px; background:#d9d2bf; overflow:hidden; margin-top:6px; }
.timer-fill { height:100%; background:var(--gold); transition:width 1s linear; }
.timer.warn .timer-fill { background:#f08a30; }
.timer.warn .timer-num { color:#b05000; }
.timer.danger .timer-fill { background:var(--red); }
.timer.danger .timer-num { color:var(--t-red); animation:tk-pulse .5s steps(2) infinite; }
.timer.over .timer-num { color:var(--t-red); }

/* ── 帯のお知らせ ── */
.note-bar { display:flex; align-items:center; gap:8px; justify-content:center; text-align:center; font-size:var(--fs-m); line-height:1.5;
  border:3px solid #000; border-radius:10px; padding:10px 12px; margin-bottom:14px; }
.note-red { background:var(--red); color:#fff; }
.note-dark { background:#1d1d1d; color:#f3dc8f; border-color:var(--gold); }

/* ── 圏外の帯（画面の上にはりつく）── */
.offline { position:sticky; top:calc(env(safe-area-inset-top) + 4px); z-index:5; display:flex; align-items:center; gap:10px; background:var(--red); color:#fff;
  border:3px solid #000; border-radius:12px; padding:10px 12px; margin-bottom:14px; box-shadow:0 4px 0 #000; font-size:var(--fs-m); line-height:1.5; animation:rise-in .3s ease-out both; }
.offline small { display:block; font-size:var(--fs-xs); color:#ffd9d6; }
.offline .px-icon { animation:tk-spin 1.6s steps(8) infinite; }
@keyframes tk-spin { to { transform:rotate(360deg); } }

/* ── 主催者メニュー ── */
.hostmenu { margin-top:6px; }
.hostmenu-body { border:3px dashed #7a6320; border-radius:12px; padding:12px 10px 0; margin-bottom:14px; }
.hostmenu-note { font-size:var(--fs-xs); color:#cfc3a0; text-align:center; margin-bottom:10px; line-height:1.5; }

/* ── 動き ── */
.tk-hop { animation:tk-hop .62s infinite; }
@keyframes tk-hop { 0%,50%{transform:translateY(0)} 50.01%,100%{transform:translateY(-3px)} }
.tk-lid { transform-box:fill-box; transform-origin:center; transform:scaleY(0); animation:tk-blink 3.4s steps(1) infinite; } /* 動きを止めても、まぶたは閉じたままにしない */
@keyframes tk-blink { 0%,93%{transform:scaleY(0)} 94%,98%{transform:scaleY(1)} 100%{transform:scaleY(0)} }
@keyframes mp-tw { 0%,100%{opacity:.35;transform:scale(1)} 50%{opacity:1;transform:scale(1.35)} }
@keyframes mp-blink { 50%{opacity:0} }
@keyframes tk-pulse { 50%{opacity:.35} }
@keyframes pop-in { 0%{opacity:0;transform:scale(.6) translateY(10px)} 60%{opacity:1;transform:scale(1.06)} 100%{opacity:1;transform:none} }
@keyframes flip-in { 0%{opacity:0;transform:perspective(700px) rotateY(88deg)} 100%{opacity:1;transform:none} }
@keyframes rise-in { 0%{opacity:0;transform:translateY(14px)} 100%{opacity:1;transform:none} }
.pop { animation:pop-in .5s cubic-bezier(.2,1.4,.4,1) both; }
.flip { animation:flip-in .55s ease-out both; }
.rise { animation:rise-in .4s ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .pop, .flip, .rise, .tk-hop, .tk-lid, .mp-star, .timer.danger .timer-num { animation:none !important; }
  .timer-fill { transition:none; }
}

/* ── あそびかた（ビジュアル説明書）── */
.gd-tabs { display:flex; flex-wrap:wrap; gap:8px; padding:2px 2px 8px; margin-bottom:10px; }
.gd-tab { flex:0 0 auto; display:flex; align-items:center; gap:6px; font-size:var(--fs-s); min-height:44px; padding:6px 10px; border:3px solid #000;
  border-radius:10px; background:#2a2a2a; color:#ddd; box-shadow:0 3px 0 #000; cursor:pointer; letter-spacing:1px; }
.gd-tab.on { background:linear-gradient(180deg,#f1d885,#D4AF37 60%,#937017); color:#1a1200; box-shadow:0 3px 0 #5e4810; }
.gd-card { display:flex; gap:12px; align-items:flex-start; background:#fff; border:3px solid #000; border-radius:12px; box-shadow:0 4px 0 #000; padding:10px; }
button.gd-card { width:100%; text-align:left; cursor:pointer; color:inherit; }
.gd-name { font-size:var(--fs-l); letter-spacing:1px; }
.gd-desc { font-size:var(--fs-s); color:#4f4f4f; line-height:1.65; margin-top:3px; }
.gd-step { display:grid; grid-template-columns:32px 1fr; gap:10px; align-items:start; padding:9px 0; border-bottom:2px dashed #ddd; }
.gd-step:last-child { border-bottom:none; }
.gd-num { font-size:15px; color:var(--gold); background:#1a1a1a; border:2px solid #000; border-radius:8px; text-align:center; line-height:28px; height:32px; }
.gd-step-t { font-size:var(--fs-m); color:#111; line-height:1.5; }
.gd-step-d { font-size:var(--fs-s); color:#555; line-height:1.65; margin-top:2px; }
.gd-pt { display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:2px dashed #ddd; }
.gd-pt:last-child { border-bottom:none; }
.gd-pt-t { flex:1; font-size:var(--fs-s); color:#111; line-height:1.6; }
.gd-grid { display:grid; grid-template-columns:1fr; gap:10px; }
.px-icon { display:block; }
.note-dark .px-icon, .btn-dark .px-icon, .hdr .px-icon, .secret-cover .px-icon, .gd-tab:not(.on) .px-icon, .lit {
  filter: drop-shadow(1px 0 0 rgba(244,241,234,.85)) drop-shadow(-1px 0 0 rgba(244,241,234,.85)) drop-shadow(0 1px 0 rgba(244,241,234,.85)) drop-shadow(0 -1px 0 rgba(244,241,234,.85)); }
.fold-btn { display:flex; align-items:center; justify-content:space-between; gap:8px; width:100%; background:none; border:none; padding:0; cursor:pointer; color:inherit; min-height:40px; }
.pt-row { padding:8px 0; border-bottom:2px dashed #ddd; }
.pt-row:last-child { border-bottom:none; }
.pt-row .chips-line { display:flex; flex-wrap:wrap; gap:6px; margin-top:6px; }
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

// 電波が切れたら、どの画面でも上に赤い帯を出す（押しても反応しない理由が分かるように）
const OfflineBar = () => (
  <div className="offline" role="alert" aria-live="assertive">
    <Icon name="refresh" size={36} />
    <div>電波がないてこ…つなぎ直しているてこ<small>押した操作は、つながった瞬間に進むてこ</small></div>
  </div>
);

export const Shell = ({ children }) => {
  const connected = useConnected();
  return (
    <>
      <style>{CSS}</style>
      <div className="mp-page"><Stars /><div className="mp-body">{!connected && <OfflineBar />}{children}</div></div>
    </>
  );
};

// ── てこみん（ドット絵・SVG）。pal で色替え、expr で表情5種 ──
const PX = { W: "#F4F1EA", K: "#1E1E1E", G: "#D4AF37", S: "#F6D9B8", E: "#141414", H: "#ffffff" };
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
const FACES = {
  normal:     [[4,9,2,2,"E"],[10,9,2,2,"E"],[4,9,1,1,"H"],[10,9,1,1,"H"],[6,12,4,1,"E"]],
  happy:      [[4,10,1,1,"E"],[5,9,1,1,"E"],[10,9,1,1,"E"],[11,10,1,1,"E"],[6,11,4,1,"E"],[7,12,2,1,"E"]],
  surprised:  [[4,9,2,2,"E"],[10,9,2,2,"E"],[4,9,1,1,"H"],[10,9,1,1,"H"],[7,11,2,2,"E"]],
  thinking:   [[4,9,2,1,"E"],[10,9,2,1,"E"],[7,12,3,1,"E"]],
  suspicious: [[3,10,3,1,"E"],[10,10,3,1,"E"],[8,12,3,1,"E"],[10,11,1,1,"E"]],
};
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
    <svg width={size} height={size} viewBox="0 0 16 16" className={bob ? "tk-hop" : ""} aria-hidden="true"
      shapeRendering="crispEdges" style={{ display: "block", filter: "drop-shadow(1px 1.5px 0 rgba(0,0,0,.55))" }}>
      {cells}
      {bob && <rect className="tk-lid" x="3" y="9" width="10" height="2" fill={P.S} />}
    </svg>
  );
};

// 役職ごとの色ちがいてこみん＋アイコンのバッジ
export const RoleChar = ({ role, size = 48, bob = true, badge = true }) => {
  const r = ROLES[role] || ROLES.common;
  const b = size >= 72 ? 36 : 24;
  return (
    <div style={{ position: "relative", flex: "0 0 auto", width: size, height: size }}>
      <OwlDoc size={size} bob={bob} expr={r.expr} pal={r.pal} />
      {badge && <span style={{ position: "absolute", right: -Math.round(b / 2), bottom: -Math.round(b / 6), filter: "drop-shadow(1px 1px 0 rgba(0,0,0,.6))" }}><Icon name={r.icon} size={b} /></span>}
    </div>
  );
};

export const Logo = () => (
  <div className="tk-logo">
    <div className="tk-logo-top">てこみの</div>
    <div className="tk-logo-main">INSIDER</div>
    <div className="tk-logo-sub"><span className="tk-logo-bar" />GAME<span className="tk-logo-bar" /></div>
  </div>
);

export const Bubble = ({ name = "てこみん", children, arrow = false, expr = "normal" }) => (
  <div className="mp-bubble">
    <span className="mp-bubble-owl"><OwlDoc size={56} bob expr={expr} /></span>
    <span className="mp-bubble-name">{name}</span>
    {children}
    {arrow && <span style={{ position: "absolute", bottom: 6, right: 12, color: "#E53935", fontSize: 14, animation: "mp-blink .8s steps(1) infinite" }}>▼</span>}
  </div>
);

// 上の帯：左＝ホームへ／タイトル／右＝ラウンド表示と効果音
export function Header({ title = "てこみンサイダー", icon, sub, onHome }) {
  const [soundOn, toggle] = useSound();
  return (
    <div className="hdr">
      {onHome
        ? <button className="hdr-btn" onClick={onHome} aria-label="ホームへもどる"><Icon name="door" size={24} /></button>
        : <span className="hdr-owl"><OwlDoc size={36} /></span>}
      <div className="hdr-title">{icon && <Icon name={icon} size={24} />}<span>{title}</span></div>
      {sub && <div className="hdr-sub">{sub}</div>}
      <button className="hdr-btn" onClick={toggle} aria-label={soundOn ? "効果音をけす" : "効果音をつける"}><Icon name={soundOn ? "sound" : "mute"} size={24} /></button>
    </div>
  );
}

export const Panel = ({ head, icon, headStyle, children, className = "", style }) => (
  <div className={`panel ${className}`} style={style}>
    {head && <div className="panel-head" style={headStyle}>{icon && <Icon name={icon} size={24} />}<span>{head}</span></div>}
    {children}
  </div>
);

export const ErrBox = ({ children }) => (children ? <div className="note-bar note-red" role="alert">{children}</div> : null);

export const Chip = ({ v }) => (
  <span className={`chip ${v > 0 ? "chip-plus" : v < 0 ? "chip-minus" : "chip-zero"}`}>{v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "±0"}</span>
);

// 人の一覧（ロビー・結果で共用）。delta を渡すと「このラウンドの点」のチップが付く
export function PlayerRows({ players, scores = {}, delta, myId, mark, nameColor, note, onKick, animate = false }) {
  return (
    <div>
      {players.map((p, i) => (
        <div key={p.id} className={`prow${animate ? " rise" : ""}`} style={animate ? { animationDelay: `${0.8 + i * 0.09}s` } : undefined}>
          <span className="prow-mark">{mark?.(p) ? <Icon name={mark(p)} size={24} /> : null}</span>
          <span className="prow-nm" style={{ color: nameColor?.(p) }}>{p.name}{p.id === myId && <small>（あなた）</small>}</span>
          {note?.(p)}
          {delta && <Chip v={delta[p.name] || 0} />}
          <span className="prow-pt">{(scores || {})[p.name] || 0}<small>pt</small></span>
          {onKick && p.id !== myId && (
            <button className="kick" onClick={() => onKick(p)} aria-label={`${p.name}を部屋から外す`}><Icon name="cross" size={24} /></button>
          )}
        </div>
      ))}
    </div>
  );
}

// ゲームの札（ロビーで3つ並べる）
export const Tile = ({ on, color, icon, label, onClick }) => (
  <button className={`tile${on ? " on" : ""}`} style={{ "--c": color }} onClick={onClick} aria-pressed={on}>
    <Icon name={icon} size={36} />
    <span>{label}</span>
  </button>
);

// ON/OFF の行
export const OptRow = ({ on, color, icon, label, desc, onClick }) => (
  <button className={`opt${on ? " on" : ""}`} style={{ "--c": color }} onClick={onClick} aria-pressed={on}>
    <Icon name={icon} size={36} />
    <span className="opt-body"><span className="opt-t">{label}</span><span className="opt-d" style={{ display: "block" }}>{desc}</span></span>
    <span className="switch" aria-hidden="true" />
  </button>
);

// 2〜3択の切り替え
export const Seg = ({ items, value, onChange }) => (
  <div className={`seg${items.some((it) => it.icon) ? " col" : ""}`} role="radiogroup">
    {items.map((it) => (
      <button key={it.k} className={value === it.k ? "on" : ""} onClick={() => onChange(it.k)} role="radio" aria-checked={value === it.k}>
        {it.icon && <Icon name={it.icon} size={24} />}{it.label}
      </button>
    ))}
  </div>
);

// 押しているあいだだけ中身が見えるカード（テーブルで隣の人に画面を見られても、役とお題がばれない）
export function Secret({ label = "あなたの役とお題", hint = "押しているあいだだけ見える", children }) {
  const shot = useContext(ShotCtx);
  const [held, setHeld] = useState(false);
  const show = held || shot.peek;
  const on = (e) => { e.preventDefault(); setHeld(true); };
  const off = () => setHeld(false);
  return (
    <div className="secret" onPointerDown={on} onPointerUp={off} onPointerLeave={off} onPointerCancel={off}
      onContextMenu={(e) => e.preventDefault()} tabIndex={0}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setHeld(true); } }}
      onKeyUp={(e) => { if (e.key === " " || e.key === "Enter") setHeld(false); }}
      aria-label={`${label}（${hint}）`}>
      {show ? <div className="secret-open">{children}</div> : (
        <div className="secret-cover">
          <Icon name="eye" size={48} />
          <div><div className="secret-t">{label}</div><div className="secret-d">{hint}</div></div>
        </div>
      )}
    </div>
  );
}

// 残り時間。keeper（時計役の端末）だけが残り10秒のカウントとブザーを鳴らす。震えは全員
export function TimerBar({ left, total, keeper = false, labelL, labelR }) {
  const prev = useRef(left);
  useEffect(() => {
    const was = prev.current;
    prev.current = left;
    if (left === was) return;
    if (keeper && left > 0 && left <= 10) sfxTick(left === 1);
    if (left === 0 && was > 0) { if (keeper) sfxBuzzer(); buzz([200, 100, 200]); }
  }, [left, keeper]);
  const ratio = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const cls = left === 0 ? "over" : left <= 10 ? "danger" : left <= 60 ? "warn" : "";
  return (
    <div className={`timer ${cls}`} role="timer" aria-live="off">
      <div className="timer-top"><span>{labelL}</span><span>{labelR}</span></div>
      <div className="timer-num">{left === 0 ? "TIME UP" : fmt(left)}</div>
      <div className="timer-bar"><div className="timer-fill" style={{ width: `${ratio * 100}%` }} /></div>
    </div>
  );
}

// 主催者だけの強制操作は、たたんでおく（うっかり押さない）
export function HostMenu({ children, note }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hostmenu">
      <button className="btn btn-dark btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name="key" size={24} />{open ? "主催者メニューをとじる" : "主催者メニュー"}
      </button>
      {open && (
        <div className="hostmenu-body">
          {note && <div className="hostmenu-note">{note}</div>}
          {children}
        </div>
      )}
    </div>
  );
}

export const Redacted = () => (
  <span style={{ display: "inline-block", background: "#111", borderRadius: 3, width: "7em", height: "1.1em", verticalAlign: "middle" }} />
);

// たためるパネル（得点表など。最初は閉じておいて、見たい人だけ開く）
// note: 閉じているときに見出しの下に出す一行（いまの設定の要約など）
export function Fold({ head, icon, note, children, open: initial = false, headStyle }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="panel">
      <button className="fold-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="panel-head" style={{ flex: 1, marginBottom: 0, ...headStyle }}>{icon && <Icon name={icon} size={24} />}<span>{head}</span></span>
        <span style={{ fontSize: 18, color: "#7d5f10", width: 28, textAlign: "center" }}>{open ? "▲" : "▼"}</span>
      </button>
      {!open && note && <div className="panel-note center" style={{ marginTop: 8 }}>{note}</div>}
      {open && <div style={{ marginTop: 12 }}>{children}</div>}
    </div>
  );
}
