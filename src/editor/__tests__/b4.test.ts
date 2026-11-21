import { describe, expect, it } from 'vitest'
import {
  actionLabel,
  buildChecks,
  checkTopic,
  checksButtonState,
  exportReadiness,
  type CheckInput
} from '../checks'
import {
  cardState,
  exportButtonLabel,
  exportCards,
  filesSummary,
  firstUseSelection,
  toggleCard
} from '../exportCards'
import { exportOutputs } from '../exportPlan'
import {
  FOR_YOU_NOTES,
  importFoundSummary,
  importLayoutChoices,
  layoutMeaning,
  splitImportNotes,
  type ImportNote
} from '../importView'
import { dslrOutputs } from '@export/dslrbooth/outputs'
import { makeProject } from './helpers'

/** Phase 7B B4: Checks, Export cards and the dslrBooth import presentation. */

const item = (
  code: string,
  severity: CheckInput['severity'],
  message = `${code}.`,
  layerIds: string[] = []
): CheckInput => ({ code, severity, message, layerIds })

describe('Checks model (B1 mockup 07)', () => {
  it('groups by severity in the order Error → Needs attention → Good to know, with plain labels', () => {
    const m = buildChecks([
      item('hidden-layers', 'info', 'x', ['a']),
      item('font-missing', 'warning', 'Font “X” is not installed.', ['b']),
      item('palette-broken', 'error', 'y', ['c'])
    ])
    expect(m.groups.map((g) => [g.severity, g.label, g.tone])).toEqual([
      ['error', 'Error', 'error'],
      ['warning', 'Needs attention', 'attention'],
      ['info', 'Good to know', 'info']
    ])
  })

  it('Good to know starts collapsed; problems start open', () => {
    const m = buildChecks([item('font-missing', 'warning'), item('hidden-layers', 'info')])
    expect(m.groups.map((g) => g.startsCollapsed)).toEqual([false, true])
  })

  it('only notes → Ready · n notes (never presented as problems)', () => {
    const m = buildChecks([
      item('hidden-layers', 'info'),
      item('output-profile-provisional', 'info'),
      item('artwork-clipped', 'info'),
      item('image-soft-resolution', 'info')
    ])
    expect(m.headline).toEqual({ tone: 'ready', text: 'Ready · 4 notes' })
    expect(checksButtonState(m)).toEqual({ tone: 'ready', text: 'Ready' })
    expect(exportReadiness(m)).toEqual({ tone: 'ready', text: 'Ready to export · 4 notes' })
    expect(buildChecks([]).headline).toEqual({ tone: 'ready', text: 'Ready' })
  })

  it('the button and the Export readiness line read the worst problem', () => {
    const one = { errors: 1, warnings: 2, infos: 0 }
    expect(checksButtonState(one)).toEqual({ tone: 'error', text: '1 error' })
    expect(exportReadiness(one)).toEqual({ tone: 'error', text: 'Fix 1 error before exporting' })
    const att = { errors: 0, warnings: 2, infos: 3 }
    expect(checksButtonState(att)).toEqual({ tone: 'attention', text: '2 need attention' })
    expect(exportReadiness(att).text).toBe('Almost ready · 2 things to look at')
    expect(checksButtonState({ errors: 0, warnings: 1, infos: 0 }).text).toBe('1 needs attention')
    expect(exportReadiness({ errors: 0, warnings: 1, infos: 0 }).text).toBe(
      'Almost ready · 1 thing to look at'
    )
  })

  it('merges repeats of one finding into one card with Select all, keeping every message for Details', () => {
    const m = buildChecks([
      item('safe-area-margin', 'warning', 'Text “Date” is 2.5 mm from the bottom edge; keep …', [
        'd'
      ]),
      item('safe-area-margin', 'warning', 'Text “Tag” is 1 mm from the left edge; keep …', ['t']),
      item('safe-area-margin', 'warning', 'Photo slot 3 is 2 mm from the cut; keep …', ['p'])
    ])
    expect(m.warnings).toBe(1)
    const c = m.groups[0]!.cards[0]!
    expect(c).toMatchObject({
      title: '3 items are close to the edge',
      count: 3,
      layerIds: ['d', 't', 'p'],
      actions: ['select-all', 'printer'],
      topic: 'Safe area'
    })
    expect(c.details).toHaveLength(3)
    expect(actionLabel('select-all', c)).toBe('Select all 3')
  })

  it('one safe-area finding is titled with its subject and offers Select', () => {
    const m = buildChecks([
      item('safe-area-trim', 'warning', 'Text “JUNE 14” enters the expected trim at …', ['d'])
    ])
    const c = m.groups[0]!.cards[0]!
    expect(c.title).toBe('Text “JUNE 14” may be trimmed')
    expect(c.actions).toEqual(['select', 'printer'])
    expect(actionLabel('select', c)).toBe('Select')
  })

  it('a font missing in 3 texts is one card: "3 texts use a font that isn’t installed"', () => {
    const m = buildChecks([item('font-missing', 'warning', 'Font “Cormorant” …', ['a', 'b', 'c'])])
    expect(m.groups[0]!.cards[0]).toMatchObject({
      title: '3 texts use a font that isn’t installed',
      topic: 'Font',
      actions: ['select-all']
    })
  })

  it('offers only working actions: never Fix, Move inside or Later; no action without layers or a printer', () => {
    const m = buildChecks([
      item('photo-number-gap', 'info'),
      item('no-photo-slots', 'warning'),
      item('dslr-flattened', 'info')
    ])
    for (const g of m.groups) for (const c of g.cards) expect(c.actions).toEqual([])
    const all = buildChecks([
      item('asset-missing', 'error', 'm', ['x']),
      item('output-profile-provisional', 'info')
    ])
      .groups.flatMap((g) => g.cards)
      .flatMap((c) => c.actions)
    expect(new Set(all)).toEqual(new Set(['select', 'printer']))
    for (const a of ['select', 'select-all', 'printer'] as const)
      expect(actionLabel(a, { layerIds: ['a', 'b'] })).not.toMatch(/fix|move inside|later/i)
  })

  it('never shows internal check codes as titles or topics', () => {
    const codes = [
      'composition-invalid',
      'asset-missing',
      'asset-unreadable',
      'palette-broken',
      'photo-number-invalid',
      'photo-number-gap',
      'no-photo-slots',
      'photo-slot-outside',
      'font-missing',
      'font-unknown',
      'image-low-resolution',
      'image-soft-resolution',
      'artwork-clipped',
      'artwork-off-canvas',
      'hidden-layers',
      'output-profile-mismatch',
      'output-profile-layout',
      'output-profile-provisional',
      'safe-area-cut',
      'safe-area-trim',
      'safe-area-margin',
      'safe-area-clear',
      'dslr-no-photo-slots',
      'dslr-photo-number-range',
      'dslr-photo-fit',
      'dslr-photo-opacity',
      'dslr-photo-rotation',
      'dslr-resolution',
      'dslr-flattened',
      'dslr-two-up',
      'some-future-code'
    ]
    const m = buildChecks(codes.map((c) => item(c, 'warning', 'A finding. More words.', ['x'])))
    for (const c of m.groups.flatMap((g) => g.cards)) {
      expect(c.title).not.toContain(c.code)
      expect(c.title.length).toBeGreaterThan(3)
      expect(c.topic).not.toContain('-')
    }
    expect(checkTopic('dslr-two-up')).toBe('dslrBooth')
    expect(checkTopic('font-missing')).toBe('Font')
    expect(checkTopic('safe-area-trim')).toBe('Safe area')
  })
})

