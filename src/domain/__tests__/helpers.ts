import { createProject, type Layer, type TemplateProject } from '..'

export const TS = '2026-01-01T00:00:00.000Z'

export function counterIds(prefix = 'id'): () => string {
  let n = 0
  return () => `${prefix}-${++n}`
}

export function baseProject(): TemplateProject {
  return createProject({
    name: 'Test',
    design: 'photo-4x6-portrait-600',
    now: TS,
    createId: counterIds('p')
  })
}

export function photo(id: string, photoNumber: number, over: Partial<Layer> = {}): Layer {
  return {
    id,
    type: 'photo',
    name: `Photo ${photoNumber}`,
    x: 76,
    y: 168,
    width: 1049,
    height: 700,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
    visible: true,
    locked: false,
    photoNumber,
    fit: 'cover',
    frame: { style: 'none' },
    cornerRadius: 0,
    ...over
  } as Layer
}

export function withLayers(layers: Layer[]): TemplateProject {
  return { ...baseProject(), layers }
}
