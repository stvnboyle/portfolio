export type Rgb = [number, number, number];

export type Emitter = {
  srgb: Rgb;
  strength: number;
  /** Core radius, in units of canvas height. */
  radius: number;
  /**
   * Lissajous path behind the name: amplitudes as fractions of the glyph
   * half-extents, frequencies in Hz, phases in radians.
   */
  path: { ax: number; ay: number; fx: number; fy: number; px: number; py: number };
};

/**
 * One light per experience the page is about — developer, agent, end user —
 * sharing their colours with the cards below. Kept behind the name so the
 * letters cut the beams into rays.
 */
export const EMITTERS: Emitter[] = [
  // developer — blue
  { srgb: [0.26, 0.55, 1.0], strength: 1.5, radius: 0.1, path: { ax: 0.8, ay: 0.5, fx: 0.019, fy: 0.031, px: 0.0, py: 1.1 } },
  // agent — violet
  { srgb: [0.68, 0.42, 1.0], strength: 1.3, radius: 0.1, path: { ax: 0.9, ay: 0.6, fx: 0.014, fy: 0.023, px: 2.3, py: 3.0 } },
  // end user — rose
  { srgb: [1.0, 0.42, 0.55], strength: 1.2, radius: 0.1, path: { ax: 0.75, ay: 0.55, fx: 0.023, fy: 0.017, px: 4.3, py: 0.4 } },
];

/** The cursor-held source: a faint warm white. */
export const PROBE: Pick<Emitter, "srgb" | "strength" | "radius"> = {
  srgb: [1.0, 0.95, 0.9],
  strength: 0.22,
  radius: 0.07,
};

export function srgbToLinear([r, g, b]: Rgb): Rgb {
  return [r ** 2.2, g ** 2.2, b ** 2.2];
}
