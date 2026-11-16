# Phase 6A validation helper: measures exported files (sizes, DPI, pixel comparisons) and prints JSON.
# Used by validate-6a.js. Needs Pillow. Run with `python3 -P` (script directory not added to the import path).
import io
import json
import sys
import zipfile

from PIL import Image, ImageChops


def load(path_or_bytes):
    img = Image.open(io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else path_or_bytes)
    img.load()
    return img


def facts(img):
    dpi = img.info.get("dpi")
    return {"w": img.width, "h": img.height, "mode": img.mode, "dpi": [round(d) for d in dpi] if dpi else None}


def diff_stats(a, b, box=None):
    a = a.convert("RGBA")
    b = b.convert("RGBA")
    if box:
        a = a.crop(box)
        b = b.crop(box)
    d = ImageChops.difference(a, b)
    hist_max = max(band_max for (_, band_max) in d.getextrema())
    # count pixels where any channel differs by more than 2
    px = sum(1 for p in d.getdata() if max(p) > 2)
    return {"max": hist_max, "over2": px}


def main():
    spec = json.loads(sys.argv[1])
    out = {"files": {}}
    imgs = {}
    for key, path in spec["pngs"].items():
        img = load(path)
        imgs[key] = img
        out["files"][key] = facts(img)
        out["files"][key]["px"] = {name: list(img.convert("RGBA").getpixel(tuple(xy))) for name, xy in spec.get("points", {}).get(key, {}).items()}

    p = imgs.get("print")
    d = imgs.get("design")
    if p and d:
        half = p.width // 2
        out["halves"] = diff_stats(p.crop((0, 0, half, p.height)), p.crop((half, 0, p.width, p.height)))
        out["leftVsDesign"] = diff_stats(p.crop((0, 0, half, p.height)), d)
    proof = imgs.get("proof")
    if proof and p:
        out["proofInsideSlots"] = [diff_stats(proof, p, tuple(b)) for b in spec["slotsOnSheet"]]
        out["proofOutsideSlots"] = [diff_stats(proof, p, tuple(b)) for b in spec["outsideOnSheet"]]

    z = spec.get("zip")
    if z:
        with zipfile.ZipFile(z) as zf:
            out["zipNames"] = zf.namelist()
            out["zipOk"] = zf.testzip() is None
            parts = {n: load(zf.read(n)) for n in zf.namelist() if n.endswith(".png")}
            out["manifest"] = json.loads(zf.read("manifest.json"))
            out["readme"] = zf.read("readme.txt").decode("utf-8")
        out["zipPngs"] = {n: facts(i) for n, i in parts.items()}
        alpha = {n: i.convert("RGBA").getchannel("A").getextrema() for n, i in parts.items()}
        out["alphaRange"] = {n: list(a) for n, a in alpha.items()}
        # Re-stack the bands (background, frames, overlay, text) and compare with design.png.
        stack = parts["background.png"].convert("RGBA")
        for name in ["frames.png", "overlay.png", "text.png"]:
            if name in parts:
                stack = Image.alpha_composite(stack, parts[name].convert("RGBA"))
        out["restackVsDesign"] = diff_stats(stack, parts["design.png"])
        if d:
            out["zipDesignVsDesign"] = diff_stats(parts["design.png"], d)
        out["zipPx"] = {
            name: list(parts[f].convert("RGBA").getpixel(tuple(xy)))
            for name, (f, xy) in spec.get("zipPoints", {}).items()
            if f in parts
        }
    print(json.dumps(out))


main()
