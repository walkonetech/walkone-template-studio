import { createProject, literalColor, type Layer, type TemplateProject } from '@domain'
import type { EditorPorts } from '../ports'
import type { ImportAssetsResult, OpenProjectInfo } from '@shared/ipc'

export const T0 = '2026-01-01T00:00:00.000Z'

const common = { rotation: 0, opacity: 1, visible: true, locked: false }

export function photo(id: string, n: number, over: Partial<Layer> = {}): Layer {
  return {
    ...common,
    id,
    type: 'photo',
    name: `Photo ${n}`,
    x: 250,
    y: 200 * n,
    width: 1900,
    height: 800,
    zIndex: n,
    photoNumber: n,
    fit: 'cover',
    frame: { style: 'solid', thickness: 12, color: literalColor('#ffffff') },
    cornerRadius: 0,
    ...over
  } as Layer
}

export function shape(id: string, z: number, over: Partial<Layer> = {}): Layer {
  return {
    ...common,
    id,
    type: 'shape',
    name: id,
    x: 100,
    y: 100,
    width: 300,
    height: 200,
    zIndex: z,
    shape: 'rectangle',
    fill: literalColor('#336699'),
    stroke: null,
    cornerRadius: 0,
    ...over
  } as Layer
}

export function text(id: string, z: number, over: Partial<Layer> = {}): Layer {
  return {
    ...common,
    id,
    type: 'text',
    name: id,
    x: 200,
    y: 3000,
    width: 2000,
    height: 200,
    zIndex: z,
    content: 'Hello',
    fontFamily: 'Georgia',
    fontSize: 150,
    fontWeight: 700,
    fontStyle: 'normal',
    align: 'center',
    lineHeight: 1.1,
    letterSpacing: 0,
    fill: literalColor('#222222'),
    ...over
  } as Layer
}

export function group(id: string, z: number, over: Partial<Layer> = {}): Layer {
  return {
    ...common,
    id,
    type: 'group',
    name: id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    zIndex: z,
    ...over
  } as Layer
}

export function makeProject(
  layers: Layer[] = [],
  preset: Parameters<typeof createProject>[0]['design'] = 'photo-4x6-portrait-600'
): TemplateProject {
  let n = 0
  const p = createProject({ name: 'Test', design: preset, now: T0, createId: () => `proj-${++n}` })
  return { ...p, layers }
}

export const scene = (): TemplateProject =>
  makeProject([
    shape('bg-bar', 0),
    photo('photo-1', 1),
    photo('photo-2', 2),
    photo('photo-3', 3),
    text('title', 4),
    group('g', 5, { x: 1000, y: 1000, width: 400, height: 300 }),
    shape('g-a', 0, { parentId: 'g', x: 1000, y: 1000, width: 200, height: 300 }),
    shape('g-b', 1, { parentId: 'g', x: 1200, y: 1000, width: 200, height: 300 })
  ])

export interface FakePorts extends EditorPorts {
  calls: { name: string; args: unknown[] }[]
  workingCopies: TemplateProject[]
  /** Results the next import calls (dialog or dropped bytes) return, in order; empty → the dialog is cancelled. */
  importQueue: ImportAssetsResult[]
}

/** Ports that behave like a successful main process, recording every call. */
export function fakePorts(initial?: TemplateProject): FakePorts {
  const calls: { name: string; args: unknown[] }[] = []
  const workingCopies: TemplateProject[] = []
  const importQueue: ImportAssetsResult[] = []
  let file: string | null = null
  const info = (project: TemplateProject, dirty: boolean): OpenProjectInfo => ({
    sessionId: 'sess-1',
    project,
    fileName: file,
    dirty,
    warnings: []
  })
  const rec = <T>(name: string, args: unknown[], value: T): Promise<T> => {
    calls.push({ name, args })
    return Promise.resolve(value)
  }
  return {
    calls,
    workingCopies,
    importQueue,
    importAssets: (sessionId, multiple) => {
      const next = importQueue.shift()
      return rec(
        'importAssets',
        [sessionId, multiple],
        next ? { status: 'ok' as const, value: next } : { status: 'cancelled' as const }
      )
    },
    importAssetData: (sessionId, files) => {
      const next = importQueue.shift()
      return rec(
        'importAssetData',
        [sessionId, files.map((f) => f.name)],
        next ? { status: 'ok' as const, value: next } : { status: 'cancelled' as const }
      )
    },
    create: (req) =>
      rec('create', [req], { status: 'ok' as const, value: info(initial ?? makeProject(), true) }),
    newSample: () =>
      rec('newSample', [], { status: 'ok' as const, value: info(initial ?? scene(), true) }),
    open: () => {
      file = 'opened.boothproject'
      return rec('open', [], { status: 'ok' as const, value: info(initial ?? scene(), false) })
    },
    openRecent: (path) => {
      file = 'recent.boothproject'
      return rec('openRecent', [path], {
        status: 'ok' as const,
        value: info(initial ?? scene(), false)
      })
    },
    locateRecent: (path) => {
      file = 'located.boothproject'
      return rec('locateRecent', [path], {
        status: 'ok' as const,
        value: info(initial ?? scene(), false)
      })
    },
    save: (sessionId, project) => {
      file = file ?? 'saved.boothproject'
      return rec('save', [sessionId, project], {
        status: 'ok' as const,
        value: info(project, false)
      })
    },
    saveAs: (sessionId, project) => {
      file = 'as.boothproject'
      return rec('saveAs', [sessionId, project], {
        status: 'ok' as const,
        value: info(project, false)
      })
    },
    updateWorkingCopy: (sessionId, project) => {
      workingCopies.push(project)
      return rec('updateWorkingCopy', [sessionId], {
        status: 'ok' as const,
        value: { dirty: true }
      })
    },
    close: (sessionId) => rec('close', [sessionId], { status: 'ok' as const, value: null }),
    recents: () => rec('recents', [], { status: 'ok' as const, value: [] }),
    requestClose: (reason) =>
      rec('requestClose', [reason], { status: 'ok' as const, value: { proceed: true } }),
    recoveryList: () =>
      rec('recoveryList', [], { status: 'ok' as const, value: { candidates: [], quarantined: 0 } }),
    recover: (sessionId) =>
      rec('recover', [sessionId], { status: 'ok' as const, value: info(initial ?? scene(), true) }),
    discardRecovery: (sessionId) =>
      rec('discardRecovery', [sessionId], { status: 'ok' as const, value: null }),
    dslrImportCommit: (token, layout) =>
      rec('dslrImportCommit', [token, layout], {
        status: 'ok' as const,
        value: info(initial ?? scene(), true)
      })
  }
}
