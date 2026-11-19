import { describe, expect, it } from 'vitest'
import { createProject, type TemplateProject } from '@domain'
import { DNP_DS_RX1_PROFILE_ID, checkSafeAreas } from '@output'
import { createEditorStore, selectIsDirty, selectOutputProfile } from '../store'
import {
  COMMANDS,
  MENUS,
  isCommandChecked,
  isCommandEnabled,
  type CommandContext
} from '../commands'
import { fakePorts, T0, text } from './helpers'

async function open(p: TemplateProject) {
  const ports = fakePorts(p)
  const store = createEditorStore({ ports })
  await store.getState().openFromDialog()
  return { store, ports, s: () => store.getState() }
}
const strip = (): TemplateProject =>
  createProject({ name: 'S', design: 'strip-2x6-600', now: T0, createId: () => 'p' })

describe('Output Profile selection is editor state, never project state (ADR-053)', () => {
  it('starts with no profile and Safe areas on (inert until a profile is chosen)', async () => {
    const { s } = await open(strip())
    expect(s().outputProfileId).toBeNull()
    expect(selectOutputProfile(s())).toBeNull()
    expect(s().showSafeAreas).toBe(true)
  })

  it('selecting a profile does not change the project, history, autosave or Modified state', async () => {
    const { s, ports } = await open(strip())
    const project = s().project
    const saved = s().savedProject
    const json = JSON.stringify(project)
    const calls = ports.calls.length
    s().setOutputProfile(DNP_DS_RX1_PROFILE_ID)
    expect(selectOutputProfile(s())?.shortName).toBe('DNP DS-RX1')
    s().setShowSafeAreas(false)
    s().setShowSafeAreas(true)
    s().setOutputProfile(null)
    s().setOutputProfile(DNP_DS_RX1_PROFILE_ID)
    expect(s().project).toBe(project)
    expect(s().savedProject).toBe(saved)
    expect(JSON.stringify(s().project)).toBe(json)
    expect(selectIsDirty(s())).toBe(false)
    expect(s().history.past).toHaveLength(0)
    expect(s().autosave.state).toBe('idle')
    expect(ports.calls.length).toBe(calls) // nothing sent to the main process (no working-copy write)
  })

  it('an unknown profile id selects none', async () => {
    const { s } = await open(strip())
    s().setOutputProfile(DNP_DS_RX1_PROFILE_ID)
    s().setOutputProfile('removed-profile')
    expect(s().outputProfileId).toBeNull()
  })

  it('survives opening another project (a per-computer preference), and the project never carries it', async () => {
    const { s } = await open(strip())
    s().setOutputProfile(DNP_DS_RX1_PROFILE_ID)
    s().setShowSafeAreas(false)
    await s().openFromDialog()
    expect(s().outputProfileId).toBe(DNP_DS_RX1_PROFILE_ID)
    expect(s().showSafeAreas).toBe(false)
    const keys = JSON.stringify(s().project)
    expect(keys).not.toMatch(/DS-RX1|outputProfile|safeArea|trim|CUT_2INCH/)
    expect(Object.keys(s().project?.output ?? {}).sort()).toEqual(['layout', 'print'])
  })

  it('edits after choosing a profile are ordinary edits; the safe-area check follows the current project', async () => {
    const { s } = await open(strip())
    s().setOutputProfile(DNP_DS_RX1_PROFILE_ID)
    s().addLayer(text('t', 1, { x: 0, y: 1000, width: 400, height: 100 }))
    const r = checkSafeAreas(s().project as TemplateProject, selectOutputProfile(s()))
    expect(r.flagged.map((f) => f.layerId)).toEqual(['t'])
    s().undo()
    expect(
      checkSafeAreas(s().project as TemplateProject, selectOutputProfile(s())).flagged
    ).toEqual([])
  })
})

describe('View › Safe areas / Output profile… commands', () => {
  const ctx = (o: Partial<CommandContext> = {}): CommandContext => ({
    hasProject: true,
    canUndo: false,
    canRedo: false,
    selectionCount: 0,
    snapping: true,
    previewPhotos: false,
    hasPrintPreview: true,
    showOverflow: true,
    viewMode: 'design',
    hasOutputProfile: false,
    showSafeAreas: true,
    ...o
  })

  it('Safe areas is available only with a profile and is checked when shown', () => {
    expect(isCommandEnabled('view.safeAreas', ctx())).toBe(false)
    expect(isCommandChecked('view.safeAreas', ctx())).toBe(false)
    expect(isCommandEnabled('view.safeAreas', ctx({ hasOutputProfile: true }))).toBe(true)
    expect(isCommandChecked('view.safeAreas', ctx({ hasOutputProfile: true }))).toBe(true)
    expect(
      isCommandChecked('view.safeAreas', ctx({ hasOutputProfile: true, showSafeAreas: false }))
    ).toBe(false)
  })

  it('Output profile… works in Design and Print Preview, with or without a profile', () => {
    expect(isCommandEnabled('view.outputProfile', ctx())).toBe(true)
    expect(isCommandEnabled('view.outputProfile', ctx({ viewMode: 'preview' }))).toBe(true)
    expect(isCommandEnabled('view.outputProfile', ctx({ hasProject: false }))).toBe(false)
    expect(
      isCommandEnabled('view.safeAreas', ctx({ hasOutputProfile: true, viewMode: 'preview' }))
    ).toBe(true)
  })

  it('both live in the View menu next to the other view guides', () => {
    const view = MENUS.find((m) => m.id === 'view')?.items ?? []
    expect(view).toContain('view.safeAreas')
    expect(view).toContain('view.outputProfile')
    expect(COMMANDS['view.safeAreas'].hint).toMatch(/never printed/)
    expect(COMMANDS['view.outputProfile'].hint).toMatch(/not saved in the project/)
  })
})
