import { getOrientation, getPixelSize, type PrintConfiguration } from '@domain'
import { formatNumber } from './numberInput'

/** e.g. "4×6 Portrait • 600 DPI • 2400×3600 px" (status bar and project summary). */
export function describePrint(print: PrintConfiguration): string {
  const px = getPixelSize(print)
  const orientation = getOrientation(print)
  const label =
    orientation === 'portrait' ? 'Portrait' : orientation === 'landscape' ? 'Landscape' : 'Square'
  return `${formatNumber(print.width)}×${formatNumber(print.height)} ${label} • ${print.dpi} DPI • ${px.width}×${px.height} px`
}
