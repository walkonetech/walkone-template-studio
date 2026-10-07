/** Development/validation flag: the `#debug` URL hash (also installs `window.__wts`). Never set for normal users. */
export const isDebugSession = (): boolean => window.location.hash.includes('debug')
