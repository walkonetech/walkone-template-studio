/** SPIKE (Phase 3A): the contract an engine implementation satisfies (Fabric and Konva were both built to it). */
import type { TemplateProject } from '@domain/index'
import type { Geometry } from './geometry'
import type { ImageMap } from './images'
import type { Guide } from './snap'
import type { Size, ViewTransform } from './viewport'

export type HandleName = 'tl' | 'tr' | 'bl' | 'br' | 'mt' | 'mb' | 'ml' | 'mr' | 'rot'

export interface GeometryChange {
  id: string
  geometry: Geometry
  /** Text layers: new font size when a resize scaled the glyphs. */
  fontSize?: number
}

export interface EngineProps {
  project: TemplateProject
  images: ImageMap
  selectedId: string | null
  /** Display transform; changing it must never alter design coordinates. */
  view: ViewTransform
  viewport: Size
  snapping: boolean
  onSelect: (id: string | null) => void
  /** Interaction finished: absolute DESIGN-space geometry, already normalized (no scale factors). */
  onGeometry: (changes: GeometryChange[]) => void
  onGuides: (guides: Guide[]) => void
  /** Active snap guides to draw (owned by the harness so engines stay declarative). */
  guides: Guide[]
}

export interface EngineInfo {
  name: string
  objectCount: number
  dpr: number
  /** Backing-store size of each canvas element the engine created, with its CSS size. */
  canvases: { backing: [number, number]; css: [number, number] }[]
}

export interface EngineHandle {
  /** PNG data URL of the DESIGN area at `output` pixels, independent of view zoom, pan and DPR. */
  exportPng: (output: Size) => string
  /** Client (page) coordinates of a transform handle of the selected/identified layer. */
  handlePoint: (id: string, handle: HandleName) => { x: number; y: number } | null
  layerCenterPoint: (id: string) => { x: number; y: number } | null
  info: () => EngineInfo
  /** Moves one object `steps` times with a synchronous redraw each; returns total ms. */
  dragBenchmark: (id: string, steps: number) => number
  /** Redraws the whole scene `n` times with zoom changes; returns total ms. */
  zoomBenchmark: (n: number) => number
}
