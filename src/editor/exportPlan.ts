import {
  childrenOf,
  getPixelSize,
  isEffectivelyVisible,
  topLevelLayers,
  type Layer,
  type PhotoLayer,
  type TemplateProject
} from '@domain'
import { hasDerivedCopies, planOutput } from '@canvas/rendering/composition'
import { resolveColor } from '@canvas/rendering/color'
import { exportFileName, type ExportKind } from '@export/naming'
import { LAYER_PACKAGE_FORMAT, LAYER_PACKAGE_VERSION } from '@export/package'
import { boundsOf } from './mutations'
import { collectProjectFonts, fontStatus, type FontEnvironment } from './fonts'

/**
 * Export planning (Phase 6A, ADR-041). Pure: which outputs a project offers, how the layer package splits the design
 * into semantic bands, and the package manifest. Rendering happens in the renderer with the shared Konva pipeline;
 * writing happens in the main process. Vendor-neutral: nothing here knows about DSLR Booth (Phase 6B).
 */

// ------------------------------------------------------------------------------------------------ outputs

export interface ExportOutput {
  kind: ExportKind
  label: string
  /** One sentence: what this file is for. */
  description: string
  fileName: string
  width: number
  height: number
  dpi: number
  widthIn: number
  heightIn: number
  /** Production artwork (printable). The proof is NOT production output. */
  production: boolean
  /** Ticked when the dialog opens. */
  defaultSelected: boolean
}

const inches = (n: number): string => `${Number(n.toFixed(3))}`

/** "1200 × 1800 px · 4 × 6 in · 300 DPI" */
export const describeSize = (
  o: Pick<ExportOutput, 'width' | 'height' | 'widthIn' | 'heightIn' | 'dpi'>
): string =>
  `${o.width} × ${o.height} px · ${inches(o.widthIn)} × ${inches(o.heightIn)} in · ${o.dpi} DPI`

/**
 * The outputs a project can export. A project that prints several copies per sheet (a 2×6 strip on a 4×6) offers the
 * print SHEET and the single DESIGN separately; a single-up project's design IS its print, so it offers one print PNG.
 */
export function exportOutputs(project: TemplateProject): ExportOutput[] {
  const name = project.metadata.name
  const sheet = project.output.print
  const design = project.canvas.print
  const sheetPx = getPixelSize(sheet)
  const designPx = getPixelSize(design)
  const composed = hasDerivedCopies(project)
  const copies = composed ? planOutput(project).copies.length : 1
  const sheetSize = { ...sheetPx, dpi: sheet.dpi, widthIn: sheet.width, heightIn: sheet.height }
  const designSize = {
    ...designPx,
    dpi: design.dpi,
    widthIn: design.width,
    heightIn: design.height
  }
  const outputs: ExportOutput[] = [
    {
      kind: 'print',
      label: composed ? 'Print sheet PNG' : 'Print PNG',
      description: composed
        ? `The finished print sheet: ${copies} copies of the design, photo frames drawn, photo areas left empty.`
        : 'The finished print artwork, photo frames drawn, photo areas left empty.',
      fileName: exportFileName(name, 'print'),
      ...sheetSize,
      production: true,
      defaultSelected: true
    }
  ]
  if (composed) {
    outputs.push({
      kind: 'design',
      label: 'Design PNG',
      description:
        'One copy of the design on its own (for example one 2×6 strip), photo frames drawn, photo areas left empty.',
      fileName: exportFileName(name, 'design'),
      ...designSize,
      production: true,
      defaultSelected: true
    })
  }
  outputs.push({
    kind: 'proof',
    label: 'Proof PNG',
    description:
      'For client approval only, not for printing: the print with the current sample photos in the photo slots.',
    fileName: exportFileName(name, 'proof'),
    ...sheetSize,
    production: false,
    defaultSelected: false
  })
  return outputs
}

/**
 * The layer package (ZIP) output. NOT offered in the Export dialog (owner decision after 6A: the booth composites
 * the photos itself, so nobody rebuilds a template by hand in another editor). Kept because its behind/above-photo
 * classification is what the DSLR Booth adapter (6B) needs for background vs overlay artwork.
 */
export function layerPackageOutput(project: TemplateProject): ExportOutput {
  const design = project.canvas.print
  return {
    kind: 'package',
    label: 'Layer package (ZIP)',
    description:
      'Background, overlay, frames and text as separate PNGs plus photo-slot positions, for rebuilding the template in another editor.',
    fileName: exportFileName(project.metadata.name, 'package'),
    ...getPixelSize(design),
    dpi: design.dpi,
    widthIn: design.width,
    heightIn: design.height,
    production: true,
    defaultSelected: false
  }
}

// ------------------------------------------------------------------------------------------------ layer package

