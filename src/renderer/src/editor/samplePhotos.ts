import { ImageCache, type DecodedImage } from '@canvas/assets/imageCache'
import { BUILT_IN_SAMPLES } from '@editor/previewPhotos'

/**
 * Built-in sample photos, drawn procedurally at startup of the preview (original code: no third-party imagery, so no
 * licensing, privacy or repository-size concerns). They are generic scenes with people-shaped subjects near the
 * centre so a designer can judge face placement, crop and frame thickness. They are EDITOR aids only.
 */
interface Scene {
  sky: [string, string]
  ground: string
  sun: string
  people: { x: number; scale: number; skin: string; shirt: string }[]
}

const SCENES: Record<string, Scene> = {
  'sample-sunset': {
    sky: ['#ff9a5a', '#5b3a86'],
    ground: '#2a2338',
    sun: '#ffd27a',
    people: [
      { x: 0.42, scale: 1, skin: '#d9a07a', shirt: '#2b2d42' },
      { x: 0.58, scale: 0.95, skin: '#b9815b', shirt: '#c0392b' }
    ]
  },
  'sample-garden': {
    sky: ['#9ed8f5', '#e8f6ff'],
    ground: '#4f8a3a',
    sun: '#fff5b0',
    people: [{ x: 0.5, scale: 1.25, skin: '#e7b894', shirt: '#7a3b8f' }]
  },
  'sample-party': {
    sky: ['#2a1f4d', '#8a2d6e'],
    ground: '#1b1330',
    sun: '#ff6bd6',
    people: [
      { x: 0.3, scale: 0.9, skin: '#c98a62', shirt: '#2ecc71' },
      { x: 0.5, scale: 1, skin: '#f0c19b', shirt: '#f39c12' },
      { x: 0.7, scale: 0.9, skin: '#8d5a3b', shirt: '#3498db' }
    ]
  },
  'sample-beach': {
    sky: ['#79c8ff', '#d8f1ff'],
    ground: '#e8d29b',
    sun: '#fffbe0',
    people: [
      { x: 0.36, scale: 1.05, skin: '#d19a73', shirt: '#e74c3c' },
      { x: 0.64, scale: 1.05, skin: '#f1c8a5', shirt: '#16a085' }
    ]
  },
  'sample-city': {
    sky: ['#0b1026', '#3b4a86'],
    ground: '#14161f',
    sun: '#cfe3ff',
    people: [
      { x: 0.4, scale: 1, skin: '#c4875e', shirt: '#ecf0f1' },
      { x: 0.6, scale: 1, skin: '#e9bd98', shirt: '#34495e' }
    ]
  },
  'sample-studio': {
    sky: ['#d9d9de', '#f6f6f8'],
    ground: '#bdbdc6',
    sun: '#ffffff',
    people: [{ x: 0.5, scale: 1.3, skin: '#dca67f', shirt: '#1f6f8b' }]
  }
}

function drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, scene: Scene): void {
  const horizon = h * 0.62
  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, scene.sky[0])
  sky.addColorStop(1, scene.sky[1])
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)
  ctx.fillStyle = scene.ground
  ctx.fillRect(0, horizon, w, h - horizon)
  // sun / light source with a soft glow
  const g = ctx.createRadialGradient(
    w * 0.78,
    h * 0.28,
    0,
    w * 0.78,
    h * 0.28,
    Math.min(w, h) * 0.3
  )
  g.addColorStop(0, scene.sun)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // bokeh dots in the background
  for (let i = 0; i < 24; i++) {
    const x = ((i * 97) % 100) / 100
    const y = ((i * 53) % 55) / 100
    ctx.fillStyle = 'rgba(255,255,255,0.10)'
    ctx.beginPath()
    ctx.arc(x * w, y * h, Math.min(w, h) * (0.012 + ((i * 7) % 5) * 0.006), 0, Math.PI * 2)
    ctx.fill()
  }
  // people: head + shoulders, framed so faces sit around the upper-middle of the picture
  const unit = Math.min(w, h)
  for (const p of scene.people) {
    const cx = w * p.x
    const head = unit * 0.13 * p.scale
    const headY = h * 0.38
    ctx.fillStyle = scene.ground
    ctx.globalAlpha = 0.25
    ctx.beginPath()
    ctx.ellipse(cx, h * 0.93, head * 2.1, head * 0.35, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = p.shirt
    ctx.beginPath()
    ctx.ellipse(cx, headY + head * 3.2, head * 1.9, head * 2.4, 0, Math.PI, 0)
    ctx.rect(cx - head * 1.9, headY + head * 3.2, head * 3.8, h)
    ctx.fill()
    ctx.fillStyle = p.skin
    ctx.fillRect(cx - head * 0.35, headY + head * 0.8, head * 0.7, head * 1.2)
    ctx.beginPath()
    ctx.ellipse(cx, headY, head * 0.95, head * 1.15, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(30,20,20,0.85)'
    ctx.beginPath()
    ctx.ellipse(cx, headY - head * 0.55, head * 0.98, head * 0.62, 0, Math.PI, 0)
    ctx.fill()
    ctx.fillStyle = '#2b1d1d'
    for (const ex of [-0.35, 0.35]) {
      ctx.beginPath()
      ctx.arc(cx + head * ex, headY - head * 0.05, head * 0.07, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#7a2e2e'
    ctx.lineWidth = Math.max(2, head * 0.06)
    ctx.beginPath()
    ctx.arc(cx, headY + head * 0.3, head * 0.3, 0.15 * Math.PI, 0.85 * Math.PI)
    ctx.stroke()
  }
}

/** Pictures the user chose from disk this session (decoded; bytes never leave the renderer, never saved). */
const userPhotos = new Map<string, DecodedImage>()
export const registerUserPhoto = (id: string, image: DecodedImage): void => {
  userPhotos.set(id, image)
  previewCache.clear(id)
}
export const clearUserPhotos = (): void => {
  for (const img of userPhotos.values()) img.dispose?.()
  userPhotos.clear()
}

async function loadPreviewImage(key: string): Promise<DecodedImage> {
  const user = userPhotos.get(key)
  if (user) return user
  const info = BUILT_IN_SAMPLES.find((s) => s.id === key)
  const scene = SCENES[key]
  if (!info || !scene) throw new Error('Unknown sample photo')
  // Generated once at a modest size: enough for design judgement, cheap to draw and to keep in memory.
  const scale = 0.6
  const w = Math.round(info.width * scale)
  const h = Math.round(info.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  drawScene(ctx, w, h, scene)
  return { source: canvas, width: w, height: h }
}

/** Decoded sample pictures by sample id. Separate from the project image cache: samples are not project assets. */
export const previewCache = new ImageCache(loadPreviewImage)
