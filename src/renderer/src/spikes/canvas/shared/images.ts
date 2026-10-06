/** SPIKE (Phase 3A): repository-safe generated test images (no external assets). */
import { SAMPLE_ASSET_ID, STICKER_ASSET_ID } from './scene'

export type ImageMap = Record<string, HTMLImageElement>

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D context unavailable')
  return [c, ctx]
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = src
  })
}

export async function createTestImages(): Promise<ImageMap> {
  // Landscape 1600×900 gradient with a grid and a red/blue corner marker: shows cover-crop clearly.
  const [a, ca] = makeCanvas(1600, 900)
  const g = ca.createLinearGradient(0, 0, 1600, 900)
  g.addColorStop(0, '#3a6ea5')
  g.addColorStop(1, '#e8a23a')
  ca.fillStyle = g
  ca.fillRect(0, 0, 1600, 900)
  ca.strokeStyle = 'rgba(255,255,255,0.5)'
  ca.lineWidth = 4
  for (let x = 0; x <= 1600; x += 100) {
    ca.beginPath()
    ca.moveTo(x, 0)
    ca.lineTo(x, 900)
    ca.stroke()
  }
  for (let y = 0; y <= 900; y += 100) {
    ca.beginPath()
    ca.moveTo(0, y)
    ca.lineTo(1600, y)
    ca.stroke()
  }
  ca.fillStyle = '#c0392b'
  ca.fillRect(0, 0, 120, 120)
  ca.fillStyle = '#1b2a6b'
  ca.fillRect(1480, 780, 120, 120)

  // Transparent-background sticker 400×400: circle with a cross.
  const [s, cs] = makeCanvas(400, 400)
  cs.fillStyle = '#d35487'
  cs.beginPath()
  cs.arc(200, 200, 190, 0, Math.PI * 2)
  cs.fill()
  cs.strokeStyle = '#fff'
  cs.lineWidth = 24
  cs.beginPath()
  cs.moveTo(80, 200)
  cs.lineTo(320, 200)
  cs.moveTo(200, 80)
  cs.lineTo(200, 320)
  cs.stroke()

  const [sample, sticker] = await Promise.all([
    load(a.toDataURL('image/png')),
    load(s.toDataURL('image/png'))
  ])
  return { [SAMPLE_ASSET_ID]: sample, [STICKER_ASSET_ID]: sticker }
}

/** CSS `object-fit: cover` source rectangle for drawing `img` into a `w`×`h` box. */
export function coverSource(
  img: { width: number; height: number },
  w: number,
  h: number
): { sx: number; sy: number; sw: number; sh: number } {
  const scale = Math.max(w / img.width, h / img.height)
  const sw = w / scale
  const sh = h / scale
  return { sx: (img.width - sw) / 2, sy: (img.height - sh) / 2, sw, sh }
}
