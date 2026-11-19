/** Konva needs colours as JS values; these mirror the CSS tokens (--c-accent, --c-guide). Editor-only: never exported. */
export const CANVAS_THEME = {
  accent: '#7b8cff',
  guide: '#ff5f8f',
  handleFill: '#ffffff',
  /** The bounding outline is deliberately quieter than the handles so it does not compete with the artwork. */
  outline: 'rgba(123, 140, 255, 0.55)',
  artboardEdge: 'rgba(0, 0, 0, 0.55)',
  /** Safe areas (ADR-053; mirror --c-safe / --c-warning / --c-error). Editor-only guides, never printed. */
  safeLine: '#3ec7c0',
  trimFill: 'rgba(242, 176, 76, 0.16)',
  trimHatch: 'rgba(242, 176, 76, 0.7)',
  flagged: '#f27d78'
} as const
