/** SPIKE (Phase 3A): a photo placeholder as ONE Fabric object with custom rendering. */
import { Rect, type RectProps } from 'fabric'
import { coverSource } from '../shared/images'

export interface PhotoPlaceholderOptions {
  photoNumber: number
  border: number
  sample: HTMLImageElement | undefined
}

const TINTS = ['#e8544a', '#8bc34a', '#4db6ac', '#ba68c8']

export class PhotoPlaceholder extends Rect {
  photoNumber: number
  border: number
  sample: HTMLImageElement | undefined

  constructor(opts: PhotoPlaceholderOptions, rectOptions: Partial<RectProps> = {}) {
    super(rectOptions)
    this.photoNumber = opts.photoNumber
    this.border = opts.border
    this.sample = opts.sample
  }

  /** Called with the context already translated to the object's center and scaled. */
  override _render(ctx: CanvasRenderingContext2D): void {
    const w = this.width
    const h = this.height
    ctx.save()
    ctx.beginPath()
    ctx.rect(-w / 2, -h / 2, w, h)
    ctx.clip()
    if (this.sample) {
      const { sx, sy, sw, sh } = coverSource(this.sample, w, h)
      ctx.drawImage(this.sample, sx, sy, sw, sh, -w / 2, -h / 2, w, h)
    } else {
      ctx.fillStyle = TINTS[(this.photoNumber - 1) % TINTS.length] ?? '#999'
      ctx.fillRect(-w / 2, -h / 2, w, h)
    }
    ctx.restore()
    if (this.border > 0) {
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = this.border
      ctx.strokeRect(
        -w / 2 + this.border / 2,
        -h / 2 + this.border / 2,
        w - this.border,
        h - this.border
      )
    }
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.font = `700 ${Math.round(h * 0.4)}px Helvetica`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(this.photoNumber), 0, 0)
    ctx.font = `400 ${Math.round(h * 0.07)}px Helvetica`
    ctx.fillText(`Photo ${this.photoNumber}`, 0, h * 0.34)
  }
}
