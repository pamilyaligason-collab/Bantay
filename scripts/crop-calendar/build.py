"""Build src/data/cropCalendar.json from the PCAARRD Vegetable Planting Calendar (Info Bulletin 200/2000).

Usage: python -I scripts/crop-calendar/build.py <path-to-pdf> [out.json]
Needs Pillow + pypdf. The PDF is NOT committed (12 MB scan, no text layer).

Method (deterministic, no OCR):
1. Each page is one CMYK JPEG saved with Adobe inversion: invert every channel, then convert to RGB.
2. Grid lines are black (max(R,G,B) < LINE_MAX). Vertical lines come from a column darkness profile,
   horizontal lines from a row profile inside the month columns; the 13 month boundaries are snapped
   to detected lines (fold crease and scan skew tolerated) with an equal-spacing fallback.
3. A cell is a PLANTING month when its inner area (middle half in both directions, so lines and the
   fold crease are excluded) has mean HSV saturation >= SAT_MIN. Each type is tinted in its own
   colour (1 yellow, 2 green, 3 cyan, 4 magenta); blank cells are paper white (saturation < 0.05).
   Saturation is used, not a hue test, so the same rule serves all four tints.
4. Row labels are not machine-readable: they are typed below and the row count per table is asserted
   against the detected grid, so a missed or extra row stops the build.
"""
import json
import sys
import warnings

warnings.simplefilter("ignore")
from PIL import Image, ImageChops
from pypdf import PdfReader

LINE_MAX = 150  # grid lines are near-black; every tint has a channel above this
SAT_MIN = 0.12  # filled cells measure > 0.2, blanks < 0.05 (gap checked in the printed report)

BASE = ["Bitter gourd", "Bottle gourd", "Cabbage", "Carrot", "Cauliflower", "Celery", "Chayote", "Cowpea",
        "Cucumber", "Eggplant", "Garden pea", "Garlic", "Hyacinth bean", "Kutsai", "Lettuce", "Lima bean",
        "Melon", "Musk melon", "Mustard", "Okra"]
TAIL = ["Pechay", "Pigeon pea", "Radish", "Snap bean", "Spinach", "Sponge gourd", "Squash"]
END = ["Sweet pepper", "Tomato", "Waterleaf", "Watermelon", "Wax gourd", "Winged bean", "Yam bean", "Yardlong bean"]
NAMES = {
    "1": BASE + ["Onion"] + TAIL + END,
    "2": BASE + ["Onion"] + TAIL + ["Sugar beet"] + END,
    "3": BASE + ["Onion (big bulb)", "Onion (small bulb)"] + TAIL + ["Sugar beet"] + END,
    "4": BASE + ["Onion"] + TAIL + END,
}
# Only names I am sure of; everything else stays null.
TAGALOG = {
    "Bitter gourd": "ampalaya", "Bottle gourd": "upo", "Cabbage": "repolyo", "Carrot": "karot",
    "Chayote": "sayote", "Cucumber": "pipino", "Eggplant": "talong", "Squash": "kalabasa", "Okra": "okra",
    "Pechay": "pechay", "Mustard": "mustasa", "Sponge gourd": "patola", "Winged bean": "sigarilyas",
    "Radish": "labanos", "Tomato": "kamatis", "Onion": "sibuyas", "Onion (big bulb)": "sibuyas",
    "Onion (small bulb)": "sibuyas", "Garlic": "bawang", "Lettuce": "letsugas", "Yam bean": "singkamas",
    "Yardlong bean": "sitaw", "Watermelon": "pakwan", "Wax gourd": "kundol", "Lima bean": "patani",
}
# page index, x-range that holds the whole table (label column to right frame)
TABLES = {"1": (1, 900, 2070), "2": (1, 2130, 3290), "3": (0, 50, 1260), "4": (0, 1320, 2480)}


def runs(vals, thr):
    out, s = [], None
    for i, v in enumerate(vals):
        if v >= thr and s is None:
            s = i
        if v < thr and s is not None:
            out.append((s, i - 1))
            s = None
    if s is not None:
        out.append((s, len(vals) - 1))
    return out


