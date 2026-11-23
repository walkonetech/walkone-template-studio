/**
 * Menu keyboard conventions (Phase 7B B6). Pure helpers; `ui/Menu.tsx` wires them to real events.
 *
 * Windows / Linux: every menu item gets an access key (mnemonic), one underlined letter that is unique inside its
 * menu; pressing the letter while the menu is open activates the item. Letters are assigned deterministically, so a
 * menu's keys never change between openings: the first letter of the label if free, then the first letter of each
 * later word, then any other letter, in order. Disabled items keep their letter (it must not shift when an item
 * becomes available). An item with no free letter gets none rather than a duplicate.
 *
 * macOS has no mnemonics: a letter moves to the next item whose label starts with it (type-to-select), as in native
 * macOS menus.
 */

const isLetter = (ch: string): boolean => /^[a-z0-9]$/i.test(ch)

/** Index in `label` of each item's access-key character, or null. Unique (case-insensitive) within the list. */
export function assignMnemonics(labels: readonly string[]): (number | null)[] {
  const used = new Set<string>()
  return labels.map((label) => {
    const candidates: number[] = []
    // 1. first letter of the label, 2. first letter of each later word, 3. every other letter in order.
    const wordStarts: number[] = []
    for (let i = 0; i < label.length; i++) {
      if (isLetter(label[i]!) && (i === 0 || !isLetter(label[i - 1]!))) wordStarts.push(i)
    }
    candidates.push(...wordStarts)
    for (let i = 0; i < label.length; i++) if (isLetter(label[i]!)) candidates.push(i)
    for (const i of candidates) {
      const ch = label[i]!.toLowerCase()
      if (!used.has(ch)) {
        used.add(ch)
        return i
      }
    }
    return null
  })
}

/** The item a typed letter activates (Windows mnemonic), or -1. */
export function mnemonicTarget(
  labels: readonly string[],
  mnemonics: readonly (number | null)[],
  key: string
): number {
  if (key.length !== 1) return -1
  const k = key.toLowerCase()
  return labels.findIndex((l, i) => {
    const m = mnemonics[i]
    return m != null && l[m]!.toLowerCase() === k
  })
}

/** macOS type-to-select: the next item after `from` whose label starts with `key` (wrapping), or -1. */
export function typeaheadTarget(labels: readonly string[], from: number, key: string): number {
  if (key.length !== 1 || !isLetter(key)) return -1
  const k = key.toLowerCase()
  for (let step = 1; step <= labels.length; step++) {
    const i = (from + step + labels.length) % labels.length
    if (labels[i]!.trim().toLowerCase().startsWith(k)) return i
  }
  return -1
}

/**
 * Windows "tap Alt" (press and release Alt with nothing else in between) toggles keyboard focus into the menu bar.
 * Tracks one press; any other key, a pointer press or the window losing focus cancels it.
 */
export function createAltTap(): {
  down: (key: string, repeat?: boolean) => void
  /** true when this Alt release completes a tap. */
  up: (key: string) => boolean
  cancel: () => void
} {
  let armed = false
  return {
    down: (key, repeat = false) => {
      if (key !== 'Alt') armed = false
      else if (!repeat) armed = true
    },
    up: (key) => {
      const tap = key === 'Alt' && armed
      armed = false
      return tap
    },
    cancel: () => {
      armed = false
    }
  }
}