/** Printable leaf layers (no groups, nothing hidden) in paint order, back to front. */
export function printableLeaves(project: TemplateProject): Layer[] {
  const out: Layer[] = []
  const walk = (list: Layer[]): void => {
    for (const l of list) {
      if (!isEffectivelyVisible(project.layers, l)) continue
      if (l.type === 'group') walk(childrenOf(project.layers, l.id))
      else out.push(l)
    }
  }
  walk(topLevelLayers(project.layers))
  return out
}

function intersects(a: Layer, b: Layer): boolean {
  const p = boundsOf(a)
  const q = boundsOf(b)
  return p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom
}

export type PackageNoteCode = 'between-photos' | 'text-lifted' | 'group-opacity' | 'no-photo-slots'
export interface PackageNote {
  code: PackageNoteCode
  message: string
  layerIds: string[]
}

export interface PackageBands {
  /** Opaque: canvas colour + everything stacked behind the photo slots. */
  background: string[]
  /** Photo slots (rendered nowhere; described in the manifest). */
  photos: string[]
  /** Photo slots that have a native frame (rendered alone in frames.png). */
  frames: string[]
  /** Non-text artwork stacked in front of the photo slots. */
  overlay: string[]
  /** Text stacked in front of the photo slots. */
  text: string[]
  /** Where re-stacking the bands (background, photos, frames, overlay, text) is not pixel-exact. */
  notes: PackageNote[]
}

/**
 * Semantic flattening for the layer package. The design is split by STACK POSITION relative to the photo slots, which
 * is how photo-booth templates are rebuilt (background, photos, overlay), and the overlay is further split into
 * artwork and text so text can be replaced in another editor:
 *
 *   background.png  everything behind the lowest photo slot (opaque, includes the canvas colour)
 *   frames.png      the native photo frames
 *   overlay.png     non-text artwork in front of the photos
 *   text.png        text in front of the photos
 *
 * Re-stacking in that order reproduces the design exactly unless a note says otherwise (artwork stacked BETWEEN photo
 * slots that overlaps a later slot, text that sits under overlapping artwork, a semi-transparent group split across
 * bands). Without photo slots everything but text is background.
 */
export function classifyLayerPackage(project: TemplateProject): PackageBands {
  const leaves = printableLeaves(project)
  const photoIdx = leaves.flatMap((l, i) => (l.type === 'photo' ? [i] : []))
  const bands: PackageBands = {
    background: [],
    photos: [],
    frames: [],
    overlay: [],
    text: [],
    notes: []
  }
  const between: string[] = []
  const lifted: string[] = []
  const first = photoIdx[0] ?? Infinity
  const last = photoIdx[photoIdx.length - 1] ?? -Infinity
  const noPhotos = photoIdx.length === 0

  leaves.forEach((l, i) => {
    if (l.type === 'photo') {
      bands.photos.push(l.id)
      if (l.frame.style === 'solid') bands.frames.push(l.id)
      return
    }
    if (noPhotos) {
      ;(l.type === 'text' ? bands.text : bands.background).push(l.id)
    } else if (i < first) {
      bands.background.push(l.id)
      return
    } else {
      ;(l.type === 'text' ? bands.text : bands.overlay).push(l.id)
      if (i < last && leaves.some((p, j) => j > i && p.type === 'photo' && intersects(l, p)))
        between.push(l.id)
    }
    // Text goes to the top band: exact only if no later non-text artwork overlaps it.
    if (
      l.type === 'text' &&
      leaves.some((o, j) => j > i && o.type !== 'text' && o.type !== 'photo' && intersects(l, o))
    ) {
      lifted.push(l.id)
    }
  })

  if (noPhotos) {
    bands.notes.push({
      code: 'no-photo-slots',
      message: 'The design has no photo slots: all artwork except text is in background.png.',
      layerIds: []
    })
  }
  if (between.length > 0) {
    bands.notes.push({
      code: 'between-photos',
      message:
        'Some artwork is stacked between photo slots and overlaps a later slot; in the package it sits above all photos.',
      layerIds: between
    })
  }
  if (lifted.length > 0) {
    bands.notes.push({
      code: 'text-lifted',
      message:
        'Some text is stacked under overlapping artwork; in the package text.png sits above that artwork.',
      layerIds: lifted
    })
  }
  // A group with opacity < 1 whose children land in different bands is faded per band, not as a whole.
  const bandOf = new Map<string, string>()
  for (const key of ['background', 'overlay', 'text', 'photos'] as const)
    for (const id of bands[key]) bandOf.set(id, key)
  const faded = project.layers.filter((g) => {
    if (g.type !== 'group' || g.opacity >= 1 || !isEffectivelyVisible(project.layers, g))
      return false
    const kinds = new Set(
      leaves.filter((l) => isDescendant(project.layers, l, g.id)).map((l) => bandOf.get(l.id))
    )
    return kinds.size > 1
  })
  if (faded.length > 0) {
    bands.notes.push({
      code: 'group-opacity',
      message:
        'A semi-transparent group is split across files; its transparency is applied to each file separately.',
      layerIds: faded.map((g) => g.id)
    })
  }
  return bands
}

