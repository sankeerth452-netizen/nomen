"""Compose the Nomen marks from Bodoni Moda outlines (opsz 96).

Outputs to OUT_DIR:
  wordmark.svg  NOMEN, tracked capitals (currentColor)
  mark.svg      the swing-tag monogram: tag silhouette, eyelet, Didone N knocked out
  lockup.svg    mark + wordmark, with a fine thread from the eyelet
  icon.svg      favicon (the mark on its own)
  logo.json     rounded path data + geometry for the React <Logo /> component
usage: python compose.py FONT OUT_DIR
"""
import json
import os
import re
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

FONT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
INK, PAPER, WINE = "#161311", "#f6f2ec", "#7d2833"


def rnd(d: str) -> str:
    return re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.1f}".rstrip("0").rstrip("."), d)


def instance(wght, opsz):
    f = instantiateVariableFont(TTFont(FONT), {"opsz": opsz, "wght": wght})
    return f, f.getGlyphSet(), f.getBestCmap(), f["head"].unitsPerEm, f["OS/2"].sCapHeight


def glyph(gs, cmap, ch, scale, dx, base):
    """Path for one glyph, y-down, scaled; (dx, base) = where its origin and baseline go. Returns (d, xMin, xMax, yTop)."""
    g = gs[cmap[ord(ch)]]
    bp = BoundsPen(gs); g.draw(bp)
    xMin, yMin, xMax, yMax = bp.bounds
    pen = SVGPathPen(gs)
    g.draw(TransformPen(pen, (scale, 0, 0, -scale, dx, base)))
    return rnd(pen.getCommands()), dx + xMin * scale, dx + xMax * scale, base - yMax * scale, base - yMin * scale


# ── wordmark: NOMEN in tracked capitals, cap height = 100 units ──
f, gs, cmap, upm, cap = instance(560, 28)  # opsz 28: Didone contrast, hairlines that survive at small sizes
s = 100 / cap
TRACK = 30  # 0.3 cap heights: generous, couture spacing
x, parts, lo, hi, top, bot = 0.0, [], None, None, 0, 0
for i, ch in enumerate("NOMEN"):
    g = gs[cmap[ord(ch)]]
    bp = BoundsPen(gs); g.draw(bp)
    xMin = bp.bounds[0] * s
    if i == 0:
        x = -xMin  # first letter starts at x=0
    d, a, b, t, bo = glyph(gs, cmap, ch, s, x, 100)
    parts.append(d)
    lo = a if lo is None else min(lo, a); hi = b if hi is None else max(hi, b); top = min(top, t); bot = max(bot, bo)
    x += g.width * s + TRACK
word = {"d": " ".join(parts), "w": round(hi - lo, 1), "top": round(top, 1), "bottom": round(bot, 1)}

# ── mark: a swing tag (chamfered top corners), eyelet, Didone N knocked out ──
# Tag box 64 x 92, in a 100 x 100 square for the icon.
TAG = "M33 4H67L82 19V96H18V19Z"
EYE = (50, 18.5)
f6, gs6, cmap6, upm6, cap6 = instance(680, 14)  # sturdier cut so the N reads at favicon size
ns = 40 / cap6
gN = gs6[cmap6[ord("N")]]
bp = BoundsPen(gs6); gN.draw(bp)
nw = (bp.bounds[2] - bp.bounds[0]) * ns
nd, *_ = glyph(gs6, cmap6, "N", ns, 50 - nw / 2 - bp.bounds[0] * ns, 82)
mark = {"tag": TAG, "eye": EYE, "n": nd}

def mark_svg(tag_fill=INK, cut=PAPER, ring=True):
    ex, ey = EYE
    ring_el = f'<circle cx="{ex}" cy="{ey}" r="7" fill="none" stroke="{cut}" stroke-width="1.4"/>' if ring else ""
    return (f'<path d="{TAG}" fill="{tag_fill}"/>'
            f'<circle cx="{ex}" cy="{ey}" r="3.6" fill="{cut}"/>{ring_el}'
            f'<path d="{nd}" fill="{cut}"/>')

open(os.path.join(OUT, "mark.svg"), "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{mark_svg()}</svg>\n')
open(os.path.join(OUT, "icon.svg"), "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">{mark_svg(ring=False)}</svg>\n')
open(os.path.join(OUT, "wordmark.svg"), "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 {word["top"]} {word["w"]} {word["bottom"] - word["top"]}"><path d="{word["d"]}" fill="{INK}"/></svg>\n')

# ── lockup: mark scaled so the tag spans 1.5 cap heights, thread from the eyelet ──
TAG_H = 136  # tag from y=4..96 (92 units) mapped to ~1.36 cap heights
k = TAG_H / 92
GAP = 70
mx = 0
wx = (82 - 18) * k + GAP  # wordmark x after the tag (tag starts at x=18*k when translated by -18*k)
ty = -(TAG_H - 100) / 2 - 4 * k  # centre the tag on the cap height
ex, ey = (50 - 18) * k, ty + 18.5 * k
thread = f"M{ex:.1f} {ey:.1f}C{ex - 50:.1f} {ey - 74:.1f} {ex + 50:.1f} {ey - 74:.1f} {ex:.1f} {ey:.1f}"  # the hang-tag string loop
lock_w = wx + word["w"]
lockup = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 {ey - 60:.1f} {lock_w + 8:.1f} {(ty + 96 * k + 4) - (ey - 60):.1f}">'
          f'<path d="{thread}" fill="none" stroke="{WINE}" stroke-width="2.2" stroke-linecap="round"/>'
          f'<g transform="translate({-18 * k:.1f} {ty:.1f}) scale({k:.4f})">{mark_svg()}</g>'
          f'<g transform="translate({wx:.1f} 0)"><path d="{word["d"]}" fill="{INK}"/></g></svg>\n')
open(os.path.join(OUT, "lockup.svg"), "w").write(lockup)

json.dump({"word": word, "mark": mark, "lockup": {"k": round(k, 4), "wx": round(wx, 1), "ty": round(ty, 1), "thread": thread}},
          open(os.path.join(OUT, "logo.json"), "w"), indent=1)
print("wordmark", word["w"], "x", word["top"], word["bottom"], "| lockup width", round(lock_w, 1))
