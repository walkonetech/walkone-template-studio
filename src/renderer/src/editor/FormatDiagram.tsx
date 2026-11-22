/**
 * Neutral format diagrams for the Custom Size wizard and My formats (Phase 7B B5.5): the paper, each copy as a
 * numbered rectangle, the sheet margins (dashed), the generic safe margin (dashed, inside each copy) and, when asked,
 * the cut guides. No photos, no people: shapes and numbers only. Decorative (aria-hidden); the same facts are given
 * in words next to every diagram.
 */

export interface DiagramRect {
  x: number
  y: number
  width: number
  height: number
}

export function FormatDiagram({
  sheet,
  copies,
  margins,
  safeInset = 0,
  cutGuides = false,
  invalid = false,
  box = 220,
  testId
}: {
  /** Sheet size in inches (for exact size: the design). */
  sheet: { width: number; height: number }
  /** Copies in inches on the sheet. */
  copies: DiagramRect[]
  margins?: { top: number; right: number; bottom: number; left: number } | null
  /** Generic safe margin in inches (0 = none). */
  safeInset?: number
  cutGuides?: boolean
  /** The copies do not fit: drawn in the error colour. */
  invalid?: boolean
  box?: number
  testId?: string
}): React.JSX.Element | null {
  const w = sheet.width
  const h = sheet.height
  if (!(w > 0 && h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null
  const scale = box / Math.max(w, h)
  const W = w * scale
  const H = h * scale
  const pad = 6
  const r = (v: number): number => Math.round(v * scale * 10) / 10
  const label = Math.max(9, Math.min(18, (Math.min(...copies.map((c) => c.width), w) * scale) / 3))
  const cuts: { x1: number; y1: number; x2: number; y2: number }[] = []
  if (cutGuides && copies.length > 0) {
    const xs = new Set<number>()
    const ys = new Set<number>()
    for (const c of copies) {
      for (const x of [c.x, c.x + c.width])
        if (x > 1e-6 && x < w - 1e-6) xs.add(Math.round(x * 1e4) / 1e4)
      for (const y of [c.y, c.y + c.height])
        if (y > 1e-6 && y < h - 1e-6) ys.add(Math.round(y * 1e4) / 1e4)
    }
    xs.forEach((x) => cuts.push({ x1: r(x), y1: 0, x2: r(x), y2: H }))
    ys.forEach((y) => cuts.push({ x1: 0, y1: r(y), x2: W, y2: r(y) }))
  }
  const m = margins
  const hasMargins = !!m && m.top + m.right + m.bottom + m.left > 0
  return (
    <svg
      className={`format-diagram${invalid ? ' invalid' : ''}`}
      width={W + pad * 2}
      height={H + pad * 2}
      viewBox={`${-pad} ${-pad} ${W + pad * 2} ${H + pad * 2}`}
      aria-hidden="true"
      data-testid={testId}
      data-copies={copies.length}
    >
      <rect className="fd-sheet" x={0} y={0} width={W} height={H} />
      {hasMargins && m && (
        <rect
          className="fd-margin"
          x={r(m.left)}
          y={r(m.top)}
          width={Math.max(0, W - r(m.left) - r(m.right))}
          height={Math.max(0, H - r(m.top) - r(m.bottom))}
        />
      )}
      {copies.map((c, i) => (
        <g key={i} className="fd-copy">
          <rect x={r(c.x)} y={r(c.y)} width={r(c.width)} height={r(c.height)} />
          {safeInset > 0 && c.width > 2 * safeInset && c.height > 2 * safeInset && (
            <rect
              className="fd-safe"
              x={r(c.x + safeInset)}
              y={r(c.y + safeInset)}
              width={r(c.width - 2 * safeInset)}
              height={r(c.height - 2 * safeInset)}
            />
          )}
          {copies.length > 1 && (
            <text
              x={r(c.x + c.width / 2)}
              y={r(c.y + c.height / 2)}
              fontSize={label}
              textAnchor="middle"
              dominantBaseline="central"
            >
              {i + 1}
            </text>
          )}
        </g>
      ))}
      {cuts.map((l, i) => (
        <line key={i} className="fd-cut" {...l} />
      ))}
    </svg>
  )
}
