import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Phase 7B B4 source guards: the workflow surfaces stay free of Sample Photos, dev notes and dead actions. */
describe('B4 source guards', () => {
  const root = resolve(__dirname, '../../renderer/src/editor')
  const read = (f: string): string => readFileSync(resolve(root, f), 'utf8')

  it('the B4 surfaces never bring back Sample Photos or a Reposition action', () => {
    for (const f of [
      'ExportDialog.tsx',
      'OutputProfileDialog.tsx',
      'DslrImportDialog.tsx',
      'CheckList.tsx',
      'ChecksButton.tsx',
      'illustrations.tsx'
    ]) {
      // Code only (comments may explain the removal).
      const src = read(f)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
      expect(src, f).not.toMatch(/sample ?photo|shuffle|reset samples|choose photo|reposition/i)
      expect(src, f).not.toMatch(/<image\b|<img\b(?![^>]*dslrBooth’s preview)/)
    }
  })

  it('the Printer & cutting dialog shows no repository paths or developer notes', () => {
    const src = read('OutputProfileDialog.tsx')
    expect(src).not.toMatch(/research\/|docs\/|\.md\b|Source:/)
  })

  it('the Checks panel offers no disabled future actions', () => {
    for (const f of ['CheckList.tsx', 'ChecksButton.tsx'])
      expect(read(f)).not.toMatch(/>\s*(Fix|Move inside|Later)\s*</)
  })

  it('the safe-area warning keeps its outline and adds a halo of the same rectangle', () => {
    const src = read('SafeAreaOverlay.tsx')
    expect(src).toMatch(/name="safe-flag-halo"/)
    expect(src).toMatch(/name="safe-flag"/)
    // Both rectangles are drawn from the same box: the halo adds no geometry.
    expect(src.match(/\{\.\.\.box\}/g)).toHaveLength(2)
    expect(readdirSync(root)).toContain('illustrations.tsx')
  })
})
