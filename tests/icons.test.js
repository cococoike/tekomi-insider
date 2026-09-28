// ドット絵アイコンの点検：全部 12×12、使っている色が全部定義済み、空っぽの絵が無い
import { test } from "node:test";
import assert from "node:assert/strict";
import { ICON_ART, ICON_COLORS } from "../src/lib/iconArt.js";

test("アイコンは全部 12×12 で、知らない色を使っていない", () => {
  for (const [name, rows] of Object.entries(ICON_ART)) {
    assert.equal(rows.length, 12, `${name} の行数`);
    rows.forEach((row, y) => {
      assert.equal(row.length, 12, `${name} の ${y} 行目の長さ`);
      for (const ch of row) assert.ok(ch === "." || ICON_COLORS[ch], `${name} に知らない色 "${ch}"`);
    });
    const filled = rows.join("").replace(/\./g, "").length;
    assert.ok(filled >= 20, `${name} がほぼ空っぽ`);
  }
});
