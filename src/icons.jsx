// ドット絵アイコン。図案は src/lib/iconArt.js（ここは描くだけ）。
// 大きさは 12 の倍数（24 / 36 / 48px）で使うと、にじまずに表示できる。
import { ICON_ART, ICON_COLORS } from "./lib/iconArt.js";

export function Icon({ name, size = 24, title, style, className = "" }) {
  const rows = ICON_ART[name] || ICON_ART.star;
  const cells = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < 12; x++) {
      const fill = ICON_COLORS[row[x]];
      if (fill) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
    }
  });
  return (
    <svg className={`px-icon ${className}`} width={size} height={size} viewBox="0 0 12 12" shapeRendering="crispEdges"
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} style={style}>
      {cells}
    </svg>
  );
}

// 全アイコンの見本（確認用の画面 ?shot=icons で使う）
export function IconSheet({ size = 48 }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
      {Object.keys(ICON_ART).map((n) => (
        <div key={n} style={{ background: "#F4EFE3", border: "3px solid #D4AF37", borderRadius: 10, padding: 6, textAlign: "center", color: "#111", fontSize: 12 }}>
          <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
            <Icon name={n} size={size} />
            <span style={{ background: "#141414", borderRadius: 6, padding: 2, display: "inline-flex" }}><Icon name={n} size={24} /></span>
          </div>
          {n}
        </div>
      ))}
    </div>
  );
}
