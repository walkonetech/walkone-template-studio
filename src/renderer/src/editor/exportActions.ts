import type { Layer, PhotoLayer, TemplateProject } from '@domain'
import type { ExportFile, ExportPackageEntry } from '@shared/ipc'
import { imageKey } from '@canvas/assets/imageCache'
import type { ImageLookup, PhotoPreviewLookup } from '@canvas/rendering/nodeSpec'
import type { RenderOptions } from '@canvas/rendering/plan'
import { renderOutputToCanvas, renderProjectToCanvas } from '@canvas/rendering/renderProject'
import {
  buildPackageManifest,
  classifyLayerPackage,
  exportOutputs,
  packageReadme,
  type ExportOutput
} from '@editor/exportPlan'
import { sampleIdFor } from '@editor/previewPhotos'
import type { ExportKind } from '@export/naming'
import { editorStore, imageCache } from './editorStore'
import { fontEnvironment } from './fontCatalog'
import { previewCache } from './samplePhotos'

/**
 * Renderer side of export (Phase 6A, ADR-041). Konva renders every pixel through the SAME exact-size pipeline as the
 * editor's print preview (`renderProjectToCanvas` / `renderOutputToCanvas`); production outputs use `photos: 'omit'`
 * and never contain sample photos. Only the proof draws the current preview samples. Bytes go to the main process,
 * which verifies and writes them. Export never touches the project, its history or its Modified state.
 */

const imageAssetIds = (layers: readonly Layer[]): string[] => [
  ...new Set(layers.flatMap((l) => (l.type === 'image' ? [l.assetId] : [])))
]

/** Loads every project image the export needs; returns the asset ids that could not be read or decoded. */
export async function loadExportImages(
  project: TemplateProject,
  sessionId: string
): Promise<string[]> {
  const ids = imageAssetIds(project.layers)
  await imageCache.ensure(ids.map((id) => imageKey(sessionId, id)))
  return ids.filter((id) => imageCache.status(imageKey(sessionId, id)) !== 'ready')
}

/**
 * The sample photos the proof shows: the CURRENT preview choice (seed, per-number overrides, user-picked pictures and
 * crops), exactly what the designer sees with Preview Photos on, whether or not the toggle is on right now.
 */
async function proofPhotos(project: TemplateProject): Promise<PhotoPreviewLookup> {
  const s = editorStore.getState()
  const numbers = [
    ...new Set(project.layers.flatMap((l) => (l.type === 'photo' ? [l.photoNumber] : [])))
  ]
  const ids = [...new Set(numbers.map((n) => sampleIdFor(n, s.previewPhotos)))]
  await previewCache.ensure(ids)
  const crops = s.photoCrops
  return (layer: PhotoLayer) => {
    const image = previewCache.peek(sampleIdFor(layer.photoNumber, s.previewPhotos))
    if (!image) return undefined
    const crop = crops[layer.id]
    return crop ? { image, crop } : { image }
  }
}

async function toPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('The image could not be encoded.')
  return new Uint8Array(await blob.arrayBuffer())
}

export interface ExportProgress {
  label: string
  done: number
  total: number
}

/**
 * Production artwork: every printable layer, and each photo slot drawn as its native FRAME only (the photo area stays
 * empty, no placeholder tint, no number, no sample). So the print PNG is the printed result minus the booth photos.
 */
const PRODUCTION: RenderOptions & { photoLabels: boolean } = { photos: 'frame', photoLabels: false }
/** Layer package bands: no photo slots at all (frames get their own file). */
const BAND: RenderOptions & { photoLabels: boolean } = { photos: 'omit', photoLabels: false }

async function appVersion(): Promise<string> {
  try {
    return (await window.api.ping()).appVersion
  } catch {
    return 'unknown'
  }
}

