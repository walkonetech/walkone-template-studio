import type { TemplateProject } from '@domain'

/**
 * Getting-started tips (Phase 7B B5, B1 mockup 02b, owner answer R3). A light card beside the artboard of a NEW BLANK
 * project: three steps, each with one button that does the thing, plus a line about checking before exporting. It is
 * not the Design Guide (7C): no wizard, no modal, nothing changes until the user presses a step's button.
 *
 * Rules:
 *  - Shown on every new blank project while the app preference `showGettingStartedTips` is on (default on).
 *  - "Hide these tips" turns the preference off (this computer); Settings › Editor turns it back on.
 *  - Closing the card (×) hides it for this project only.
 *  - Never on an opened, imported, recovered or sample project.
 */

export type ProjectOrigin = 'new-blank' | 'opened' | 'imported' | 'recovered' | 'sample'

export function tipsVisible(s: {
  pref: boolean
  origin: ProjectOrigin | null
  closedForThisProject: boolean
  viewMode: 'design' | 'preview'
}): boolean {
  return s.pref && s.origin === 'new-blank' && !s.closedForThisProject && s.viewMode === 'design'
}

export type TipStepId = 'photo' | 'text' | 'colors'

export interface TipStep {
  id: TipStepId
  title: string
  text: string
  action: string
  /** Done once the design has what the step adds (the step stays, ticked; nothing disappears under the cursor). */
  done: boolean
}

export function tipSteps(project: TemplateProject): TipStep[] {
  const has = (t: string): boolean => project.layers.some((l) => l.type === t)
  return [
    {
      id: 'photo',
      title: 'Add photo slots',
      text: 'Where the booth puts each guest photo.',
      action: 'Add photo slot',
      done: has('photo')
    },
    {
      id: 'text',
      title: 'Add names and the date',
      text: 'Pick a ready-made text style.',
      action: 'Add text',
      done: has('text')
    },
    {
      id: 'colors',
      title: 'Pick the event colors',
      text: 'Set them once, use them everywhere.',
      action: 'Open Colors',
      done: project.palette.colors.length > 0
    }
  ]
}

/** The closing line: what to do before exporting (B1 flow: See how it prints, then Checks). */
export const TIPS_FOOTER =
  'Before you export, use See how it prints to check the sheet, and Checks for anything near the edge.'
