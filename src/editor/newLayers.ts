import { createId, getPixelSize, literalColor, type Layer, type TemplateProject } from '@domain'
import { uniqueName } from './naming'

export type NewLayerKind = 'photo' | 'text' | 'rectangle' | 'ellipse' | 'line'

export const NEW_LAYER_KINDS: readonly { kind: NewLayerKind; label: string }[] = [
  { kind: 'photo', label: 'Photo placeholder' },
  { kind: 'text', label: 'Text' },
  { kind: 'rectangle', label: 'Rectangle' },
  { kind: 'ellipse', label: 'Ellipse' },
  { kind: 'line', label: 'Line' }
]

/**
 * The capture slot a NEWLY ADDED photo placeholder gets: one more than the highest photoNumber in use.
 * ("Add Photo" creates a new slot.) Duplicating a photo does NOT use this: it preserves the number, which
 * is how two-up strips repeat the same slots.
 */
export function nextPhotoNumber(layers: readonly Layer[]): number {
  let max = 0
  for (const l of layers) if (l.type === 'photo') max = Math.max(max, l.photoNumber)
  return max + 1
}

/**
 * A new top-level layer, centered and sized relative to the design canvas so it is visible at any print
 * size. zIndex is a placeholder; `addLayer` puts it on top of its siblings.
 */
export function createNewLayer(
  project: TemplateProject,
  kind: NewLayerKind,
  createLayerId: () => string = createId
): Layer {
  const { width: W, height: H } = getPixelSize(project.canvas.print)
  const base = {
    id: createLayerId(),
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    visible: true,
    locked: false
  }
  const centered = (
    w: number,
    h: number
  ): { x: number; y: number; width: number; height: number } => ({
    x: Math.round((W - w) / 2),
    y: Math.round((H - h) / 2),
    width: w,
    height: h
  })
  const strokeWidth = Math.max(4, Math.round(Math.min(W, H) * 0.004))
  switch (kind) {
    case 'photo': {
      const w = Math.round(W * 0.7)
      const photoNumber = nextPhotoNumber(project.layers)
      return {
        ...base,
        type: 'photo',
        name: uniqueName(`Photo ${photoNumber}`, project.layers),
        ...centered(w, Math.round((w * 2) / 3)),
        photoNumber,
        fit: 'cover',
        frame: {
          style: 'solid',
          thickness: Math.max(6, Math.round(W * 0.005)),
          color: literalColor('#ffffff')
        },
        cornerRadius: 0
      }
    }
    case 'text': {
      const fontSize = Math.max(12, Math.round(H * 0.035))
      return {
        ...base,
        type: 'text',
        name: uniqueName('Text', project.layers),
        ...centered(Math.round(W * 0.7), Math.round(fontSize * 1.2)),
        content: 'Text',
        fontFamily: 'Helvetica',
        fontSize,
        fontWeight: 400,
        fontStyle: 'normal',
        align: 'center',
        lineHeight: 1.2,
        letterSpacing: 0,
        fill: literalColor('#222222')
      }
    }
    case 'rectangle':
    case 'ellipse': {
      const w = Math.round(W * 0.3)
      return {
        ...base,
        type: 'shape',
        name: uniqueName(kind === 'rectangle' ? 'Rectangle' : 'Ellipse', project.layers),
        ...centered(w, Math.round(w * 0.7)),
        shape: kind,
        fill: literalColor('#4a6fa5'),
        stroke: null,
        cornerRadius: 0
      }
    }
    case 'line':
      return {
        ...base,
        type: 'shape',
        name: uniqueName('Line', project.layers),
        ...centered(Math.round(W * 0.5), 0),
        shape: 'line',
        fill: null,
        stroke: { color: literalColor('#222222'), width: strokeWidth },
        cornerRadius: 0
      }
  }
}
