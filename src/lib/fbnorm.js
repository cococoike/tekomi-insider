// Firebase Realtime Database の「保存のくせ」を再現する（mock DB とテストで使う）。
// 本番でだけ出る不具合を、手元の確認（npm run dev:mock）でも出すため。
//   ・null の値、空のオブジェクト {}、空の配列 [] は保存されない（読み戻すとキーごと消えている）
//   ・undefined を書こうとするとエラーになる
//   ・キーに . # $ / [ ] や制御文字が入っているとエラーになる（名前を得点表のキーにしているので要注意）

const BAD_KEY = /[.#$/[\]]/;

function badChar(k) {
  for (const ch of k) { const c = ch.charCodeAt(0); if (c < 32 || c === 127) return true; }
  return false;
}

export function validateForFirebase(value, path = "") {
  if (value === undefined) throw new Error(`Firebase: undefined は保存できない (${path || "/"})`);
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error(`Firebase: ${value} は保存できない (${path})`);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "" || BAD_KEY.test(k) || badChar(k)) throw new Error(`Firebase: キー "${k}" は使えない (${path}/${k})`);
      validateForFirebase(v, `${path}/${k}`);
    }
  }
}

// 保存して読み戻したときの形にする。消えるなら undefined を返す。
// 配列は Firebase の中では「0,1,2… をキーにしたオブジェクト」で、読み戻すときに
// キーが全部整数かつ半分以上埋まっていれば配列に戻る（SDK の val() と同じ規則）。
// たとえば qa が無い部屋に "qa/0" を書くと、読み戻しは [質問] の配列になる。
const INT_KEY = /^(0|[1-9]\d{0,9})$/;

export function normalizeLikeFirebase(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "object") return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) { // 配列も添字をキーにして同じ扱い
    const n = normalizeLikeFirebase(v);
    if (n !== undefined) out[k] = n;
  }
  const keys = Object.keys(out);
  if (!keys.length) return undefined;
  if (keys.every((k) => INT_KEY.test(k))) {
    const max = Math.max(...keys.map(Number));
    if (max < 2 * keys.length) {
      const arr = [];
      keys.forEach((k) => { arr[Number(k)] = out[k]; });
      return arr;
    }
  }
  return out;
}