def merge(mids, gap):
    out = []
    for m in mids:
        if out and m - out[-1] < gap:
            out[-1] = (out[-1] + m) / 2
        else:
            out.append(m)
    return out


def page_rgb(reader, pi):
    im = reader.pages[pi].images[0].image
    return Image.merge("CMYK", [ImageChops.invert(b) for b in im.split()]).convert("RGB")


def grid(rgb, x0, x1, n_rows, label):
    r, g, b = rgb.split()
    black = ImageChops.lighter(r, ImageChops.lighter(g, b)).point(lambda v: 255 if v < LINE_MAX else 0)
    h = rgb.size[1]
    col = list(black.crop((x0, 200, x1, 1560)).resize((x1 - x0, 1), Image.BOX).get_flattened_data())
    vl = merge([(a + b_) / 2 + x0 for a, b_ in runs(col, 0.30 * 255)], 20)
    assert len(vl) >= 13, f"type {label}: only {len(vl)} vertical lines"
    left, right = vl[-13], vl[-1]  # the 13 month boundaries; extra lines to the left are the frame or noise
    xs, snapped = [], 0
    for i in range(13):
        ideal = left + (right - left) * i / 12
        near = min(vl, key=lambda v: abs(v - ideal))
        if abs(near - ideal) <= 15:
            xs.append(near)
            snapped += 1
        else:
            xs.append(ideal)
    assert snapped >= 10, f"type {label}: only {snapped}/13 month lines snapped"
    row = list(black.crop((int(left) + 8, 0, int(right) - 8, h)).resize((1, h), Image.BOX).get_flattened_data())
    hl = merge([(a + b_) / 2 for a, b_ in runs(row, 0.3 * 255)], 12)
    ys = hl[-(n_rows + 1):]
    assert len(hl) >= n_rows + 2 and len(ys) == n_rows + 1, f"type {label}: {len(hl)} horizontal lines for {n_rows} rows"
    hs = sorted(ys[i + 1] - ys[i] for i in range(n_rows))
    med = hs[len(hs) // 2]
    assert hs[0] > 0.6 * med and hs[-1] < 1.6 * med, f"type {label}: uneven rows {hs[0]:.0f}..{hs[-1]:.0f}"
    return xs, ys


def saturation(rgb, box):
    px = rgb.crop(box).resize((1, 1), Image.BOX).getpixel((0, 0))
    mx, mn = max(px), min(px)
    return (mx - mn) / mx if mx else 0.0


def main():
    pdf = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "src/data/cropCalendar.json"
    reader = PdfReader(pdf)
    pages = {}
    result = {"source": "PCAARRD (DOST), Vegetable Planting Calendar, data from the Bureau of Plant Industry",
              "bulletin": "Information Bulletin No. 200/2000", "year": 2000, "types": {}}
    sats = []
    for t, (pi, x0, x1) in TABLES.items():
        rgb = pages.setdefault(pi, page_rgb(reader, pi))
        names = NAMES[t]
        xs, ys = grid(rgb, x0, x1, len(names), t)
        crops = []
        for ri, name in enumerate(names):
            months = []
            ya, yb = ys[ri], ys[ri + 1]
            for m in range(12):
                xa, xb = xs[m], xs[m + 1]
                box = (int(xa + (xb - xa) * 0.25), int(ya + (yb - ya) * 0.25),
                       int(xb - (xb - xa) * 0.25), int(yb - (yb - ya) * 0.25))
                s = saturation(rgb, box)
                sats.append(s)
                if s >= SAT_MIN:
                    months.append(m + 1)
            crops.append({"name": name, "tagalog": TAGALOG.get(name), "months": months})
        result["types"][t] = {"crops": crops}
    lo = max(s for s in sats if s < SAT_MIN)
    hi = min(s for s in sats if s >= SAT_MIN)
    print(f"cells {len(sats)}; blank max saturation {lo:.3f}, filled min saturation {hi:.3f}, threshold {SAT_MIN}")
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(result, f, indent=1, ensure_ascii=False)
        f.write("\n")


if __name__ == "__main__":
    main()
