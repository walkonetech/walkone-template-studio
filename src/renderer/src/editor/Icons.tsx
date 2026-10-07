import { Camera, Circle, Folder, Image as ImageIcon, Minus, Square, Type } from 'lucide-react'
import type { Layer } from '@domain'

/** Layer-type glyph for the Layers panel (decorative: the row also carries the type as screen-reader text). */
export function LayerTypeIcon({ layer }: { layer: Layer }): React.JSX.Element {
  const p = { size: 15, strokeWidth: 1.75, 'aria-hidden': true } as const
  switch (layer.type) {
    case 'photo':
      return <Camera {...p} />
    case 'image':
      return <ImageIcon {...p} />
    case 'text':
      return <Type {...p} />
    case 'group':
      return <Folder {...p} />
    case 'shape':
      return layer.shape === 'rectangle' ? (
        <Square {...p} />
      ) : layer.shape === 'ellipse' ? (
        <Circle {...p} />
      ) : (
        <Minus {...p} />
      )
  }
}
