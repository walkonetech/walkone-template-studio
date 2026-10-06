import { createProject, literalColor, type Layer, type TemplateProject } from '../domain'
import type { InitialAsset } from './session'

/** 32×32 checkerboard PNG used as the diagnostic sample's only asset (repository-safe, generated). */
const STICKER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAARElEQVR42u3TIQIAEBBFQYd0JwdUZYdQqOgIJmz6Yae8kGPq87VSlzu9B4DngNsP9x3gPUAFACoAUAGACgBUAKCC7wEDTe7QtTf3Tc0AAAAASUVORK5CYII='

const base = { rotation: 0, opacity: 1, visible: true, locked: false }

/**
 * A realistic 4×6 portrait @ 600 DPI (2400×3600) sample used for development validation: three
 * photo placeholders (one rotated), an image layer, two text layers, an off-canvas rectangle, and a
 * flat group. Development diagnostic only; not a template.
 */
export function createSampleTemplate(): { project: TemplateProject; assets: InitialAsset[] } {
  const project = createProject({ name: 'Diagnostic Sample', design: 'photo-4x6-portrait-600' })
  project.canvas.backgroundColor = literalColor('#efe9df')
  const assetId = `${project.id}-sticker`
  project.assets.push({
    id: assetId,
    filename: 'sample.png',
    mediaType: 'image/png',
    path: 'assets/sample.png',
    pixelWidth: 32,
    pixelHeight: 32,
    hasAlpha: true,
    byteSize: Buffer.from(STICKER_PNG_BASE64, 'base64').length,
    source: { kind: 'upload', label: 'diagnostic' }
  })
  const photo = (n: number, y: number, rotation = 0): Layer =>
    ({
      ...base,
      id: `${project.id}-photo-${n}`,
      type: 'photo',
      name: `Photo ${n}`,
      x: 250,
      y,
      width: 1900,
      height: 880,
      rotation,
      zIndex: n,
      photoNumber: n,
      fit: 'cover',
      frame: { style: 'solid', thickness: 12, color: literalColor('#ffffff') },
      cornerRadius: 0
    }) as Layer
  const groupId = `${project.id}-group`
  project.layers = [
    {
      ...base,
      id: `${project.id}-accent`,
      type: 'shape',
      name: 'Accent bar (off-canvas)',
      x: -200,
      y: 3050,
      width: 1100,
      height: 90,
      zIndex: 0,
      shape: 'rectangle',
      fill: literalColor('#b08d57'),
      stroke: null,
      cornerRadius: 0
    } as Layer,
    photo(1, 200, 3),
    photo(2, 1180),
    photo(3, 2160),
    {
      ...base,
      id: `${project.id}-sticker`,
      type: 'image',
      name: 'Sticker',
      x: 1750,
      y: 80,
      width: 560,
      height: 560,
      rotation: 15,
      zIndex: 4,
      assetId,
      role: 'graphic',
      fit: 'cover'
    } as Layer,
    {
      ...base,
      id: `${project.id}-title`,
      type: 'text',
      name: 'Event title',
      x: 200,
      y: 3130,
      width: 2000,
      height: 170,
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
      id: `${project.id}-date`,
      type: 'text',
      name: 'Date and location',
      x: 200,
      y: 3330,
      width: 2000,
      height: 210,
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
    {
      ...base,
      id: groupId,
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
      id: `${groupId}-frame`,
      type: 'shape',
      name: 'Ornament frame',
      parentId: groupId,
      x: 100,
      y: 60,
      width: 420,
      height: 300,
      zIndex: 0,
      shape: 'rectangle',
      fill: null,
      stroke: { color: literalColor('#b08d57'), width: 10 },
      cornerRadius: 0
    } as Layer,
    {
      ...base,
      id: `${groupId}-text`,
      type: 'text',
      name: 'Ornament text',
      parentId: groupId,
      x: 120,
      y: 160,
      width: 380,
      height: 90,
      zIndex: 1,
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
  return {
    project,
    assets: [{ path: 'assets/sample.png', data: Buffer.from(STICKER_PNG_BASE64, 'base64') }]
  }
}
