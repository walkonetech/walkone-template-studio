/**
 * Konva needs colours as JS values. These are the canvas OVERLAY colours (selection, snapping guides, safe areas):
 * editor-only, never exported, and deliberately the SAME in the Light and Dark themes (ADR-055), because they are
 * drawn over arbitrary artwork, not over the app chrome. They mirror the `--p-ov-*` primitives in styles/tokens.css
 * (a unit test keeps the two in step). Artwork itself is never themed.
 */
export const CANVAS_THEME = {
  /** Selection handles / transformer (indigo, like selection everywhere; never an element-kind hue). */
  accent: '#7b8cff',
  guide: '#ff5f8f',
  handleFill: '#ffffff',
  /** The bounding outline is deliberately quieter than the handles so it does not compete with the artwork. */
  outline: 'rgba(123, 140, 255, 0.55)',
  artboardEdge: 'rgba(0, 0, 0, 0.55)',
  /** Safe areas (ADR-053). Editor-only guides, never printed. Trim uses the muted amber approved in B1 (V6). */
  safeLine: '#3ec7c0',
  trimFill: 'rgba(220, 162, 78, 0.16)',
  trimHatch: 'rgba(220, 162, 78, 0.7)',
  flagged: '#f27d78'
} as const
