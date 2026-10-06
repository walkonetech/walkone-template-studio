/** SPIKE (Phase 3A): the identical test scene for both engines, built from the real domain model. */
import { createProject, type Layer, type TemplateProject } from '@domain/index'
import { literalColor } from '@domain/index'

export const DESIGN = { width: 2400, height: 3600 } as const
export const SAMPLE_ASSET_ID = 'asset-sample'
export const STICKER_ASSET_ID = 'asset-sticker'

const base = {
  rotation: 0,
  opacity: 1,
  visible: true,
  locked: false
}

function photo(
  id: string,
  n: number,
  x: number,
  y: number,
  z: number,
  rotation = 0,
  extra: Partial<Layer> = {}
): Layer {
  return {
    ...base,
    id,
    type: 'photo',
    name: `Photo ${n}`,
    x,
    y,
    width: 1900,
    height: 880,
    rotation,
    zIndex: z,
    photoNumber: n,
    fit: 'cover',
    frame: { style: 'solid', thickness: 12, color: literalColor('#ffffff') },
    cornerRadius: 0,
    ...extra
  } as Layer
}

/** 4×6 portrait @600 DPI: 2400×3600 design px. */
export function createSpikeProject(): TemplateProject {
  const p = createProject({
    name: 'Canvas Spike',
    design: 'photo-4x6-portrait-600',
    createId: counter('p')
  })
  p.canvas.backgroundColor = literalColor('#efe9df')
  p.assets.push(
    {
      id: SAMPLE_ASSET_ID,
      filename: 'sample.png',
      mediaType: 'image/png',
      path: 'assets/sample.png',
      source: { kind: 'upload' }
    },
    {
      id: STICKER_ASSET_ID,
      filename: 'sticker.png',
      mediaType: 'image/png',
      path: 'assets/sticker.png',
      source: { kind: 'upload' }
    }
  )
  p.layers = [
    // bottom → top by zIndex
    {
      ...base,
      id: 'accent',
      type: 'shape',
      name: 'Accent bar',
      x: -200,
      y: 3050,
      width: 1100,
      height: 90,
      zIndex: 0,
      shape: 'rectangle',
      fill: literalColor('#b08d57'),
      stroke: null,
      cornerRadius: 0
    } as Layer, // partly off-canvas to the left
    photo('photo-1', 1, 250, 200, 1, 3),
    photo('photo-2', 2, 250, 1180, 2, 0, { sampleAssetId: SAMPLE_ASSET_ID }),
    photo('photo-3', 3, 250, 2160, 3),
    {
      ...base,
      id: 'sticker',
      type: 'image',
      name: 'Sticker',
      x: 1750,
      y: 80,
      width: 560,
      height: 560,
      rotation: 15,
      zIndex: 4,
      assetId: STICKER_ASSET_ID,
      role: 'graphic',
      fit: 'stretch'
    } as Layer, // overlaps photo 1 and sits above it
    {
      ...base,
      id: 'title',
      type: 'text',
      name: 'Event title',
      x: 200,
      y: 3130,
      width: 2000,
      height: 200,
      zIndex: 5,
      content: 'Kara & Saher',
      fontFamily: 'Georgia',
      fontSize: 150,
      fontWeight: 700,
      fontStyle: 'normal',
      align: 'center',
      lineHeight: 1.1,
      letterSpacing: 0,
      fill: literalColor('#2b2b2b')
    } as Layer,
    {
      ...base,
      id: 'date',
      type: 'text',
      name: 'Date and location',
      x: 200,
      y: 3330,
      width: 2000,
      height: 200,
      zIndex: 6,
      content: 'August 20, 2023\nDetroit, Michigan',
      fontFamily: 'Helvetica',
      fontSize: 84,
      fontWeight: 400,
      fontStyle: 'normal',
      align: 'center',
      lineHeight: 1.25,
      letterSpacing: 4,
      fill: literalColor('#5a5047')
    } as Layer,
    // a flat-model group (parentId): two children with absolute design coordinates
    {
      ...base,
      id: 'group-1',
      type: 'group',
      name: 'Corner ornament',
      x: 100,
      y: 60,
      width: 420,
      height: 300,
      zIndex: 7
    } as Layer,
    {
      ...base,
      id: 'g1-rect',
      type: 'shape',
      name: 'Ornament frame',
      x: 100,
      y: 60,
      width: 420,
      height: 300,
      zIndex: 0,
      parentId: 'group-1',
      shape: 'rectangle',
      fill: null,
      stroke: { color: literalColor('#b08d57'), width: 10 },
      cornerRadius: 0
    } as Layer,
    {
      ...base,
      id: 'g1-text',
      type: 'text',
      name: 'Ornament text',
      x: 120,
      y: 160,
      width: 380,
      height: 100,
      zIndex: 1,
      parentId: 'group-1',
      content: 'EST. 2023',
      fontFamily: 'Georgia',
      fontSize: 70,
      fontWeight: 400,
      fontStyle: 'italic',
      align: 'center',
      lineHeight: 1.1,
      letterSpacing: 0,
      fill: literalColor('#b08d57')
    } as Layer
  ]
  return p
}

