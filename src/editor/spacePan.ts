/**
 * Spacebar pan (hold Space, drag to pan). Pure decision helpers; the renderer hook wires them to real events.
 * Space must never be stolen from typing, and must not fire the keyboard activation of a focused button unless the
 * pointer is over the workspace (where the user clearly means "pan").
 */
export interface KeyTarget {
  tagName?: string
  isContentEditable?: boolean
  role?: string | null
}

const TYPING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const INTERACTIVE_TAGS = new Set(['BUTTON', 'A', 'SUMMARY'])
const INTERACTIVE_ROLES = new Set([
  'button',
  'radio',
  'menuitem',
  'menuitemcheckbox',
  'tab',
  'checkbox',
  'switch',
  'slider'
])

/** Text entry: Space belongs to the field. */
export const isTypingTarget = (t: KeyTarget | null | undefined): boolean =>
  !!t &&
  (TYPING_TAGS.has((t.tagName ?? '').toUpperCase()) ||
    t.isContentEditable === true ||
    t.role === 'textbox')

/** A control that uses Space to activate itself. */
export const isActivatableTarget = (t: KeyTarget | null | undefined): boolean =>
  !!t &&
  (INTERACTIVE_TAGS.has((t.tagName ?? '').toUpperCase()) ||
    (t.role != null && INTERACTIVE_ROLES.has(t.role)))

export function canStartSpacePan(i: {
  code: string
  repeat: boolean
  target: KeyTarget | null | undefined
  pointerOverWorkspace: boolean
  /** Command/Ctrl/Alt held: that is a shortcut, not a pan. */
  hasModifier: boolean
  /** The text-edit overlay (or another modal interaction) owns the keyboard. */
  editingText: boolean
}): boolean {
  if (i.code !== 'Space' || i.repeat || i.hasModifier || i.editingText) return false
  if (isTypingTarget(i.target)) return false
  if (isActivatableTarget(i.target) && !i.pointerOverWorkspace) return false
  return true
}
