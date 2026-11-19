import { describe, expect, it } from 'vitest'
import {
  HEIGHT_SHORT,
  HEIGHT_TALL,
  MIN_CANVAS_VIEWPORT,
  WIDTH_MEDIUM,
  WIDTH_WIDE,
  dialogMaxHeight,
  drawerMayDock,
  heightTier,
  printPreviewActionLabel,
  usesPanelTabs,
  widthTier
} from '../responsive'
import {
  SEVERITY_TONE,
  STATUS_LABELS,
  checksHeadline,
  severityLabel,
  severityStartsCollapsed
} from '../severity'

describe('responsive foundation', () => {
  it('width tiers: ≥ 1600 wide, 1280–1599 medium, below narrow', () => {
    expect([WIDTH_WIDE, WIDTH_MEDIUM]).toEqual([1600, 1280])
    expect(widthTier(1920)).toBe('wide')
    expect(widthTier(1600)).toBe('wide')
    expect(widthTier(1599)).toBe('medium')
    expect(widthTier(1280)).toBe('medium')
    expect(widthTier(1279)).toBe('narrow')
    expect(drawerMayDock(1600)).toBe(true)
    expect(drawerMayDock(1426)).toBe(false)
  })

  it('height tiers: ≥ 860 stack, < 860 tabs, < 720 very short', () => {
    expect([HEIGHT_TALL, HEIGHT_SHORT]).toEqual([860, 720])
    expect(heightTier(1000)).toBe('tall')
    expect(heightTier(860)).toBe('tall')
    expect(heightTier(779)).toBe('short')
    expect(heightTier(719)).toBe('very-short')
    expect(usesPanelTabs(1000)).toBe(false)
    expect(usesPanelTabs(779)).toBe(true)
  })

  it('dialogs use nearly the full height on very short windows', () => {
    expect(dialogMaxHeight(1000)).toBe(860)
    expect(dialogMaxHeight(700)).toBe(676)
  })

  it('"See how it prints" shortens to "Preview" on narrow windows, never to icon-only', () => {
    expect(printPreviewActionLabel(1426)).toBe('See how it prints')
    expect(printPreviewActionLabel(1200)).toBe('Preview')
  })

  it('the minimum useful canvas viewport is 520 × 400', () => {
    expect(MIN_CANVAS_VIEWPORT).toEqual({ width: 520, height: 400 })
  })
})

describe('severity language', () => {
  it('maps internal severities to Error / Needs attention / Good to know', () => {
    expect(SEVERITY_TONE).toEqual({ error: 'error', warning: 'attention', info: 'info' })
    expect(severityLabel('error')).toBe('Error')
    expect(severityLabel('warning')).toBe('Needs attention')
    expect(severityLabel('info')).toBe('Good to know')
    expect(STATUS_LABELS.ready).toBe('Ready')
  })

  it('"Good to know" starts collapsed; problems start open', () => {
    expect(severityStartsCollapsed('info')).toBe(true)
    expect(severityStartsCollapsed('warning')).toBe(false)
    expect(severityStartsCollapsed('error')).toBe(false)
  })

  it('notes alone read as Ready, never as problems', () => {
    expect(checksHeadline({ errors: 0, warnings: 0, infos: 0 })).toEqual({
      tone: 'ready',
      text: 'Ready'
    })
    expect(checksHeadline({ errors: 0, warnings: 0, infos: 8 })).toEqual({
      tone: 'ready',
      text: 'Ready · 8 notes'
    })
    expect(checksHeadline({ errors: 0, warnings: 1, infos: 1 })).toEqual({
      tone: 'attention',
      text: '1 needs attention · 1 note'
    })
    expect(checksHeadline({ errors: 2, warnings: 3, infos: 0 })).toEqual({
      tone: 'error',
      text: '2 errors · 3 need attention'
    })
  })

  it('labels never expose raw check codes', () => {
    const { text } = checksHeadline({ errors: 1, warnings: 1, infos: 1 })
    expect(text).not.toMatch(/[a-z]+-[a-z]+/)
  })
})