/** Mixed scene of approximately `n` layers (photos, shapes, images, text) for practical timing. */
export function createStressProject(n: number): TemplateProject {
  const p = createSpikeProject()
  const extra: Layer[] = []
  for (let i = 0; i < n; i++) {
    const col = i % 10
    const row = Math.floor(i / 10)
    const x = 40 + col * 230
    const y = 40 + row * 330
    const z = 100 + i
    const kind = i % 4
    if (kind === 0) {
      extra.push(photo(`s-${i}`, (i % 3) + 1, x, y, z, 0, { width: 200, height: 140 }))
    } else if (kind === 1) {
      extra.push({
        ...base,
        id: `s-${i}`,
        type: 'shape',
        name: `Shape ${i}`,
        x,
        y,
        width: 200,
        height: 140,
        zIndex: z,
        shape: 'rectangle',
        fill: literalColor('#8aa'),
        stroke: { color: literalColor('#355'), width: 6 },
        cornerRadius: 12
      } as Layer)
    } else if (kind === 2) {
      extra.push({
        ...base,
        id: `s-${i}`,
        type: 'image',
        name: `Image ${i}`,
        x,
        y,
        width: 200,
        height: 200,
        zIndex: z,
        assetId: STICKER_ASSET_ID,
        role: 'graphic',
        fit: 'stretch'
      } as Layer)
    } else {
      extra.push({
        ...base,
        id: `s-${i}`,
        type: 'text',
        name: `Text ${i}`,
        x,
        y,
        width: 220,
        height: 80,
        zIndex: z,
        content: `Label ${i}`,
        fontFamily: 'Helvetica',
        fontSize: 40,
        fontWeight: 400,
        fontStyle: 'normal',
        align: 'left',
        lineHeight: 1.2,
        letterSpacing: 0,
        fill: literalColor('#222')
      } as Layer)
    }
  }
  p.layers = [...p.layers, ...extra]
  return p
}

function counter(prefix: string): () => string {
  let i = 0
  return () => `${prefix}-${++i}`
}

export const colorOf = (
  c: { kind: 'literal'; value: string } | { kind: 'palette'; paletteColorId: string }
): string => (c.kind === 'literal' ? c.value : '#ff00ff')

/** Layers sorted for painting: parents' order among siblings, then children handled by the engine. */
export function topLevel(layers: readonly Layer[]): Layer[] {
  return layers.filter((l) => l.parentId === undefined).sort((a, b) => a.zIndex - b.zIndex)
}
export function childrenOf(layers: readonly Layer[], id: string): Layer[] {
  return layers.filter((l) => l.parentId === id).sort((a, b) => a.zIndex - b.zIndex)
}
