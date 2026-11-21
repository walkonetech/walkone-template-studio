/**
 * Small explanatory drawings for the B4 workflow surfaces (Export cards, Printer & cutting, dslrBooth import). They
 * are diagrams, not previews: paper, NUMBERED photo-slot placeholders and short ink marks. They never show a photo,
 * a person or any sample imagery (Sample Photos were removed in B3.1, ADR-056). Colours come from the `--c-art-*`
 * and overlay tokens, so Light and Dark both read; every drawing is decorative (aria-hidden) and the words beside it
 * carry the meaning.
 */

const PAPER = 'var(--c-art-paper)'
const SLOT = 'var(--c-art-slot)'
const SLOT_TEXT = 'var(--c-art-slot-text)'
const INK = 'var(--c-art-ink)'

/** One 2×6 strip at (x, y), `w` wide: three numbered slots and two ink lines. */
function Strip({
  x,
  y,
  w,
  ghost
}: {
  x: number
  y: number
  w: number
  ghost?: boolean
}): React.JSX.Element {
  const h = w * 3
  const pad = w * 0.09
  const slotH = (h * 0.68 - pad * 4) / 3
  return (
    <g opacity={ghost ? 0.45 : 1}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={1.5}
        fill={PAPER}
        stroke="var(--c-border-normal)"
        strokeWidth={0.75}
        strokeDasharray={ghost ? '3 2' : undefined}
      />
      {[0, 1, 2].map((i) => {
        const sy = y + pad + i * (slotH + pad)
        return (
          <g key={i}>
            <rect x={x + pad} y={sy} width={w - 2 * pad} height={slotH} rx={1} fill={SLOT} />
            <text
              x={x + w / 2}
              y={sy + slotH / 2}
              fontSize={slotH * 0.42}
              fill={SLOT_TEXT}
              textAnchor="middle"
              dominantBaseline="central"
              fontWeight={600}
            >
              {i + 1}
            </text>
          </g>
        )
      })}
      <rect x={x + w * 0.25} y={y + h * 0.8} width={w * 0.5} height={1.6} fill={INK} />
      <rect x={x + w * 0.32} y={y + h * 0.86} width={w * 0.36} height={1.2} fill={INK} />
    </g>
  )
}

/** For the booth: a strip and the dslrBooth template file. */
export function BoothArt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 160 100" className="art" aria-hidden="true">
      <Strip x={52} y={8} w={28} />
      <g transform="translate(92 36)">
        <path
          d="M0 0h16l6 6v20H0z"
          fill="var(--c-surface-panel)"
          stroke="var(--c-text-muted)"
          strokeWidth={1}
        />
        <path d="M16 0v6h6" fill="none" stroke="var(--c-text-muted)" strokeWidth={1} />
        <text x={11} y={38} fontSize={8} textAnchor="middle" fill="var(--c-text-secondary)">
          dslrBooth
        </text>
      </g>
    </svg>
  )
}

/** Print files: the 4×6 sheet with two strips side by side. */
export function PrintArt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 160 100" className="art" aria-hidden="true">
      <rect
        x={51}
        y={6}
        width={58}
        height={88}
        rx={1.5}
        fill={PAPER}
        stroke="var(--c-border-normal)"
      />
      <Strip x={52} y={7} w={28} />
      <Strip x={80} y={7} w={28} />
    </svg>
  )
}

/** Client proof: the strip marked PROOF (numbered placeholders, never pictures). */
export function ProofArt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 160 100" className="art" aria-hidden="true">
      <Strip x={66} y={8} w={28} />
      <text
        x={80}
        y={52}
        fontSize={13}
        fontWeight={700}
        letterSpacing={1.5}
        fill="var(--c-status-error-fg)"
        opacity={0.75}
        textAnchor="middle"
        dominantBaseline="central"
        transform="rotate(-62 80 52)"
      >
        PROOF
      </text>
    </svg>
  )
}

/** Import choice: one strip, printed two per sheet (the copy follows it). */
export function OneStripArt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 60" className="art small" aria-hidden="true">
      <Strip x={12} y={2} w={18.5} />
      <Strip x={33.5} y={2} w={18.5} ghost />
    </svg>
  )
}

/** Import choice: the whole sheet exactly as it is (two separate strips). */
export function WholeSheetArt(): React.JSX.Element {
  return (
    <svg viewBox="0 0 64 60" className="art small" aria-hidden="true">
      <rect x={11} y={1} width={42} height={58} rx={1.5} fill="none" stroke="var(--c-text-muted)" />
      <Strip x={12} y={2} w={19} />
      <Strip x={33} y={2} w={19} />
    </svg>
  )
}

/** Printer & cutting: two strips per sheet, cut apart down the middle (dashed cut line). */
export function CutSheetArt({ cut }: { cut: boolean }): React.JSX.Element {
  return (
    <svg viewBox="0 0 70 100" className="art" aria-hidden="true">
      <rect
        x={5}
        y={2}
        width={60}
        height={92}
        rx={1.5}
        fill={PAPER}
        stroke="var(--c-border-normal)"
      />
      <Strip x={6} y={3} w={29} />
      <Strip x={35} y={3} w={29} />
      {cut && (
        <line
          x1={35}
          y1={0}
          x2={35}
          y2={96}
          stroke="var(--c-text-secondary)"
          strokeWidth={1.2}
          strokeDasharray="3 2.5"
        />
      )}
    </svg>
  )
}

/**
 * Printer & cutting hero: one corner of a finished strip, enlarged. The amber hatched band is what the printer may
 * trim; the dashed teal line is the keep-safe line; a numbered photo-slot placeholder sits inside it. Labels are
 * HTML beside the drawing (`PrinterCorner` in the dialog), so they wrap and scale with the interface.
 */
export function CornerArt(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 300 200"
      className="art corner"
      preserveAspectRatio="xMinYMin slice"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="trim-hatch"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="8" height="8" fill="var(--c-overlay-trim)" opacity="0.16" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="8"
            stroke="var(--c-overlay-trim)"
            strokeWidth="2.5"
            opacity="0.75"
          />
        </pattern>
      </defs>
      <rect x="0" y="0" width="300" height="200" fill={PAPER} />
      {/* Trim band along the top and left edges of the strip. */}
      <path d="M0 0H300V26H26V200H0Z" fill="url(#trim-hatch)" />
      {/* Keep-safe line. */}
      <path
        d="M58 200V58H300"
        fill="none"
        stroke="var(--c-overlay-safe)"
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      {/* A numbered photo-slot placeholder, inside the safe line. */}
      <rect x="84" y="84" width="230" height="140" rx="3" fill={SLOT} />
      <text
        x="190"
        y="150"
        fontSize="34"
        fontWeight="600"
        fill={SLOT_TEXT}
        textAnchor="middle"
        dominantBaseline="central"
      >
        1
      </text>
      {/* The physical edge of the finished strip. */}
      <path d="M0 0.75H300M0.75 0V200" stroke="var(--c-text-muted)" strokeWidth="1.5" />
    </svg>
  )
}
