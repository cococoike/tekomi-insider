/* eslint-disable react-refresh/only-export-components -- 確認用の入口（本番に入らない） */
// 撮影モード（dev:mock のときだけ動く）。
//   ?shot=<場面ID>  … その場面を偽のデータで開く（scenes.js）。動きは止めて最後の状態で描く
//   ?gallery        … 全場面をスマホの大きさで一覧（見比べ用）
//   ?shot=icons     … ドット絵アイコンの見本
import { createRoot } from "react-dom/client";
import App from "../App";
import { ShotCtx } from "../lib/shotctx";
import { seedMock, setOffline } from "../lib/db";
import { device } from "../lib/device";
import { setSound } from "../lib/sound";
import { Shell } from "../ui";
import { IconSheet } from "../icons";
import { SCENES, LB } from "./scenes";

const STILL = `*, *::before, *::after { animation-duration:0s !important; animation-delay:0s !important; transition:none !important; }`;

// extra: 画面がそろってから、さらに待つ時間（圏外の帯は切れて1.5秒たってから出るので、その場面は長めに）
function markReadyWhen(expect, extra = 0) {
  const t0 = Date.now();
  const id = setInterval(() => {
    const ok = !expect || document.body.dataset.screen === expect;
    const fonts = !document.fonts || document.fonts.status === "loaded";
    if ((ok && fonts) || Date.now() - t0 > 8000) {
      clearInterval(id);
      setTimeout(() => { document.body.dataset.shot = ok ? "ready" : "timeout"; }, 150 + extra);
    }
  }, 60);
}

function Gallery() {
  return (
    <div style={{ background: "#222", minHeight: "100vh", padding: 16, fontFamily: "sans-serif" }}>
      <div style={{ color: "#fff", fontSize: 18, marginBottom: 12 }}>てこみン 全画面の見本（{SCENES.length + 1}枚）— 画像をクリックすると大きく開く</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        {[...SCENES, { id: "icons", title: "ドット絵アイコン" }].map((s) => (
          <a key={s.id} href={`?shot=${s.id}`} target="_blank" rel="noreferrer" style={{ color: "#ddd", textDecoration: "none", fontSize: 12 }}>
            <div style={{ width: 234, height: 506, overflow: "hidden", borderRadius: 10, border: "2px solid #555", background: "#000" }}>
              <iframe title={s.id} src={`?shot=${s.id}`} loading="lazy" style={{ width: 390, height: 844, border: 0, transform: "scale(.6)", transformOrigin: "0 0", pointerEvents: "none" }} />
            </div>
            <div style={{ width: 234, marginTop: 4 }}>{s.id}<br />{s.title}</div>
          </a>
        ))}
      </div>
    </div>
  );
}

export function mountShot(el, params) {
  // 画面のエラーを拾っておく（npm run shots が一覧に出す）
  window.__errs = [];
  window.addEventListener("error", (e) => window.__errs.push(e.message));
  window.addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason?.message || e.reason)));
  const root = createRoot(el);
  window.__shotIds = [...SCENES.map((s) => s.id), "icons"];
  if (params.has("gallery")) { root.render(<Gallery />); return; }
  const id = params.get("shot");
  const style = document.createElement("style");
  style.textContent = STILL;
  document.head.appendChild(style);
  setSound(false);
  if (id === "icons") {
    root.render(<Shell><div className="mp-h">ドット絵アイコン</div><IconSheet /></Shell>);
    markReadyWhen(null);
    return;
  }
  const sc = SCENES.find((s) => s.id === id);
  if (!sc) { root.render(<div style={{ color: "#fff", padding: 20 }}>場面 {id} は無い</div>); return; }
  device.set("tekomi_uid", sc.as || "me1");
  device.set("tekomi_name", sc.name || "てこ");
  if (sc.host) device.set("tekomi_host", "1");
  const rooms = { __gate__: { open: sc.gate !== false } };
  if (sc.room) rooms.main = sc.room;
  seedMock({ rooms, leaderboard: sc.lb || LB }).then(() => { if (sc.offline) setTimeout(() => setOffline(true), 400); });
  root.render(
    <ShotCtx.Provider value={{ peek: !!sc.peek, revealed: !!sc.revealed }}>
      <App shot={{ screen: sc.screen, guideTab: sc.guideTab, stay: sc.expect === "home" }} />
    </ShotCtx.Provider>,
  );
  markReadyWhen(sc.expect, sc.offline ? 2400 : 0);
}
