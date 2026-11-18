import { describe, expect, it } from 'vitest'
import { exportFileName, exportFileStem, isSafeExportFileName, uniqueFileName } from '../naming'
import { isSafePackageEntryPath } from '../package'

describe('exportFileStem', () => {
  it('keeps readable names, including punctuation and non-Latin letters', () => {
    expect(exportFileStem("Mya & Myka's Sweet 16 4-18-2025")).toBe(
      "Mya & Myka's Sweet 16 4-18-2025"
    )
    expect(exportFileStem('Boda de María')).toBe('Boda de María')
  })
  it('removes characters invalid on Windows or macOS and collapses whitespace', () => {
    expect(exportFileStem('A/B\\C:D*E?F"G<H>I|J')).toBe('A B C D E F G H I J')
    expect(exportFileStem('  lots   of\tspace  ')).toBe('lots of space')
  })
  it('is the one rule for Save and Export (6C W5: the same name gave two different files)', () => {
    expect(exportFileStem('Sam: "A/B" <Test>? June')).toBe('Sam A B Test June')
  })

  it('trims leading/trailing dots and handles empty or reserved names', () => {
    expect(exportFileStem('...hidden...')).toBe('hidden')
    expect(exportFileStem('///')).toBe('Untitled')
    expect(exportFileStem('CON')).toBe('CON_')
  })
  it('caps the length', () => {
    expect(exportFileStem('x'.repeat(300)).length).toBe(100)
  })
})

describe('exportFileName', () => {
  it('appends a suffix per kind', () => {
    expect(exportFileName('Chaney Wedding', 'print')).toBe('Chaney Wedding-print.png')
    expect(exportFileName('Chaney Wedding', 'design')).toBe('Chaney Wedding-design.png')
    expect(exportFileName('Chaney Wedding', 'proof')).toBe('Chaney Wedding-proof.png')
    expect(exportFileName('Chaney Wedding', 'package')).toBe('Chaney Wedding-layers.zip')
  })
  it('always produces a name the main process accepts', () => {
    for (const n of ['', 'CON', 'a/b', '  .x. ', 'é'.repeat(200), 'Party 🎉'])
      for (const k of ['print', 'design', 'proof', 'package'] as const)
        expect(isSafeExportFileName(exportFileName(n, k))).toBe(true)
  })
})

describe('isSafeExportFileName', () => {
  it('rejects paths, hidden files, other extensions and reserved names', () => {
    for (const bad of [
      '../x.png',
      'a/b.png',
      'a\\b.png',
      '.x.png',
      'x.exe',
      'x.png ',
      'CON.png',
      'nul.zip',
      'x'
    ])
      expect(isSafeExportFileName(bad)).toBe(false)
    expect(isSafeExportFileName('Event-print.png')).toBe(true)
    expect(isSafeExportFileName('Event-layers.ZIP')).toBe(true)
  })
})

describe('uniqueFileName', () => {
  it('adds the first free number before the extension', () => {
    const taken = new Set(['a.png', 'a (2).png'])
    expect(uniqueFileName('a.png', (n) => taken.has(n))).toBe('a (3).png')
    expect(uniqueFileName('b.png', (n) => taken.has(n))).toBe('b.png')
  })
})

describe('isSafePackageEntryPath', () => {
  it('accepts flat lower-case png/json/txt names only', () => {
    expect(isSafePackageEntryPath('background.png')).toBe(true)
    expect(isSafePackageEntryPath('manifest.json')).toBe(true)
    expect(isSafePackageEntryPath('readme.txt')).toBe(true)
    for (const bad of ['../x.png', 'dir/x.png', 'X.png', 'x.svg', '.x.png', 'x..png'])
      expect(isSafePackageEntryPath(bad)).toBe(false)
  })
})