describe('Export cards (B1 mockup 08, owner decision R2)', () => {
  const strip = {
    ...makeProject([], 'strip-2x6-300'),
    metadata: { ...makeProject().metadata, name: 'Ava & Theo' }
  }
  const outputs = [...dslrOutputs(strip), ...exportOutputs(strip)]

  it('three picture cards map onto the existing outputs', () => {
    const cards = exportCards(outputs)
    expect(cards.map((c) => [c.id, c.title, c.kinds])).toEqual([
      ['booth', 'For the booth', ['dslrbooth']],
      ['print', 'Print files', ['print', 'design']],
      ['proof', 'Client proof', ['proof']]
    ])
    expect(cards[0]!.description).toMatch(/two per sheet/)
    expect(cards[1]!.description).toBe('The 4×6 sheet and the single 2×6 design as pictures.')
    expect(cards[2]!.description).toMatch(/numbered photo slots/)
    expect(cards.map((c) => c.description).join(' ')).not.toMatch(/sample|people|shuffle/i)
  })

  it('first use: For the booth on, Print files off, Client proof off', () => {
    const sel = firstUseSelection(outputs)
    expect(sel).toEqual(['dslrbooth'])
    const [booth, print, proof] = exportCards(outputs)
    expect([cardState(booth!, sel), cardState(print!, sel), cardState(proof!, sel)]).toEqual([
      'on',
      'off',
      'off'
    ])
    // The 4×6 dslrBooth template stays an extra under More options.
    expect(sel).not.toContain('dslrbooth-4x6')
  })

  it('clicking a card toggles all of its outputs; a partly-on card reads mixed and turns off', () => {
    const [, print] = exportCards(outputs)
    let sel = toggleCard(print!, ['dslrbooth'])
    expect(sel).toEqual(['dslrbooth', 'print', 'design'])
    expect(cardState(print!, ['print'])).toBe('mixed')
    sel = toggleCard(print!, ['dslrbooth', 'print'])
    expect(sel).toEqual(['dslrbooth'])
  })

  it('the files line counts what will be created, in the dialog order', () => {
    expect(filesSummary(outputs, ['dslrbooth'])).toMatchObject({
      count: 1,
      text: 'Creates 1 file',
      names: ['Ava & Theo.zip']
    })
    const three = filesSummary(outputs, ['design', 'dslrbooth', 'print'])
    expect(three.text).toBe('Creates 3 files')
    expect(three.names).toEqual(['Ava & Theo.zip', 'Ava & Theo-print.png', 'Ava & Theo-design.png'])
    expect(filesSummary(outputs, []).count).toBe(0)
    expect(exportButtonLabel(3)).toBe('Export 3 files…')
    expect(exportButtonLabel(1)).toBe('Export 1 file…')
  })

  it('a single-up 4×6 has a one-file print card', () => {
    const p = makeProject([], 'photo-4x6-portrait-600')
    const cards = exportCards([...dslrOutputs(p), ...exportOutputs(p)])
    expect(cards.find((c) => c.id === 'print')!.kinds).toEqual(['print'])
    expect(cards.find((c) => c.id === 'booth')!.description).not.toMatch(/two per sheet/)
  })
})

