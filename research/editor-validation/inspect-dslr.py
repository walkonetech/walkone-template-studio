# Phase 6B validation helper: opens a dslrBooth template ZIP written by Template Studio and checks it the way dslrBooth
# would use it. Prints JSON. Needs Pillow. Run with `python3 -P`.
#  - archive: entry names/order, compression, template.xml BOM / CRLF / declaration, well-formed XML (ElementTree)
#  - attribute order per element vs. an optional reference sequence (read from a local fixture: names only, no values)
#  - "booth composite": stacks every <Image> by ZIndex, and fills every <Photo> box (rotated clockwise about its centre)
#    with a solid test colour at its ZIndex, i.e. what a booth photo would look like; then samples points
#  - "artwork composite": the same without photos, compared with Template Studio's own production PNG (design/print)
import io
import json
import math
import sys
import zipfile
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops, ImageDraw

PHOTO_FILL = (255, 0, 255, 255)


def diff_stats(a, b):
    a = a.convert("RGBA")
    b = b.convert("RGBA")
    d = ImageChops.difference(a, b)
    data = d.get_flattened_data() if hasattr(d, "get_flattened_data") else d.getdata()
    return {"max": max(m for (_, m) in d.getextrema()), "over2": sum(1 for p in data if max(p) > 2)}


def photo_polygon(left, top, w, h, deg):
    cx, cy = left + w / 2, top + h / 2
    a = math.radians(deg)
    pts = []
    for (x, y) in [(-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)]:
        pts.append((cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a)))
    return pts


def main():
    spec = json.loads(sys.argv[1])
    out = {}
    with zipfile.ZipFile(spec["zip"]) as zf:
        infos = zf.infolist()
        out["names"] = [i.filename for i in infos]
        out["allDeflated"] = all(i.compress_type == zipfile.ZIP_DEFLATED for i in infos)
        out["testzip"] = zf.testzip() is None
        raw = zf.read("template.xml")
        files = {n: zf.read(n) for n in out["names"]}
    out["bom"] = raw[:3] == b"\xef\xbb\xbf"
    text = raw[3:].decode("utf-8") if out["bom"] else raw.decode("utf-8")
    out["crlfOnly"] = "\n" in text and "\n" not in text.replace("\r\n", "")
    out["declaration"] = text.split("\r\n")[0]
    out["endsWithTemplate"] = text.endswith("</Template>")
    root = ET.fromstring(text.encode("utf-8"))
    out["root"] = dict(root.attrib)
    els = list(root.find("Elements"))
    out["elements"] = [{"type": e.tag, **e.attrib} for e in els]
    # attribute ORDER (ElementTree keeps document order in Python 3.8+)
    out["rootOrder"] = list(root.attrib.keys())
    out["elementOrders"] = sorted({e.tag + ":" + ",".join(e.attrib.keys()) for e in els})
    zs = [int(e.attrib["ZIndex"]) for e in els]
    out["descendingZ"] = zs == sorted(zs, reverse=True)
    out["uniqueZ"] = len(set(zs)) == len(zs)

    W, H = int(root.attrib["Width"]), int(root.attrib["Height"])
    out["pngSizes"] = {}
    for n, b in files.items():
        if n.endswith(".png"):
            im = Image.open(io.BytesIO(b))
            out["pngSizes"][n] = [im.width, im.height, [round(d) for d in im.info.get("dpi", (0, 0))]]

    def composite(with_photos):
        canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for e in sorted(els, key=lambda e: int(e.attrib["ZIndex"])):
            if e.tag == "Image":
                im = Image.open(io.BytesIO(files[e.attrib["ImagePath"]])).convert("RGBA")
                assert (im.width, im.height) == (int(e.attrib["Width"]), int(e.attrib["Height"]))
                layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                layer.paste(im, (int(e.attrib["Left"]), int(e.attrib["Top"])))
                canvas = Image.alpha_composite(canvas, layer)
            elif with_photos:
                layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
                ImageDraw.Draw(layer).polygon(
                    photo_polygon(int(e.attrib["Left"]), int(e.attrib["Top"]), int(e.attrib["Width"]),
                                  int(e.attrib["Height"]), float(e.attrib.get("Rotation", "0"))),
                    fill=PHOTO_FILL)
                canvas = Image.alpha_composite(canvas, layer)
        return canvas

    art = composite(False)
    booth = composite(True)
    out["artAlphaMin"] = art.getchannel("A").getextrema()[0]
    if spec.get("reference"):
        out["artVsReference"] = diff_stats(art, Image.open(spec["reference"]))
    out["points"] = {k: list(booth.getpixel(tuple(xy))) for k, xy in spec.get("points", {}).items()}
    if spec.get("save"):
        booth.convert("RGB").save(spec["save"])
    print(json.dumps(out))


main()
