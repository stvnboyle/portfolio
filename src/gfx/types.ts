/** Emitters one frame can carry. Mirrors the array length in both shader sources. */
export const MAX_LIGHTS = 6;

/**
 * Uniform layout, shared by both backends (and matching the WGSL struct):
 *
 *   [0..1]  full resolution      [2..3]  scatter resolution
 *   [4]     time                 [5]     light count
 *   [6]     samples per ray      [7]     exposure
 *   [8]     aspect (w / h)       [9]     scatter gain
 *   [10..11] padding
 *   then per light (8 floats): pos.xy, radius, strength, rgb, occlusion
 */
export const HEADER_FLOATS = 12;
export const LIGHT_FLOATS = 8;
export const UNIFORM_FLOATS = HEADER_FLOATS + MAX_LIGHTS * LIGHT_FLOATS;

export type RendererKind = "webgpu" | "webgl2";

export interface Renderer {
  readonly kind: RendererKind;
  readonly device: string;
  /** Full-resolution output size, plus the low-resolution scatter target. */
  resize(width: number, height: number, scatterWidth: number, scatterHeight: number): void;
  /** `full` is the crisp glyph mask; `soft` is the blurred one rays march through. */
  setMasks(full: HTMLCanvasElement, soft: HTMLCanvasElement): void;
  render(uniforms: Float32Array<ArrayBuffer>): void;
  destroy(): void;
}
