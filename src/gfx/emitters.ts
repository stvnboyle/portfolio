export type Rgb = [number, number, number];

export type Emitter = {
  id: string;
  /** Peak wavelength. Drives both the colour and the label. */
  nm: number;
  strength: number;
  /** Core radius, in units of canvas height. */
  radius: number;
  /**
   * Lissajous path around the name: amplitudes as fractions of the glyph
   * half-extents, frequencies in Hz, phases in radians.
   */
  path: { ax: number; ay: number; fx: number; fy: number; px: number; py: number };
};

/**
 * Four narrow-band sources, picked from common laser/diode lines so the
 * labels are real wavelengths rather than arbitrary colours. Blue gets more
 * power because the eye is least sensitive to it.
 */
export const EMITTERS: Emitter[] = [
  { id: "L1", nm: 445, strength: 2.6, radius: 0.11, path: { ax: 0.95, ay: 0.9, fx: 0.031, fy: 0.047, px: 0.0, py: 1.1 } },
  { id: "L2", nm: 495, strength: 0.8, radius: 0.085, path: { ax: 0.7, ay: 1.25, fx: 0.043, fy: 0.029, px: 2.1, py: 0.3 } },
  { id: "L3", nm: 600, strength: 1.8, radius: 0.1, path: { ax: 1.05, ay: 0.7, fx: 0.023, fy: 0.053, px: 4.0, py: 2.6 } },
  { id: "L4", nm: 640, strength: 1.9, radius: 0.1, path: { ax: 0.5, ay: 1.05, fx: 0.037, fy: 0.019, px: 5.3, py: 4.4 } },
];

/** The cursor-held source: broadband, roughly daylight white. */
export const PROBE = {
  id: "P0",
  label: "6500 K",
  srgb: [1, 0.96, 0.9] as Rgb,
  strength: 1.5,
  radius: 0.07,
};

/** Dan Bruton's piecewise approximation of the visible spectrum, in sRGB. */
export function wavelengthToSrgb(nm: number): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / 60;
    b = 1;
  } else if (nm >= 440 && nm < 490) {
    g = (nm - 440) / 50;
    b = 1;
  } else if (nm >= 490 && nm < 510) {
    g = 1;
    b = -(nm - 510) / 20;
  } else if (nm >= 510 && nm < 580) {
    r = (nm - 510) / 70;
    g = 1;
  } else if (nm >= 580 && nm < 645) {
    r = 1;
    g = -(nm - 645) / 65;
  } else if (nm >= 645 && nm <= 780) {
    r = 1;
  }
  return [r, g, b];
}

export function srgbToLinear([r, g, b]: Rgb): Rgb {
  return [r ** 2.2, g ** 2.2, b ** 2.2];
}

export function srgbToCss([r, g, b]: Rgb): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
}
