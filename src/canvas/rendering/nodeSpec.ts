import type Konva from 'konva'
import { isEditable, type Layer, type Palette } from '@domain'
import { drawFittedImage, drawPhotoPlaceholder, type ImageSource } from './draw'
import { resolveColor } from './color'

/**
 * Library-facing description of how one domain layer is drawn. The interactive editor (react-konva
 * components) and the offscreen renderer both create nodes from these specs, so there is a single
 * definition of how each layer type looks. Only TYPES are imported from Konva here, so this module
 * is unit-testable without a canvas.
 *
 * Conventions: every node's origin is its box CENTER (`offset` = half size), so `x`/`y` are the
 * center in design space and rotation matches the domain definition (about the box center).
 */

export type NodeClass = 'Group' | 'Rect' | 'Ellipse' | 'Line' | 'Text' | 'Shape'

export interface NodeSpec {
  className: NodeClass
  config: Konva.NodeConfig
}

export type ImageLookup = (assetId: string) => ImageSource | undefined

export type PhotoMode = 'placeholder' | 'preview'

export interface RenderEnv {
  palette: Palette
  images: ImageLookup
  /** `preview` shows a layer's sample image (if it has one and it is loaded) instead of the placeholder. */
  photoMode: PhotoMode
  /** Editor nodes are draggable/hit-testable; offscreen render nodes are inert. */
  interactive: boolean
  /** Show the "PHOTO n" label (editor aid). */
  photoLabels: boolean
  editingTextId?: string | null
  allLayers: readonly Layer[]
}

export function fontStyleOf(l: { fontStyle: 'normal' | 'italic'; fontWeight: number }): string {
  return `${l.fontStyle === 'italic' ? 'italic ' : ''}${l.fontWeight}`
}

function base(layer: Layer, env: RenderEnv, insideGroup: boolean): Konva.NodeConfig {
  const editable = env.interactive && isEditable(env.allLayers, layer)
  return {
    id: layer.id,
    x: layer.x + layer.width / 2,
    y: layer.y + layer.height / 2,
    offsetX: layer.width / 2,
    offsetY: layer.height / 2,
    rotation: layer.rotation,
    opacity: layer.opacity,
    // Locked layers render but do not listen: clicks pass through to whatever is beneath.
    listening: editable,
    draggable: editable && !insideGroup
  }
}

const boxHit =
  (w: number, h: number) =>
  (ctx: Konva.Context, shape: Konva.Shape): void => {
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.closePath()
    ctx.fillStrokeShape(shape)
  }

/** Returns null for layers that must not be drawn (hidden). */
export function specFor(layer: Layer, env: RenderEnv, insideGroup = false): NodeSpec | null {
  if (!layer.visible) return null
  const common = base(layer, env, insideGroup)
  const color = (c: Parameters<typeof resolveColor>[1]): string => resolveColor(env.palette, c)

  switch (layer.type) {
    case 'photo': {
      const preview =
        env.photoMode === 'preview' && layer.sampleAssetId
          ? env.images(layer.sampleAssetId)
          : undefined
      const thickness = layer.frame.style === 'solid' ? layer.frame.thickness : 0
      const frameColor = layer.frame.style === 'solid' ? color(layer.frame.color) : '#ffffff'
      const { width, height } = layer
      return {
        className: 'Shape',
        config: {
          ...common,
          width,
          height,
          sceneFunc: (ctx: Konva.Context) =>
            drawPhotoPlaceholder(ctx._context, {
              width,
              height,
              photoNumber: layer.photoNumber,
              frameThickness: thickness,
              frameColor,
              cornerRadius: layer.cornerRadius,
              fit: layer.fit,
              preview,
              label: env.photoLabels
            }),
          hitFunc: boxHit(width, height)
        }
      }
    }
    case 'image': {
      const image = env.images(layer.assetId)
      const { width, height } = layer
      return {
        className: 'Shape',
        config: {
          ...common,
          width,
          height,
          sceneFunc: (ctx: Konva.Context) =>
            drawFittedImage(ctx._context, image, width, height, layer.fit),
          hitFunc: boxHit(width, height)
        }
      }
    }
    case 'text':
      return {
        className: 'Text',
        config: {
          ...common,
          text: layer.content,
          width: layer.width,
          fontFamily: layer.fontFamily,
          fontSize: layer.fontSize,
          fontStyle: fontStyleOf(layer),
          align: layer.align,
          lineHeight: layer.lineHeight,
          letterSpacing: layer.letterSpacing,
          fill: color(layer.fill),
          wrap: 'word',
          // While the HTML editor overlay is open the canvas text is hidden (no double drawing).
          visible: env.editingTextId !== layer.id
        }
      }
    case 'shape': {
      const fill = layer.fill ? color(layer.fill) : 'rgba(0,0,0,0)'
      const stroke = layer.stroke ? color(layer.stroke.color) : 'rgba(0,0,0,0)'
      const strokeWidth = layer.stroke ? layer.stroke.width : 0
      if (layer.shape === 'ellipse') {
        return {
          className: 'Ellipse',
          config: {
            ...common,
            offsetX: 0,
            offsetY: 0,
            radiusX: layer.width / 2,
            radiusY: layer.height / 2,
            fill,
            stroke,
            strokeWidth
          }
        }
      }
      if (layer.shape === 'line') {
        // A line runs horizontally through the middle of its box.
        return {
          className: 'Line',
          config: {
            ...common,
            points: [0, layer.height / 2, layer.width, layer.height / 2],
            stroke: layer.stroke ? stroke : color({ kind: 'literal', value: '#000000' }),
            strokeWidth: strokeWidth || 4,
            hitStrokeWidth: Math.max(strokeWidth, 40)
          }
        }
      }
      return {
        className: 'Rect',
        config: {
          ...common,
          width: layer.width,
          height: layer.height,
          cornerRadius: layer.cornerRadius,
          fill,
          stroke,
          strokeWidth
        }
      }
    }
    case 'group': {
      // A runtime container only; children carry absolute design coordinates, so it rests at identity.
      const editable = env.interactive && isEditable(env.allLayers, layer)
      return {
        className: 'Group',
        config: { id: layer.id, opacity: layer.opacity, listening: editable, draggable: editable }
      }
    }
  }
}
