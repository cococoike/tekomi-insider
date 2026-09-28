"""てこみんのドット絵から、タブのアイコン（favicon.svg）とスマホのホーム画面用（apple-touch-icon.png）を作る。
ui.jsx の OwlDoc と同じ図案。作り直すときは: python scripts/make-icons.py  （Pillow が必要）"""
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public")
PX = {"W": "#F4F1EA", "K": "#1E1E1E", "G": "#D4AF37", "S": "#F6D9B8", "E": "#141414", "H": "#ffffff"}
BASE = [
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
]
FACE = [(4, 9, 2, 2, "E"), (10, 9, 2, 2, "E"), (4, 9, 1, 1, "H"), (10, 9, 1, 1, "H"), (6, 12, 4, 1, "E")]


def cells():
    out = []
    for y, row in enumerate(BASE):
        for x, ch in enumerate(row):
            if ch in PX:
                out.append((x, y, 1, 1, PX[ch]))
    for x, y, w, h, k in FACE:
        out.append((x, y, w, h, PX[k]))
    return out


# SVG（黒い角丸の地にてこみん）
rects = "".join(f'<rect x="{x + 2}" y="{y + 2}" width="{w}" height="{h}" fill="{c}"/>' for x, y, w, h, c in cells())
svg = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" shape-rendering="crispEdges">'
       '<rect width="20" height="20" rx="4" fill="#111"/>' + rects + "</svg>")
open(os.path.join(ROOT, "favicon.svg"), "w", encoding="utf-8", newline="\n").write(svg)

# PNG 180×180（iPhone の「ホーム画面に追加」用）
try:
    from PIL import Image, ImageDraw
    scale = 9
    im = Image.new("RGB", (180, 180), "#111111")
    d = ImageDraw.Draw(im)
    for x, y, w, h, c in cells():
        d.rectangle([(x + 2) * scale, (y + 2) * scale, (x + 2 + w) * scale - 1, (y + 2 + h) * scale - 1], fill=c)
    im.save(os.path.join(ROOT, "apple-touch-icon.png"))
except ImportError:
    print("Pillow が無いので PNG は作らなかった")
print("ok")