describe('dslrBooth import presentation (B1 mockup 10)', () => {
  const twoUp = {
    widthIn: 4,
    heightIn: 6,
    photoSlots: 6,
    photoCount: 3,
    images: 2,
    twoUp: { stripWidthIn: 2, stripHeightIn: 6 },
    recommendedLayout: 'strip' as const
  }

  it('a recognised two-strip sheet reads in plain words', () => {
    expect(importFoundSummary(twoUp)).toEqual({
      headline: 'We found a 2×6 design printed twice on a 4×6 sheet.',
      detail: '3 photo slots per strip · 2 pictures on the sheet'
    })
    expect(
      importFoundSummary({ ...twoUp, twoUp: null, photoSlots: 4, photoCount: 4 }).headline
    ).toBe('We found a 4×6 design.')
  })

  it('One strip, printed two per sheet is Recommended and listed first; the as-is option stays', () => {
    const c = importLayoutChoices(twoUp)
    expect(c.map((x) => [x.value, x.recommended])).toEqual([
      ['strip', true],
      ['as-is', false]
    ])
    expect(c[0]!.title).toBe('One 2×6 strip, printed two per sheet')
    expect(c[1]!.title).toBe('The 4×6 sheet exactly as it is')
    expect(importLayoutChoices({ ...twoUp, twoUp: null })).toEqual([])
    expect(layoutMeaning('strip')).toMatch(/second copy/)
    expect(layoutMeaning('as-is')).toMatch(/not copied/)
  })

  it('notes: everything that needs attention plus a few useful notes go to For you; nothing is dropped', () => {
    const notes: ImportNote[] = [
      { severity: 'warning', code: 'text-overflow', message: 'a' },
      { severity: 'warning', code: 'z-index-tie', message: 'b' },
      { severity: 'warning', code: 'shadow', message: 'c' },
      { severity: 'info', code: 'live-text', message: 'd' },
      { severity: 'info', code: 'two-up', message: 'e' },
      { severity: 'info', code: 'original-device', message: 'f' },
      { severity: 'info', code: 'text-fonts', message: 'g' },
      { severity: 'info', code: 'unused-files', message: 'h' }
    ]
    const s = splitImportNotes(notes)
    expect(s.forYou.map((n) => n.code)).toEqual([
      'text-overflow',
      'z-index-tie',
      'shadow',
      'live-text'
    ])
    // The two-up note is said by the layout meaning ("You edit one strip…"), so it sits with the technical notes.
    expect(s.technical.map((n) => n.code)).toEqual([
      'two-up',
      'original-device',
      'text-fonts',
      'unused-files'
    ])
    expect(s.forYou.length + s.technical.length).toBe(notes.length)
    expect(FOR_YOU_NOTES).toContain('flattened-artwork')
  })
})
