/**
 * Window background before the page paints, per resolved theme (ADR-055). Mirrors --c-surface-app in
 * renderer/src/styles/tokens.css. Shared by main (BrowserWindow) and the renderer.
 */
export const WINDOW_BACKGROUND: Readonly<Record<'light' | 'dark', string>> = {
  light: '#f6f6f9',
  dark: '#17181c'
}