function isDescendant(layers: readonly Layer[], layer: Layer, groupId: string): boolean {
  let parent = layer.parentId
  while (parent !== undefined) {
    if (parent === groupId) return true
    parent = layers.find((l) => l.id === parent)?.parentId
  }
  return false
}

// ------------------------------------------------------------------------------------------------ manifest

export type PackageFileRole = 'background' | 'frames' | 'overlay' | 'text' | 'design' | 'proof'

export interface PackageFileEntry {
  path: string
  role: PackageFileRole
  description: string
  /** True when every pixel is opaque (background, design, proof). */
  opaque: boolean
  /** Layers drawn into this file (empty for derived composites). */
  layerIds: string[]
}

/** The package's PNG files in re-stacking order (only non-empty bands), then the reference composites. */
export function packageFiles(bands: PackageBands): PackageFileEntry[] {
  const files: PackageFileEntry[] = [
    {
      path: 'background.png',
      role: 'background',
      description: 'Bottom of the stack: canvas colour and all artwork behind the photo slots.',
      opaque: true,
      layerIds: bands.background
    }
  ]
  if (bands.frames.length > 0)
    files.push({
      path: 'frames.png',
      role: 'frames',
      description: 'The photo frames, drawn inside each slot box. Place above the photos.',
      opaque: false,
      layerIds: bands.frames
    })
  if (bands.overlay.length > 0)
    files.push({
      path: 'overlay.png',
      role: 'overlay',
      description: 'Artwork in front of the photos (transparent PNG).',
      opaque: false,
      layerIds: bands.overlay
    })
  if (bands.text.length > 0)
    files.push({
      path: 'text.png',
      role: 'text',
      description: 'All text in front of the photos, rasterized (transparent PNG).',
      opaque: false,
      layerIds: bands.text
    })
  files.push(
    {
      path: 'design.png',
      role: 'design',
      description:
        'Reference: the finished design (production artwork): frames drawn, photo areas empty.',
      opaque: true,
      layerIds: []
    },
    {
      path: 'proof.png',
      role: 'proof',
      description:
        'Reference only, NOT production artwork: the design with sample photos in the slots.',
      opaque: true,
      layerIds: []
    }
  )
  return files
}

export interface PhotoSlotInfo {
  photoNumber: number
  layerId: string
  name: string
  /** Unrotated slot box in design pixels (top-left origin). */
  x: number
  y: number
  width: number
  height: number
  /** The same box in inches. */
  xIn: number
  yIn: number
  widthIn: number
  heightIn: number
  /** Degrees, clockwise, about the box centre. */
  rotation: number
  fit: PhotoLayer['fit']
  cornerRadius: number
  /** Native frame drawn inside the box edge. */
  frame: { style: 'none' } | { style: 'solid'; thickness: number; color: string }
  opacity: number
}

export interface LayerPackageManifest {
  format: typeof LAYER_PACKAGE_FORMAT
  formatVersion: typeof LAYER_PACKAGE_VERSION
  generator: { name: string; version: string }
  project: { id: string; name: string; updatedAt: string; schemaVersion: number }
  design: { widthIn: number; heightIn: number; dpi: number; widthPx: number; heightPx: number }
  print: {
    widthIn: number
    heightIn: number
    dpi: number
    widthPx: number
    heightPx: number
    /** Where each copy of the design sits on the print sheet, in sheet pixels. */
    copies: { x: number; y: number; width: number; height: number }[]
  }
  coordinates: string
  /** Bottom to top; "photos" is where the booth's captured photos go. */
  stackOrder: string[]
  files: PackageFileEntry[]
  photoSlots: PhotoSlotInfo[]
  fonts: { family: string; availableOnExportComputer: 'available' | 'missing' | 'unknown' }[]
  notes: PackageNote[]
}

const round = (n: number, places = 4): number => Number(n.toFixed(places))

/**
 * Deterministic manifest (no wall-clock time: the project's own `updatedAt` identifies the version), so exporting the
 * same project twice gives identical bytes.
 */
