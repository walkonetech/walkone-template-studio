import type { TemplateProject } from '@domain'
import { isNativeStrip, mainVariant } from './plan'

/**
 * Can this project be exported as a dslrBooth template (Phase 7B B5.5)? The exporter could write any pixel size, but
 * only these canvases are PROVEN with dslrBooth 7.48 (fixtures and Windows validation): a 2×6 strip and a 4×6 / 6×4
 * print or sheet. A template imported from dslrBooth keeps its own (dslrBooth-made) size. Any other custom size is not
 * offered, with a plain reason, instead of writing a template dslrBooth has never been shown to accept. PNG exports
 * stay available for every project.
 */
export type DslrSupport = { supported: true } | { supported: false; reason: string }

const PROVEN_SIZES: readonly [number, number][] = [
  [4, 6],
  [6, 4],
  [2, 6],
  [6, 2]
]

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6
const inches = (n: number): string => String(Math.round(n * 1000) / 1000)

export function dslrSupport(project: TemplateProject): DslrSupport {
  if (project.sourceCompatibility?.['dslrbooth'] !== undefined) return { supported: true }
  if (isNativeStrip(project)) return { supported: true }
  const print = mainVariant(project) === 'sheet' ? project.output.print : project.canvas.print
  if (PROVEN_SIZES.some(([w, h]) => near(print.width, w) && near(print.height, h)))
    return { supported: true }
  return {
    supported: false,
    reason: `dslrBooth templates are offered for 2×6 strips and 4×6 or 6×4 prints, the sizes tested with dslrBooth. This project prints at ${inches(print.width)}×${inches(print.height)} in, which has not been tested, so export it as PNG files instead.`
  }
}
