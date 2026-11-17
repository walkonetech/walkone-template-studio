# DSLR Booth importer validation helper. Needs Pillow. Run with `python3 -P`. Prints JSON.
#  make  <zip>      writes a SYNTHETIC dslrBooth-style template ZIP (two 2x6 strips on a 4x6 @300 sheet, made-up artwork,
#                   one unknown attribute) plus its preview.png drawn the way dslrBooth draws previews (numbered boxes)
#  compare <json>   compares Template Studio's render of an imported template with the template's own preview.png,
#                   OUTSIDE the photo boxes (placeholders are drawn differently on purpose): both flattened on white
import io
import json
import math
import sys
import zipfile
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageDraw

W, H, STRIP = 1200, 1800, 600
BOXES = [(37, 84, 526, 350), (37, 520, 526, 350), (37, 956, 526, 350)]  # left strip, photos 1..3
RIGHT_DX = [600, 597, 602]  # hand-placed copies: a few pixels off, like real files
BOX_COLORS = [(232, 84, 74, 255), (139, 195, 74, 255), (77, 182, 172, 255)]


def png_bytes(img):
    b = io.BytesIO()
    img.save(b, "PNG")
    return b.getvalue()


def make(path):
    # background strip: vertical gradient with stripes (asymmetric so a wrong flip/offset shows)
    bg = Image.new("RGBA", (STRIP, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):
        d.line([(0, y), (STRIP, y)], fill=(40 + y * 120 // H, 30, 90 - y * 60 // H, 255))
    for x in range(0, STRIP, 60):
        d.rectangle([x, 0, x + 12, H], fill=(250, 220, 120, 255))
    # frame overlay with transparent windows over the photos, plus a title band
    ov = Image.new("RGBA", (STRIP, H), (255, 255, 255, 0))
    d = ImageDraw.Draw(ov)
    for (x, y, w, h) in BOXES:
        d.rectangle([x - 14, y - 14, x + w + 14, y + h + 14], outline=(255, 255, 255, 255), width=14)
    d.rectangle([40, 1400, STRIP - 40, 1700], fill=(255, 255, 255, 230))
    d.ellipse([200, 1460, 400, 1640], fill=(200, 160, 64, 255))
    # a small badge (scaled down 2x when placed)
    badge = Image.new("RGBA", (400, 160), (0, 0, 0, 0))
    ImageDraw.Draw(badge).rounded_rectangle([0, 0, 399, 159], 30, fill=(32, 48, 74, 255))

    elements = []  # (tag, attrs) in ascending z
    z = 0

    def img(name, file, left, top, w, h, extra=None):
        nonlocal z
        a = dict(Name=name, Opacity="100", ShadowEnabled="False", ShadowColor="#FF000000", ShadowDepth="10",
                 ShadowRadius="20", ShadowDirection="-45", Width=str(w), Height=str(h), Top=str(top),
                 Left=str(left), ImagePath=file, KeepAspect="True", Thickness="0", StrokeColor="#FF000000",
                 ZIndex=str(z), IsLocked="True")
        if extra:
            a.update(extra)
        elements.append(("Image", a))
        z += 1

    def photo(n, left, top, w, h, copy):
        nonlocal z
        a = dict(Name=f"Photo {n}{' Copy' if copy else ''}", Opacity="100", ShadowEnabled="False",
                 ShadowColor="#FF000000", ShadowDepth="10", ShadowRadius="20", ShadowDirection="-45",
                 Width=str(w), Height=str(h), Top=str(top), Left=str(left), ImagePath="", KeepAspect="True",
                 Thickness="0", StrokeColor="#FF000000", PhotoNumber=str(n), ZIndex=str(z), IsLocked="True")
        elements.append(("Photo", a))
        z += 1

    img("Strip BG", "strip-bg.png", -3, 0, STRIP, H)
    img("Strip BG Copy", "strip-bg.png", 598, 0, STRIP, H)
    for i, (x, y, w, h) in enumerate(BOXES):
        photo(i + 1, x, y, w, h, False)
        photo(i + 1, x + RIGHT_DX[i], y, w, h, True)
    img("Frames", "frames.png", 0, 0, STRIP, H, {"GlowAmount": "3"})  # an attribute dslrBooth never wrote
    img("Frames Copy", "frames.png", 600, 0, STRIP, H)
    img("Badge Copy", "badge.png", 100, 1180, 400, 160)
    img("Badge", "badge.png", 700, 1180, 400, 160)

    # preview.png the way dslrBooth draws one: everything in z order, photos as coloured boxes
    files = {"strip-bg.png": bg, "frames.png": ov, "badge.png": badge}
    prev = Image.new("RGBA", (W, H), (0x21, 0x1F, 0x1F, 255))
    for tag, a in elements:
        left, top, w, h = (int(a[k]) for k in ("Left", "Top", "Width", "Height"))
        if tag == "Photo":
            ImageDraw.Draw(prev).rectangle([left, top, left + w - 1, top + h - 1],
                                           fill=BOX_COLORS[int(a["PhotoNumber"]) - 1])
        else:
            src = files[a["ImagePath"]].resize((w, h), Image.LANCZOS)
            layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            layer.paste(src, (left, top))
            prev = Image.alpha_composite(prev, layer)

    root_attrs = [("Name", "Synthetic Two Strips"), ("Width", str(W)), ("Height", str(H)), ("Dimensions", "0"),
                  ("Resolution", "300"), ("BackgroundColor", "#FF211F1F"), ("print_2_per_page", "False"),
                  ("PrintToSecondaryPrinter", "False"), ("LastSavedDate", "11/17/2026 08:00:00"),
                  ("Id", "SyntheticTemplateIdAbcdef"), ("IsLegacy", "True"), ("OriginalDevice", "TEST-PC")]
    esc = lambda v: v.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             "<Template " + " ".join(f'{k}="{esc(v)}"' for k, v in root_attrs) + ">", "  <Elements>"]
    for tag, a in reversed(elements):
        lines.append(f"    <{tag} " + " ".join(f'{k}="{esc(v)}"' for k, v in a.items()) + " />")
    lines += ["  </Elements>", "</Template>"]
    xml = ("﻿" + "\r\n".join(lines)).encode("utf-8")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z_:
        for name in sorted(["template.xml", "preview.png", *files], key=str.lower):
            data = xml if name == "template.xml" else png_bytes(prev if name == "preview.png" else files[name])
            z_.writestr(name, data)
    print(json.dumps({"ok": True, "elements": len(elements)}))


def photo_polygon(left, top, w, h, deg, grow):
    cx, cy = left + w / 2, top + h / 2
    a = math.radians(deg)
    pts = []
    for (dx, dy) in [(-w / 2 - grow, -h / 2 - grow), (w / 2 + grow, -h / 2 - grow), (w / 2 + grow, h / 2 + grow),
                     (-w / 2 - grow, h / 2 + grow)]:
        pts.append((cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)))
    return pts


def reconstruct(z, root):
    """A plain rebuild of the template straight from its XML (images by ZIndex, KeepAspect = fit inside the box,
    rotation about the box centre), as an independent yardstick: how close can anything get to dslrBooth's preview?"""
    W, H = int(root.get("Width")), int(root.get("Height"))
    c = root.get("BackgroundColor", "#FFFFFFFF")
    canvas = Image.new("RGBA", (W, H), (int(c[3:5], 16), int(c[5:7], 16), int(c[7:9], 16), int(c[1:3], 16)))
    for e in sorted(root.find("Elements"), key=lambda e: int(e.get("ZIndex"))):
        if e.tag != "Image":
            continue
        L, T, w, h = (int(e.get(k)) for k in ("Left", "Top", "Width", "Height"))
        src = Image.open(io.BytesIO(z.read(e.get("ImagePath")))).convert("RGBA")
        sw, sh = src.size
        if e.get("KeepAspect") == "True":
            s = min(w / sw, h / sh)
            dw, dh = sw * s, sh * s
        else:
            dw, dh = w, h
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        layer.paste(src.resize((max(1, round(dw)), max(1, round(dh))), Image.BILINEAR),
                    (round((w - dw) / 2), round((h - dh) / 2)))
        rot = float(e.get("Rotation", "0") or 0)
        if rot % 360:
            layer = layer.rotate(-rot, resample=Image.BICUBIC, expand=True)
        full = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        full.paste(layer, (round(L + w / 2 - layer.width / 2), round(T + h / 2 - layer.height / 2)))
        canvas = Image.alpha_composite(canvas, full)
    return canvas


def on_white(img):
    base = Image.new("RGBA", img.size, (255, 255, 255, 255))
    return Image.alpha_composite(base, img.convert("RGBA")).convert("RGB")


def compare(spec):
    with zipfile.ZipFile(spec["zip"]) as z:
        root = ET.fromstring(z.read("template.xml").decode("utf-8-sig").encode("utf-8"))
        preview = Image.open(io.BytesIO(z.read("preview.png")))
        preview.load()
        rebuilt = reconstruct(z, root) if spec.get("reconstruct") else None
    render = Image.open(spec["render"])
    out = {"previewSize": list(preview.size), "renderSize": list(render.size)}
    if preview.size != render.size:
        out["error"] = "size mismatch"
        print(json.dumps(out))
        return
    mask = Image.new("L", preview.size, 255)
    d = ImageDraw.Draw(mask)
    grow = spec.get("grow", 3)
    photos = 0
    for e in root.find("Elements"):
        if e.tag != "Photo":
            continue
        photos += 1
        a = e.attrib
        d.polygon(photo_polygon(float(a["Left"]), float(a["Top"]), float(a["Width"]), float(a["Height"]),
                                float(a.get("Rotation", "0") or 0), grow), fill=0)
    a, b = on_white(preview), on_white(render)
    mm = mask.load()
    if rebuilt is not None:
        dr = ImageChops.difference(a, on_white(rebuilt)).convert("L").load()
        tot = acc = 0
        for y in range(preview.size[1]):
            for x in range(preview.size[0]):
                if mm[x, y]:
                    tot += 1
                    acc += dr[x, y]
        out["reconstructMean"] = round(acc / max(tot, 1), 3)
    diff = ImageChops.difference(a, b).convert("L")  # mean of channels
    dd = diff.load()
    def stats(x0, x1):
        total = big = s = 0
        for y in range(preview.size[1]):
            for x in range(x0, x1):
                if mm[x, y] == 0:
                    continue
                v = dd[x, y]
                total += 1
                s += v
                if v > 32:
                    big += 1
        return total, round(s / max(total, 1), 3), round(100 * big / max(total, 1), 3)

    total, mean, over = stats(0, preview.size[0])
    out.update({"photos": photos, "compared": total, "meanDiff": mean, "pctOver32": over})
    if spec.get("halves"):
        half = preview.size[0] // 2
        edge = spec.get("edge", 0)  # leave out this many px each side of the middle (where copies overlap)
        _, lm, lo = stats(0, half - edge)
        _, rm, ro = stats(half + edge, preview.size[0])
        out.update({"left": {"meanDiff": lm, "pctOver32": lo}, "right": {"meanDiff": rm, "pctOver32": ro}})
    if spec.get("save"):
        heat = Image.eval(diff, lambda v: min(255, v * 4))
        heat.save(spec["save"])
    print(json.dumps(out))


if __name__ == "__main__":
    if sys.argv[1] == "make":
        make(sys.argv[2])
    else:
        compare(json.loads(sys.argv[2]))
