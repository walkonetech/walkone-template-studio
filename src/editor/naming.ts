import type { Layer } from '@domain'

/** Friendly default label: "Rectangle", then "Rectangle 2", ... Names are labels only and may repeat. */
export function uniqueName(base: string, layers: readonly Layer[]): string {
  const names = new Set(layers.map((l) => l.name))
  if (!names.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`
    if (!names.has(candidate)) return candidate
  }
}
