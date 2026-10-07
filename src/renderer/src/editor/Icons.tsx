import type { Layer } from '@domain'

/** Small inline SVG icons. Decorative: every control that uses one also has a text/aria label. */
type Name =
  | 'eye'
  | 'eye-off'
  | 'lock'
  | 'unlock'
  | 'chevron'
  | 'photo'
  | 'image'
  | 'text'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'group'

const PATHS: Record<Name, React.JSX.Element> = {
  eye: (
    <>
      <path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'eye-off': (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10 10 0 0112 5c6.5 0 10.5 7 10.5 7a17 17 0 01-3.2 4M6.4 6.4A17 17 0 001.5 12S5.5 19 12 19a10 10 0 004.2-.9" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 017.5-2" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  photo: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M5 17l5-6 4 5 2-2 3 3" />
    </>
  ),
  text: <path d="M5 6h14M12 6v13M9 19h6" />,
  rect: <rect x="4" y="6" width="16" height="12" rx="1" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  line: <path d="M4 19L20 5" />,
  group: <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
}

export function Icon({ name, size = 16 }: { name: Name; size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}

export function iconNameFor(layer: Layer): Name {
  switch (layer.type) {
    case 'photo':
      return 'photo'
    case 'image':
      return 'image'
    case 'text':
      return 'text'
    case 'group':
      return 'group'
    case 'shape':
      return layer.shape === 'rectangle' ? 'rect' : layer.shape === 'ellipse' ? 'ellipse' : 'line'
  }
}
