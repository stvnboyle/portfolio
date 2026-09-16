export type Rgb = [number, number, number];

export type Emitter = {
  /** sRGB, 0..1 — kept pale so the light reads as a wash, not a spotlight. */
  srgb: Rgb;
  strength: number;
  /** Falloff radius, in units of canvas height. */
  radius: number;
  /**
   * Lissajous path around the name: amplitudes as fractions of the glyph
   * half-extents, frequencies in Hz, phases in radians.
   */
  path: { ax: number; ay: number; fx: number; fy: number; px: number; py: number };
};

export const EMITTERS: Emitter[] = [
  // lavender
  { srgb: [0.72, 0.66, 1.0], strength: 0.9, radius: 0.34, path: { ax: 0.9, ay: 1.6, fx: 0.017, fy: 0.023, px: 0.0, py: 1.1 } },
  // peach
  { srgb: [1.0, 0.76, 0.62], strength: 0.75, radius: 0.3, path: { ax: 1.1, ay: 1.4, fx: 0.013, fy: 0.019, px: 2.4, py: 3.0 } },
  // mint
  { srgb: [0.62, 0.9, 0.8], strength: 0.55, radius: 0.28, path: { ax: 0.7, ay: 1.8, fx: 0.021, fy: 0.011, px: 4.2, py: 0.4 } },
];

/** The cursor-held source: a faint warm white. */
export const PROBE: Pick<Emitter, "srgb" | "strength" | "radius"> = {
  srgb: [1.0, 0.95, 0.9],
  strength: 0.35,
  radius: 0.16,
};

export function srgbToLinear([r, g, b]: Rgb): Rgb {
  return [r ** 2.2, g ** 2.2, b ** 2.2];
}
