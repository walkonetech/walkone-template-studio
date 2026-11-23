import { describe, expect, it } from 'vitest'
import { assignMnemonics, createAltTap, mnemonicTarget, typeaheadTarget } from '../menuKeys'
import { COMMANDS, MENUS } from '../commands'

describe('menu access keys (B6)', () => {
  it('prefers the first letter, then later word starts, then any letter; never duplicates', () => {
    const labels = ['Save', 'Save as…', 'Settings…', 'Export…', 'Exit']
    const m = assignMnemonics(labels)
    const letters = m.map((i, n) => (i === null ? null : labels[n]![i]!.toLowerCase()))
    expect(letters).toEqual(['s', 'a', 'e', 'x', 'i'])
    expect(new Set(letters).size).toBe(letters.length)
  })
  it('gives no key rather than a duplicate', () => {
    expect(assignMnemonics(['A', 'a', 'B'])).toEqual([0, null, 0])
  })
  it('every application menu has a unique access key for every item', () => {
    for (const menu of MENUS) {
      const labels = menu.items.filter((i) => i !== '-').map((i) => COMMANDS[i].label)
      const m = assignMnemonics(labels)
      expect(
        m.every((i) => i !== null),
        `${menu.label}: ${labels.join(', ')}`
      ).toBe(true)
      const letters = m.map((i, n) => labels[n]![i!]!.toLowerCase())
      expect(new Set(letters).size, menu.label).toBe(letters.length)
    }
  })
  it('the menu titles themselves have unique first letters (Alt + letter)', () => {
    const first = MENUS.map((m) => m.label[0]!.toLowerCase())
    expect(new Set(first).size).toBe(first.length)
  })
  it('a typed letter finds its item (case-insensitive)', () => {
    const labels = ['Undo', 'Redo', 'Duplicate']
    const m = assignMnemonics(labels)
    expect(mnemonicTarget(labels, m, 'R')).toBe(1)
    expect(mnemonicTarget(labels, m, 'd')).toBe(2)
    expect(mnemonicTarget(labels, m, 'q')).toBe(-1)
    expect(mnemonicTarget(labels, m, 'Enter')).toBe(-1)
  })
  it('macOS type-to-select moves to the next item starting with the letter, wrapping', () => {
    const labels = ['Save', 'Save as…', 'Export…', 'Settings…']
    expect(typeaheadTarget(labels, -1, 's')).toBe(0)
    expect(typeaheadTarget(labels, 0, 's')).toBe(1)
    expect(typeaheadTarget(labels, 1, 's')).toBe(3)
    expect(typeaheadTarget(labels, 3, 's')).toBe(0)
    expect(typeaheadTarget(labels, 0, 'z')).toBe(-1)
  })
  it('a tap on Alt is press + release with nothing in between', () => {
    const t = createAltTap()
    t.down('Alt')
    expect(t.up('Alt')).toBe(true)
    t.down('Alt')
    t.down('Alt', true) // key repeat while held
    expect(t.up('Alt')).toBe(true)
    t.down('Alt')
    t.down('f') // Alt + F is a shortcut, not a tap
    expect(t.up('Alt')).toBe(false)
    t.down('Alt')
    t.cancel() // pointer press / window blur
    expect(t.up('Alt')).toBe(false)
    expect(t.up('Alt')).toBe(false)
  })
})