export function buildPackageManifest(
  project: TemplateProject,
  bands: PackageBands,
  opts: { appVersion: string; fonts?: FontEnvironment }
): LayerPackageManifest {
  const dpi = project.canvas.print.dpi
  const designPx = getPixelSize(project.canvas.print)
  const sheetPx = getPixelSize(project.output.print)
  const files = packageFiles(bands)
  const byId = new Map(project.layers.map((l) => [l.id, l]))
  const slots = bands.photos
    .map((id) => byId.get(id))
    .filter((l): l is PhotoLayer => l?.type === 'photo')
    .map((l): PhotoSlotInfo => ({
      photoNumber: l.photoNumber,
      layerId: l.id,
      name: l.name,
      x: round(l.x),
      y: round(l.y),
      width: round(l.width),
      height: round(l.height),
      xIn: round(l.x / dpi),
      yIn: round(l.y / dpi),
      widthIn: round(l.width / dpi),
      heightIn: round(l.height / dpi),
      rotation: round(l.rotation),
      fit: l.fit,
      cornerRadius: round(l.cornerRadius),
      frame:
        l.frame.style === 'solid'
          ? {
              style: 'solid',
              thickness: round(l.frame.thickness),
              color: resolveColor(project.palette, l.frame.color)
            }
          : { style: 'none' },
      opacity: l.opacity
    }))
  const fonts = collectProjectFonts(project.layers).map((f) => ({
    family: f.family,
    availableOnExportComputer: opts.fonts
      ? fontStatus(f.family, opts.fonts).availability
      : ('unknown' as const)
  }))
  const order = files.filter((f) => f.role !== 'design' && f.role !== 'proof').map((f) => f.path)
  order.splice(1, 0, 'photos')
  return {
    format: LAYER_PACKAGE_FORMAT,
    formatVersion: LAYER_PACKAGE_VERSION,
    generator: { name: 'WalkOne Template Studio', version: opts.appVersion },
    project: {
      id: project.id,
      name: project.metadata.name,
      updatedAt: project.metadata.updatedAt,
      schemaVersion: project.schemaVersion
    },
    design: {
      widthIn: project.canvas.print.width,
      heightIn: project.canvas.print.height,
      dpi,
      widthPx: designPx.width,
      heightPx: designPx.height
    },
    print: {
      widthIn: project.output.print.width,
      heightIn: project.output.print.height,
      dpi: project.output.print.dpi,
      widthPx: sheetPx.width,
      heightPx: sheetPx.height,
      copies: planOutput(project).copies.map((c) => ({
        x: c.cell.x,
        y: c.cell.y,
        width: c.cell.width,
        height: c.cell.height
      }))
    },
    coordinates:
      'Design pixels at design.dpi; origin top-left, +x right, +y down. Photo slot boxes are unrotated; rotation is clockwise about the box centre.',
    stackOrder: order,
    files,
    photoSlots: slots,
    fonts,
    notes: bands.notes
  }
}

/** Plain-text instructions shipped inside the package. */
export function packageReadme(m: LayerPackageManifest): string {
  const lines = [
    `${m.project.name} - layer package`,
    `Made by ${m.generator.name} ${m.generator.version}. Format ${m.format} v${m.formatVersion}.`,
    '',
    `Design: ${m.design.widthIn} x ${m.design.heightIn} in at ${m.design.dpi} DPI (${m.design.widthPx} x ${m.design.heightPx} px).`,
    m.print.copies.length > 1
      ? `Printed ${m.print.copies.length} times on a ${m.print.widthIn} x ${m.print.heightIn} in sheet.`
      : `Printed once on a ${m.print.widthIn} x ${m.print.heightIn} in sheet.`,
    '',
    'Stack these files, bottom to top, all at position 0,0 and the same size:',
    ...m.stackOrder.map(
      (p, i) => `  ${i + 1}. ${p === 'photos' ? '(the booth photos, see Photo slots)' : p}`
    ),
    '',
    'design.png is the finished design for reference (production artwork: frames drawn, photo areas empty).',
    'proof.png shows sample photos and is for approval only. It is NOT production artwork.',
    '',
    'Photo slots (design pixels; rotation clockwise about the centre):'
  ]
  for (const s of m.photoSlots) {
    lines.push(
      `  Photo ${s.photoNumber}: x ${s.x}, y ${s.y}, ${s.width} x ${s.height}` +
        (s.rotation ? `, rotated ${s.rotation} deg` : '') +
        (s.frame.style === 'solid' ? `, frame ${s.frame.thickness}px ${s.frame.color}` : '')
    )
  }
  if (m.photoSlots.length === 0) lines.push('  (none)')
  if (m.fonts.length > 0) {
    lines.push('', 'Fonts used (text is already rasterized in text.png):')
    for (const f of m.fonts)
      lines.push(
        `  ${f.family}${f.availableOnExportComputer === 'missing' ? ' (missing on the exporting computer: a fallback font was used)' : ''}`
      )
  }
  if (m.notes.length > 0) {
    lines.push('', 'Notes:')
    for (const n of m.notes) lines.push(`  - ${n.message}`)
  }
  lines.push('', 'manifest.json holds the same information in machine-readable form.', '')
  return lines.join('\r\n')
}
