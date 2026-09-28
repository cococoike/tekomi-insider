// この端末の記憶（端末ID・名前・主催者キー・効果音）。
//   本番: localStorage（ブラウザを閉じても残る）
//   確認用の dev:mock: sessionStorage（同じブラウザでもタブごとに別の人になれる。タブ4枚 = スマホ4台）
//   撮影モード（?shot=…）: メモリの中だけ（画面見本を並べても、互いに混ざらない）
const MOCK = import.meta.env?.VITE_MOCK === "1";
const SHOT = MOCK && typeof location !== "undefined" && /[?&]shot=/.test(location.search);
const memory = new Map();
const box = () => (SHOT ? null : MOCK ? sessionStorage : localStorage);

export const device = {
  get(k) { try { const b = box(); return b ? b.getItem(k) : (memory.has(k) ? memory.get(k) : null); } catch { return null; } },
  set(k, v) { try { const b = box(); if (b) b.setItem(k, v); else memory.set(k, String(v)); } catch { /* プライベートモード等 */ } },
  del(k) { try { const b = box(); if (b) b.removeItem(k); else memory.delete(k); } catch { /* noop */ } },
};
