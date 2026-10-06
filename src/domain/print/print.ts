import { z } from 'zod'
import { PositiveNumberSchema } from '../primitives'

/** Only inches are supported; add units when a real need appears. */
export const PrintUnitSchema = z.literal('in')
export type PrintUnit = z.infer<typeof PrintUnitSchema>

export const MAX_PHYSICAL_SIDE_IN = 100
export const MAX_DPI = 4800
export const MAX_PIXEL_SIDE = 30000

/**
 * Physical print size plus resolution. Pixel dimensions are derived, never stored.
 * Orientation is implied by width vs height.
 */
export const PrintConfigurationSchema = z.strictObject({
  width: PositiveNumberSchema.max(MAX_PHYSICAL_SIDE_IN),
  height: PositiveNumberSchema.max(MAX_PHYSICAL_SIDE_IN),
  unit: PrintUnitSchema,
  dpi: z.number().int().min(1).max(MAX_DPI)
})
export type PrintConfiguration = z.infer<typeof PrintConfigurationSchema>

export interface PixelSize {
  width: number
  height: number
}

/** Converts a physical length (inches) to whole pixels at a resolution; rounds half up. */
export function inchesToPixels(inches: number, dpi: number): number {
  return Math.round(inches * dpi)
}

/** Derived canvas pixel size for a print configuration. */
export function getPixelSize(print: PrintConfiguration): PixelSize {
  return {
    width: inchesToPixels(print.width, print.dpi),
    height: inchesToPixels(print.height, print.dpi)
  }
}

export type Orientation = 'portrait' | 'landscape' | 'square'

export function getOrientation(print: PrintConfiguration): Orientation {
  if (print.width === print.height) return 'square'
  return print.width < print.height ? 'portrait' : 'landscape'
}

export const PRINT_PRESET_IDS = [
  'photo-4x6-portrait-300',
  'photo-4x6-landscape-300',
  'photo-4x6-portrait-600',
  'photo-4x6-landscape-600',
  'strip-2x6-300',
  'strip-2x6-600'
] as const
export type PrintPresetId = (typeof PRINT_PRESET_IDS)[number]

const preset = (width: number, height: number, dpi: number): PrintConfiguration => ({
  width,
  height,
  unit: 'in',
  dpi
})

export const PRINT_PRESETS: Readonly<Record<PrintPresetId, PrintConfiguration>> = {
  'photo-4x6-portrait-300': preset(4, 6, 300),
  'photo-4x6-landscape-300': preset(6, 4, 300),
  'photo-4x6-portrait-600': preset(4, 6, 600),
  'photo-4x6-landscape-600': preset(6, 4, 600),
  'strip-2x6-300': preset(2, 6, 300),
  'strip-2x6-600': preset(2, 6, 600)
}

export function getPrintPreset(id: PrintPresetId): PrintConfiguration {
  return { ...PRINT_PRESETS[id] }
}
