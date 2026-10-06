import type { FitMode } from '@domain'

/** Pure 2D-canvas drawing used identically by the interactive editor and the offscreen renderer. */

export interface ImageSource {
  source: CanvasImageSource
  width: number
  height: number
}

export interface FitRects {
  sx: number
  sy: number
  sw: number
  sh: number
  dx: number
  dy: number
  dw: number
  dh: number
}

/** Source and destination rectangles to draw an image of `src` size into a `box`, per fit mode. */
export function fitRect(
  src: { width: number; height: number },
  box: { width: number; height: number },
  fit: FitMode
): FitRects {
  if (fit === 'stretch') {
    return {
      sx: 0,
      sy: 0,
      sw: src.width,
      sh: src.height,
      dx: 0,
      dy: 0,
      dw: box.width,
      dh: box.height
    }
  }
  if (fit === 'cover') {
    const scale = Math.max(box.width / src.width, box.height / src.height)
    const sw = box.width / scale
    const sh = box.height / scale
    return {
      sx: (src.width - sw) / 2,
      sy: (src.height - sh) / 2,
      sw,
      sh,
      dx: 0,
      dy: 0,
      dw: box.width,
      dh: box.height
    }
  }
  const scale = Math.min(box.width / src.width, box.height / src.height)
  const dw = src.width * scale
  const dh = src.height * scale
  return {
    sx: 0,
    sy: 0,
    sw: src.width,
    sh: src.height,
    dx: (box.width - dw) / 2,
    dy: (box.height - dh) / 2,
    dw,
    dh
  }
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (radius === 0) {
    ctx.rect(x, y, w, h)
    return
  }
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Draws an image into a box (origin top-left). Unresolved images draw a visible "missing" marker. */
export function drawFittedImage(
  ctx: CanvasRenderingContext2D,
  image: ImageSource | undefined,
  width: number,
  height: number,
  fit: FitMode
): void {
  if (!image) {
    ctx.save()
    ctx.fillStyle = 'rgba(160,160,160,0.25)'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = 'rgba(120,120,120,0.8)'
    ctx.lineWidth = Math.max(2, Math.min(width, height) * 0.01)
    ctx.setLineDash([width * 0.03, width * 0.03])
    ctx.strokeRect(0, 0, width, height)
    ctx.restore()
    return
  }
  const r = fitRect(image, { width, height }, fit)
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, width, height)
  ctx.clip()
  ctx.drawImage(image.source, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh)
  ctx.restore()
}

export interface PhotoDrawSpec {
  width: number
  height: number
  photoNumber: number
  frameThickness: number
  frameColor: string
  cornerRadius: number
  fit: FitMode
  /** Preview mode: a picture shown in the placeholder. Never stored in the project. */
  preview?: ImageSource | undefined
  /** Show the "PHOTO n" label (editor/preview aid, not part of final artwork). */
  label: boolean
}

const TINTS = ['#e8544a', '#8bc34a', '#4db6ac', '#ba68c8', '#ffb74d', '#64b5f6']

/**
 * One drawing routine for a photo placeholder: tinted background (or preview picture), frame,
 * large photo number and optional label. Origin top-left, size width×height.
 */
export function drawPhotoPlaceholder(ctx: CanvasRenderingContext2D, s: PhotoDrawSpec): void {
  const { width: w, height: h } = s
  ctx.save()
  roundRectPath(ctx, 0, 0, w, h, s.cornerRadius)
  ctx.clip()
  if (s.preview) {
    const r = fitRect(s.preview, { width: w, height: h }, s.fit)
    ctx.drawImage(s.preview.source, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh)
  } else {
    ctx.fillStyle = TINTS[(s.photoNumber - 1) % TINTS.length] ?? '#999999'
    ctx.fillRect(0, 0, w, h)
    // light diagonal sheen so the placeholder reads as a "window", not a flat block
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, 'rgba(255,255,255,0.18)')
    g.addColorStop(1, 'rgba(0,0,0,0.10)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.restore()

  if (s.frameThickness > 0) {
    const t = s.frameThickness
    ctx.save()
    ctx.strokeStyle = s.frameColor
    ctx.lineWidth = t
    roundRectPath(ctx, t / 2, t / 2, w - t, h - t, Math.max(0, s.cornerRadius - t / 2))
    ctx.stroke()
    ctx.restore()
  }

  if (!s.preview) {
    ctx.save()
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.4)}px Helvetica, Arial, sans-serif`
    ctx.fillText(String(s.photoNumber), w / 2, h / 2)
    if (s.label) {
      ctx.font = `600 ${Math.round(Math.min(w, h) * 0.07)}px Helvetica, Arial, sans-serif`
      ctx.fillText(`PHOTO ${s.photoNumber}`, w / 2, h * 0.86)
    }
    ctx.restore()
  }
}
