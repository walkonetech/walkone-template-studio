import type { Layer, PhotoLayer, TemplateProject } from '@domain'
import type { ExportFile, ExportPackageEntry } from '@shared/ipc'
import { imageKey } from '@canvas/assets/imageCache'
import type { ImageLookup } from '@canvas/rendering/nodeSpec'
import type { RenderOptions } from '@canvas/rendering/plan'
import { renderOutputToCanvas, renderProjectToCanvas } from '@canvas/rendering/renderProject'
import {
  buildPackageManifest,
  classifyLayerPackage,
  exportOutputs,
  packageReadme,
  type ExportOutput
} from '@editor/exportPlan'
import type { ExportKind } from '@export/naming'
import { clampCornerRadius } from '@canvas/rendering/photoFit'
import { PREVIEW_PNG, TEMPLATE_XML } from '@export/dslrbooth/profile'
import {
  buildDslrTemplate,
  planDslrTemplate,
  type DslrImagePlan,
  type DslrPlan
} from '@export/dslrbooth/plan'
import {
  dslrOutputs,
  dslrTemplateNameFor,
  dslrVariantFor,
  isDslrKind
} from '@export/dslrbooth/outputs'
import { encodeTemplateXml, writeTemplateXml } from '@export/dslrbooth/templateXml'
import { imageCache } from './editorStore'
import { fontEnvironment } from './fontCatalog'

/**
 * Renderer side of export (Phase 6A, ADR-041). Konva renders every pixel through the SAME exact-size pipeline as the
 * editor's print preview (`renderProjectToCanvas` / `renderOutputToCanvas`); production outputs draw photo slots as
 * frames only, the proof and dslrBooth preview.png as neutral numbered slots. No output ever has a picture in a photo
 * slot (Sample Photos were removed in B3.1). Bytes go to the main process,
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
/** Client-approval proof: the print with each photo slot as its neutral numbered placeholder (never a picture). */
const PROOF: RenderOptions & { photoLabels: boolean } = {
  photos: 'placeholder',
  photoLabels: false
}
/** Layer package bands: no photo slots at all (frames get their own file). */
const BAND: RenderOptions & { photoLabels: boolean } = { photos: 'omit', photoLabels: false }

async function appVersion(): Promise<string> {
  try {
    return (await window.api.ping()).appVersion
  } catch {
    return 'unknown'
  }
}

/** Every output the Export dialog offers: dslrBooth templates first (6B), then the vendor-neutral files (6A). */
export const allExportOutputs = (project: TemplateProject): ExportOutput[] => [
  ...dslrOutputs(project),
  ...exportOutputs(project)
]

type Render = (options: RenderOptions & { photoLabels: boolean }) => HTMLCanvasElement

const onlyIds = (ids: readonly string[]): ((l: Layer) => boolean) => {
  const set = new Set(ids)
  return (l) => set.has(l.id)
}

/**
 * One dslrBooth image (Phase 6B): the base (opaque, canvas colour + the artwork behind the first photo), or a
 * transparent image above a run of photo slots holding, bottom to top: rounded-corner masks (what lies beneath each
 * slot, outside its rounded rectangle), the slots' native frames, then the artwork stacked above them.
 */
function renderDslrImage(
  project: TemplateProject,
  plan: DslrPlan,
  img: DslrImagePlan,
  render: Render
): HTMLCanvasElement {
  if (img.base) return render({ photos: 'omit', photoLabels: false, include: onlyIds(img.leafIds) })
  const out = document.createElement('canvas')
  out.width = plan.canvas.width
  out.height = plan.canvas.height
  const ctx = out.getContext('2d')
  if (!ctx) throw new Error('The image could not be drawn.')
  for (const id of img.maskIds) {
    const p = project.layers.find((l): l is PhotoLayer => l.id === id && l.type === 'photo')
    if (!p) continue
    const beneath = render({
      photos: 'omit',
      photoLabels: false,
      include: onlyIds(plan.under[id] ?? [])
    })
    const r = clampCornerRadius(p.cornerRadius, p.width, p.height)
    for (const c of plan.copies) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(c.left, c.top, c.width, c.height)
      ctx.clip()
      ctx.translate(c.left + p.x + p.width / 2, c.top + p.y + p.height / 2)
      ctx.rotate((p.rotation * Math.PI) / 180)
      ctx.beginPath()
      ctx.rect(-p.width / 2, -p.height / 2, p.width, p.height)
      ctx.roundRect(-p.width / 2, -p.height / 2, p.width, p.height, r)
      ctx.clip('evenodd')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(beneath, 0, 0)
      ctx.restore()
    }
  }
  if (img.frameIds.length > 0 || img.leafIds.length > 0)
    ctx.drawImage(
      render({
        photos: 'frame',
        photoLabels: false,
        include: onlyIds([...img.frameIds, ...img.leafIds]),
        background: 'transparent'
      }),
      0,
      0
    )
  return out
}

