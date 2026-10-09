/**
 * Preview (sample) photos: EDITOR state that helps a designer judge a template with real-looking photography.
 * A sample is NOT a booth capture and NOT project artwork: it never touches photoNumber, the project, Project Assets,
 * the output composition or any future DSLR Booth export (ADR-038).
 */

export interface SampleInfo {
  id: string
  label: string
  /** Picture size in pixels; mixed portrait / landscape / square so cover and contain are exercised. */
  width: number
  height: number
}

/** The built-in samples: procedurally generated (original code, no third-party imagery, no licensing concerns). */
export const BUILT_IN_SAMPLES: readonly SampleInfo[] = [
  { id: 'sample-sunset', label: 'Sunset couple', width: 1800, height: 1200 },
  { id: 'sample-garden', label: 'Garden portrait', width: 1200, height: 1800 },
  { id: 'sample-party', label: 'Party group', width: 1600, height: 1200 },
  { id: 'sample-beach', label: 'Beach friends', width: 1500, height: 1500 },
  { id: 'sample-city', label: 'City night', width: 1800, height: 1200 },
  { id: 'sample-studio', label: 'Studio solo', width: 1200, height: 1600 }
]

export interface PreviewPhotoState {
  /** Shuffle seed: 0 is the default order (PhotoNumber 1 → first sample, 2 → second, …). */
  seed: number
  /** Explicit choice per PhotoNumber (a built-in id or a user sample id). */
  overrides: Readonly<Record<number, string>>
}

export const initialPreviewPhotos = (): PreviewPhotoState => ({ seed: 0, overrides: {} })

/** Deterministic PRNG so a shuffle is reproducible (and testable). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** The order of built-in samples for a seed: seed 0 is the catalogue order, others a seeded permutation. */
export function sampleOrder(seed: number): string[] {
  const ids = BUILT_IN_SAMPLES.map((s) => s.id)
  if (seed === 0) return ids
  const rnd = mulberry32(seed)
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[ids[i], ids[j]] = [ids[j] as string, ids[i] as string]
  }
  return ids
}

/**
 * The sample for a PhotoNumber. Mapping is BY NUMBER, never by layer: two layers sharing photoNumber 1 (and both copies
 * of a two-up sheet) show the same picture. An explicit override wins over the seeded default.
 */
export function sampleIdFor(photoNumber: number, state: PreviewPhotoState): string {
  const override = state.overrides[photoNumber]
  if (override) return override
  const order = sampleOrder(state.seed)
  return order[(Math.max(1, photoNumber) - 1) % order.length] as string
}

/** Shuffle: new seed, and the explicit per-number choices are dropped (a shuffle reshuffles everything). */
export const shufflePreviewPhotos = (state: PreviewPhotoState): PreviewPhotoState => ({
  seed: state.seed + 1,
  overrides: {}
})

export const setSampleOverride = (
  state: PreviewPhotoState,
  photoNumber: number,
  sampleId: string
): PreviewPhotoState => ({ ...state, overrides: { ...state.overrides, [photoNumber]: sampleId } })

export const resetPreviewPhotos = (): PreviewPhotoState => initialPreviewPhotos()

export const isBuiltInSample = (id: string): boolean => BUILT_IN_SAMPLES.some((s) => s.id === id)

/** Pixel size of a sample (built-in or a user's), for crop math before the picture has finished decoding. */
export function sampleSize(
  id: string,
  userSamples: readonly { id: string; width: number; height: number }[]
): { width: number; height: number } | null {
  const b = BUILT_IN_SAMPLES.find((s) => s.id === id)
  if (b) return { width: b.width, height: b.height }
  const u = userSamples.find((s) => s.id === id)
  return u ? { width: u.width, height: u.height } : null
}