/** Renders the selected outputs. Throws (with a user-readable message) when a render fails. */
export async function renderExports(
  project: TemplateProject,
  sessionId: string,
  kinds: readonly ExportKind[],
  onProgress: (p: ExportProgress) => void
): Promise<ExportFile[]> {
  const outputs = exportOutputs(project).filter((o) => kinds.includes(o.kind))
  const unreadable = await loadExportImages(project, sessionId)
  if (unreadable.length > 0)
    throw new Error('Some images could not be loaded. Run the checks again.')
  const images: ImageLookup = (assetId) => imageCache.peek(imageKey(sessionId, assetId))
  // Text is drawn with whatever fonts the document has; make sure web/system font loading has settled first.
  await document.fonts.ready
  const needsProof = outputs.some((o) => o.kind === 'proof' || o.kind === 'package')
  const photoPreview = needsProof ? await proofPhotos(project) : undefined

  const bands = outputs.some((o) => o.kind === 'package') ? classifyLayerPackage(project) : null
  const steps = outputs.reduce((n, o) => n + (o.kind === 'package' ? 7 : 1), 0)
  let done = 0
  const step = async (label: string): Promise<void> => {
    onProgress({ label, done, total: steps })
    done++
    // Let the dialog paint progress between (synchronous) renders.
    await new Promise((r) => setTimeout(r, 0))
  }

  const files: ExportFile[] = []
  const png = (o: ExportOutput, data: Uint8Array): ExportFile => ({
    kind: 'png',
    name: o.fileName,
    data,
    width: o.width,
    height: o.height,
    dpi: o.dpi
  })

  for (const o of outputs) {
    if (o.kind === 'print') {
      await step(`Rendering ${o.label}`)
      files.push(png(o, await toPng(renderOutputToCanvas(project, images, PRODUCTION))))
    } else if (o.kind === 'design') {
      await step(`Rendering ${o.label}`)
      files.push(png(o, await toPng(renderProjectToCanvas(project, images, PRODUCTION))))
    } else if (o.kind === 'proof') {
      await step(`Rendering ${o.label}`)
      const canvas = renderOutputToCanvas(project, images, {
        photos: 'preview',
        photoLabels: false,
        ...(photoPreview ? { photoPreview } : {})
      })
      files.push(png(o, await toPng(canvas)))
    } else if (o.kind === 'package' && bands) {
      const facts = { width: o.width, height: o.height, dpi: o.dpi }
      const entries: ExportPackageEntry[] = []
      const band = async (
        path: string,
        options: RenderOptions & { photoLabels: boolean }
      ): Promise<void> => {
        await step(`Layer package: ${path}`)
        entries.push({
          path,
          data: await toPng(renderProjectToCanvas(project, images, options)),
          png: facts
        })
      }
      const only = (ids: readonly string[]) => {
        const set = new Set(ids)
        return (l: Layer): boolean => set.has(l.id)
      }
      await band('background.png', { ...BAND, include: only(bands.background) })
      if (bands.frames.length > 0)
        await band('frames.png', {
          photos: 'frame',
          photoLabels: false,
          include: only(bands.frames),
          background: 'transparent'
        })
      else await step('Layer package: frames')
      if (bands.overlay.length > 0)
        await band('overlay.png', {
          ...BAND,
          include: only(bands.overlay),
          background: 'transparent'
        })
      else await step('Layer package: overlay')
      if (bands.text.length > 0)
        await band('text.png', {
          ...BAND,
          include: only(bands.text),
          background: 'transparent'
        })
      else await step('Layer package: text')
      await band('design.png', PRODUCTION)
      await band('proof.png', {
        photos: 'preview',
        photoLabels: false,
        ...(photoPreview ? { photoPreview } : {})
      })
      await step('Layer package: manifest')
      const manifest = buildPackageManifest(project, bands, {
        appVersion: await appVersion(),
        fonts: fontEnvironment()
      })
      const enc = new TextEncoder()
      entries.push(
        { path: 'manifest.json', data: enc.encode(JSON.stringify(manifest, null, 2) + '\n') },
        { path: 'readme.txt', data: enc.encode(packageReadme(manifest)) }
      )
      files.push({ kind: 'zip', name: o.fileName, entries })
    }
  }
  onProgress({ label: 'Writing files', done: steps, total: steps })
  return files
}
