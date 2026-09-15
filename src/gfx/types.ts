import type { ShapeName } from "./shapes";
import type { Theme } from "./theme";
import type { Vec3 } from "./math";

export type BackendKind = "webgpu" | "webgl2";

export type BackendOptions = {
  /** Starting particle count. */
  count: number;
  /** Upper bound the `particles` command may raise to. */
  maxCount: number;
  shape: ShapeName;
  theme: Theme;
  turbulence: number;
  /** World-space radius of a particle sprite. */
  pointSize: number;
  /** Additive brightness multiplier. */
  intensity: number;
  maxDpr: number;
};

export interface Backend {
  readonly kind: BackendKind;
  readonly adapterLabel: string;
  readonly count: number;
  setShape(shape: ShapeName): void;
  setTheme(theme: Theme): void;
  setTurbulence(v: number): void;
  setPaused(paused: boolean): void;
  /** Pointer position in world space, or null when the pointer leaves. */
  setPointer(world: Vec3 | null): void;
  burst(world: Vec3): void;
  /** Maps normalised device coords (-1..1) onto the focal plane. */
  screenToWorld(ndcX: number, ndcY: number): Vec3;
  /** Returns the count actually applied after clamping. */
  setCount(count: number): number;
  destroy(): void;
}
