import type { Drop, Grid } from "./field";

export type RendererKind = "webgpu" | "webgl2";

export type Frame = {
  /** 28 floats — see `VIEW_FLOATS` and the `View` struct in the shaders. */
  view: Float32Array<ArrayBuffer>;
  /** Simulation steps to advance this frame (0–2). */
  steps: number;
  /** Disturbances to inject on the first step. */
  drops: Drop[];
};

export interface Renderer {
  readonly kind: RendererKind;
  readonly grid: Grid;
  resize(width: number, height: number): void;
  render(frame: Frame): void;
  destroy(): void;
}
