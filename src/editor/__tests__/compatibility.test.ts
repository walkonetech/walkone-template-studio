import { describe, expect, it } from 'vitest'
import { checkProjectIntegrity, type TemplateProject } from '@domain'
import { pruneCompatibility } from '../compatibility'
import { createEditorStore } from '../store'
import { fakePorts, scene, T0 } from './helpers'

const withEntries = (p: TemplateProject, ids: string[]): TemplateProject => ({
  ...p,
  sourceCompatibility: {
    dslrbooth: {
      importedAt: T0,
      project: { layout: 'as-is' },
      layers: Object.fromEntries(
        ids.map((id) => [id, { element: 'Photo', attributes: { X: '1' } }])
      )
    }
  }
})

describe('pruneCompatibility', () => {
  it('returns the same project when every entry has its layer', () => {
    const p = withEntries(scene(), ['photo-1'])
    expect(pruneCompatibility(p)).toBe(p)
    const plain = scene()
    expect(pruneCompatibility(plain)).toBe(plain)
  })

  it('drops entries of layers that no longer exist, keeping the rest', () => {
    const p = withEntries(scene(), ['photo-1', 'gone'])
    const out = pruneCompatibility(p)
    expect(Object.keys(out.sourceCompatibility?.dslrbooth?.layers ?? {})).toEqual(['photo-1'])
    expect(out.sourceCompatibility?.dslrbooth?.project).toEqual({ layout: 'as-is' })
    const none = pruneCompatibility(withEntries(scene(), ['gone']))
    expect(none.sourceCompatibility?.dslrbooth).toEqual({
      importedAt: T0,
      project: { layout: 'as-is' }
    })
  })

  it('deleting an imported layer in the editor keeps the project valid; undo brings both back', async () => {
    const start = withEntries(scene(), ['photo-1'])
    const ports = fakePorts(start)
    const store = createEditorStore({ ports })
    const s = () => store.getState()
    await s().openFromDialog()
    expect(s().project?.sourceCompatibility?.dslrbooth?.layers?.['photo-1']).toBeDefined()
    s().selectLayer('photo-1')
    expect(s().deleteSelection()).toBe(true)
    const after = s().project as TemplateProject
    expect(checkProjectIntegrity(after)).toEqual([])
    expect(after.sourceCompatibility?.dslrbooth?.layers).toBeUndefined()
    s().undo()
    expect(s().project?.sourceCompatibility?.dslrbooth?.layers?.['photo-1']).toBeDefined()
  })
})