const dslrSteps = (plan: DslrPlan): number =>
  plan.items.reduce(
    (n, it) => n + (it.kind === 'image' ? 1 + it.image.maskIds.length : 0),
    2 // preview + template.xml
  )

/** Renders the selected outputs. Throws (with a user-readable message) when a render fails. */
export async function renderExports(
  project: TemplateProject,
  sessionId: string,
  kinds: readonly ExportKind[],
  onProgress: (p: ExportProgress) => void
): Promise<ExportFile[]> {
  const outputs = allExportOutputs(project).filter((o) => kinds.includes(o.kind))
  const unreadable = await loadExportImages(project, sessionId)
  if (unreadable.length > 0)
    throw new Error('Some images could not be loaded. Run the checks again.')
  const images: ImageLookup = (assetId) => imageCache.peek(imageKey(sessionId, assetId))
  // Text is drawn with whatever fonts the document has; make sure web/system font loading has settled first.
  await document.fonts.ready

  const bands = outputs.some((o) => o.kind === 'package') ? classifyLayerPackage(project) : null
  const dslrPlans = new Map<ExportKind, DslrPlan>()
  for (const o of outputs)
    if (isDslrKind(o.kind))
      dslrPlans.set(o.kind, planDslrTemplate(project, dslrVariantFor(project, o.kind)))
  const steps = outputs.reduce((n, o) => {
    const plan = dslrPlans.get(o.kind)
    return n + (plan ? dslrSteps(plan) : o.kind === 'package' ? 7 : 1)
  }, 0)
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
    const dslr = dslrPlans.get(o.kind)
    if (dslr) {
      const render: Render = (options) =>
        dslr.variant === 'sheet'
          ? renderOutputToCanvas(project, images, options)
          : renderProjectToCanvas(project, images, options)
      const facts = { width: dslr.canvas.width, height: dslr.canvas.height, dpi: dslr.canvas.dpi }
      const entries: ExportPackageEntry[] = []
      for (const it of dslr.items) {
        if (it.kind !== 'image') continue
        for (let m = 0; m < it.image.maskIds.length; m++) await step(`${o.label}: rounded corners`)
        await step(`${o.label}: ${it.image.name}`)
        entries.push({
          path: it.image.path,
          data: await toPng(renderDslrImage(project, dslr, it.image, render)),
          png: facts
        })
      }
      await step(`${o.label}: preview`)
      entries.push({
        path: PREVIEW_PNG,
        data: await toPng(render({ photos: 'placeholder', photoLabels: false })),
        png: facts
      })
      await step(`${o.label}: template.xml`)
      const template = buildDslrTemplate(project, dslr, {
        name: dslrTemplateNameFor(o.fileName),
        now: new Date()
      })
      entries.push({ path: TEMPLATE_XML, data: encodeTemplateXml(writeTemplateXml(template)) })
      files.push({ kind: 'zip', format: 'dslrbooth', name: o.fileName, entries })
    } else if (o.kind === 'print') {
      await step(`Rendering ${o.label}`)
      files.push(png(o, await toPng(renderOutputToCanvas(project, images, PRODUCTION))))
    } else if (o.kind === 'design') {
      await step(`Rendering ${o.label}`)
      files.push(png(o, await toPng(renderProjectToCanvas(project, images, PRODUCTION))))
    } else if (o.kind === 'proof') {
      await step(`Rendering ${o.label}`)
      files.push(png(o, await toPng(renderOutputToCanvas(project, images, PROOF))))
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
      await band('proof.png', PROOF)
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
      files.push({ kind: 'zip', format: 'layers', name: o.fileName, entries })
    }
  }
  onProgress({ label: 'Writing files', done: steps, total: steps })
  return files
}
