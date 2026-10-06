import { z } from 'zod'
import {
  FiniteNumberSchema,
  IdSchema,
  NonNegativeNumberSchema,
  PositiveNumberSchema
} from '../primitives'
import { ColorValueSchema } from '../color/color'

/**
 * Geometry is expressed in design-canvas pixels at the design's DPI, as plain numbers.
 * Origin is the canvas top-left, +x right, +y down. Negative and off-canvas values are valid.
 * Rotation is in degrees, clockwise, about the layer's center; any finite value is allowed.
 * Opacity is 0..1. zIndex orders siblings (layers with the same parentId); higher is in front.
 * Group children use absolute canvas coordinates, not coordinates relative to the group.
 */
const baseShape = {
  id: IdSchema,
  name: z.string().max(200),
  x: FiniteNumberSchema,
  y: FiniteNumberSchema,
  width: NonNegativeNumberSchema,
  height: NonNegativeNumberSchema,
  rotation: FiniteNumberSchema,
  opacity: z.number().min(0).max(1),
  zIndex: z.number().int(),
  visible: z.boolean(),
  locked: z.boolean(),
  /** Id of the containing GroupLayer; absent for top-level layers. */
  parentId: IdSchema.optional()
}

export const FitModeSchema = z.enum(['cover', 'contain', 'stretch'])
export type FitMode = z.infer<typeof FitModeSchema>

export const PhotoFrameSchema = z.discriminatedUnion('style', [
  z.strictObject({ style: z.literal('none') }),
  z.strictObject({
    style: z.literal('solid'),
    thickness: PositiveNumberSchema,
    color: ColorValueSchema
  })
])
export type PhotoFrame = z.infer<typeof PhotoFrameSchema>

/** Where a booth photo goes. `photoNumber` is a slot number, NOT unique: duplicated strips repeat it. */
export const PhotoLayerSchema = z.strictObject({
  ...baseShape,
  type: z.literal('photo'),
  photoNumber: z.number().int().positive(),
  fit: FitModeSchema,
  frame: PhotoFrameSchema,
  cornerRadius: NonNegativeNumberSchema,
  /** Optional asset shown as a sample photo while editing. */
  sampleAssetId: IdSchema.optional()
})
export type PhotoLayer = z.infer<typeof PhotoLayerSchema>

/** Semantic purpose of an image. DSLR Booth stores none of these; they are our concepts. */
export const IMAGE_ROLES = ['background', 'overlay', 'frame', 'badge', 'logo', 'graphic'] as const
export const ImageRoleSchema = z.enum(IMAGE_ROLES)
export type ImageRole = z.infer<typeof ImageRoleSchema>

export const ImageLayerSchema = z.strictObject({
  ...baseShape,
  type: z.literal('image'),
  assetId: IdSchema,
  role: ImageRoleSchema,
  fit: FitModeSchema
})
export type ImageLayer = z.infer<typeof ImageLayerSchema>

export const TextLayerSchema = z.strictObject({
  ...baseShape,
  type: z.literal('text'),
  content: z.string(),
  fontFamily: z.string().min(1).max(200),
  /** Canvas pixels. */
  fontSize: PositiveNumberSchema,
  fontWeight: z.number().int().min(1).max(1000),
  fontStyle: z.enum(['normal', 'italic']),
  align: z.enum(['left', 'center', 'right']),
  /** Multiplier of fontSize. */
  lineHeight: PositiveNumberSchema,
  /** Canvas pixels added between characters. */
  letterSpacing: FiniteNumberSchema,
  fill: ColorValueSchema
})
export type TextLayer = z.infer<typeof TextLayerSchema>

export const ShapeStrokeSchema = z.strictObject({
  color: ColorValueSchema,
  width: PositiveNumberSchema
})

export const ShapeLayerSchema = z.strictObject({
  ...baseShape,
  type: z.literal('shape'),
  shape: z.enum(['rectangle', 'ellipse', 'line']),
  fill: ColorValueSchema.nullable(),
  stroke: ShapeStrokeSchema.nullable(),
  /** Rectangles only; ignored otherwise. */
  cornerRadius: NonNegativeNumberSchema
})
export type ShapeLayer = z.infer<typeof ShapeLayerSchema>

/** Organizational container. Children reference it via `parentId`; it stores no child list. */
export const GroupLayerSchema = z.strictObject({
  ...baseShape,
  type: z.literal('group')
})
export type GroupLayer = z.infer<typeof GroupLayerSchema>

export const LayerSchema = z.discriminatedUnion('type', [
  PhotoLayerSchema,
  ImageLayerSchema,
  TextLayerSchema,
  ShapeLayerSchema,
  GroupLayerSchema
])
export type Layer = z.infer<typeof LayerSchema>
export type LayerType = Layer['type']
export type BaseLayer = Pick<Layer, keyof typeof baseShape | 'type'>
