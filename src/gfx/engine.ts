import { createWebGPUBackend } from "./webgpu";
import { createWebGL2Backend } from "./webgl";
import { SHAPE_ID, type ShapeName } from "./shapes";
import { THEMES, applyThemeToCss, type Theme, type ThemeName } from "./theme";
import type { Backend, BackendKind, BackendOptions } from "./types";

export type EngineStatus = {
  kind: BackendKind | "none";
  adapterLabel: string;
  count: number;
  shape: ShapeName;
  theme: ThemeName;
  turbulence: number;
  fps: number;
  /** Set when WebGPU was unavailable, explaining why. */
  fallbackReason: string | null;
};

type Listener = (status: EngineStatus) => void;

const DEFAULT_SHAPE: ShapeName = "lattice";
const DEFAULT_THEME: ThemeName = "aurora";

function deviceProfile() {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 768;
  const mobile = coarse || narrow;
  const cores = navigator.hardwareConcurrency ?? 4;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (mobile) {
    return {
      count: 34_000,
      maxCount: 90_000,
      pointSize: 0.017,
      intensity: 0.62,
      maxDpr: 1.75,
      calm,
    };
  }
  return {
    count: cores >= 8 ? 130_000 : 80_000,
    maxCount: 400_000,
    pointSize: 0.0125,
    intensity: 0.42,
    maxDpr: 2,
    calm,
  };
}

export class FieldEngine {
  private backend: Backend | null = null;
  private listeners = new Set<Listener>();
  private canvas: HTMLCanvasElement;
  private surface: HTMLElement;
  private cleanups: Array<() => void> = [];
  private disposed = false;

  private shape: ShapeName = DEFAULT_SHAPE;
  private themeName: ThemeName = DEFAULT_THEME;
  private turbulence: number;
  private fallbackReason: string | null = null;

  // Rolling FPS + graceful quality reduction on slow devices.
  private frames = 0;
  private fpsWindowStart = 0;
  private fps = 0;
  private reductions = 0;
  private fpsTimer = 0;
  /** Established from the first measured window; 30Hz panels and throttled
   *  tabs are normal, so "slow" has to be judged relative to the display. */
  private refreshHz = 0;

  constructor(canvas: HTMLCanvasElement, surface: HTMLElement) {
    this.canvas = canvas;
    this.surface = surface;
    // Multiplier on each shape's own turbulence constant.
    this.turbulence = deviceProfile().calm ? 0.35 : 1;
  }

  async start(): Promise<void> {
    const profile = deviceProfile();
    const options: BackendOptions = {
      count: profile.calm ? Math.round(profile.count * 0.5) : profile.count,
      maxCount: profile.maxCount,
      shape: this.shape,
      theme: THEMES[this.themeName],
      turbulence: this.turbulence,
      pointSize: profile.pointSize,
      intensity: profile.intensity,
      maxDpr: profile.maxDpr,
    };

    try {
      this.backend = await createWebGPUBackend(this.canvas, options);
    } catch (gpuError) {
      this.fallbackReason = (gpuError as Error).message;
      try {
        this.backend = createWebGL2Backend(this.canvas, options);
      } catch (glError) {
        this.fallbackReason = `${this.fallbackReason}; ${(glError as Error).message}`;
        this.canvas.dataset.fallback = "static";
        this.emit();
        return;
      }
    }

    if (this.disposed) {
      this.backend.destroy();
      this.backend = null;
      return;
    }

    applyThemeToCss(THEMES[this.themeName]);
    this.attachInput();
    this.watchPerformance();
    this.emit();
  }

  /* --- input ------------------------------------------------------------- */

  private attachInput() {
    const toWorld = (clientX: number, clientY: number) => {
      const rect = this.canvas.getBoundingClientRect();
      const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((clientY - rect.top) / rect.height) * 2 - 1);
      return this.backend!.screenToWorld(ndcX, ndcY);
    };

    const onMove = (e: PointerEvent) => {
      // Touch drags are scrolls first and foremost — don't fight the page.
      if (e.pointerType === "touch") return;
      this.backend?.setPointer(toWorld(e.clientX, e.clientY));
    };
    const onLeave = () => this.backend?.setPointer(null);
    const onDown = (e: PointerEvent) => {
      const world = toWorld(e.clientX, e.clientY);
      this.backend?.burst(world);
      if (e.pointerType === "touch") {
        this.backend?.setPointer(world);
        window.setTimeout(() => this.backend?.setPointer(null), 900);
      }
    };

    this.surface.addEventListener("pointermove", onMove, { passive: true });
    this.surface.addEventListener("pointerleave", onLeave, { passive: true });
    this.surface.addEventListener("pointerdown", onDown, { passive: true });
    this.cleanups.push(() => {
      this.surface.removeEventListener("pointermove", onMove);
      this.surface.removeEventListener("pointerleave", onLeave);
      this.surface.removeEventListener("pointerdown", onDown);
    });

    // Stop simulating once the hero is fully scrolled past.
    const io = new IntersectionObserver(
      ([entry]) => this.backend?.setPaused(!entry.isIntersecting),
      { threshold: 0 }
    );
    io.observe(this.canvas);
    this.cleanups.push(() => io.disconnect());
  }

  /* --- adaptive quality --------------------------------------------------- */

  private watchPerformance() {
    const tick = () => {
      if (this.disposed) return;
      this.frames++;
      const now = performance.now();
      if (!this.fpsWindowStart) this.fpsWindowStart = now;

      const span = now - this.fpsWindowStart;
      if (span >= 1000) {
        this.fps = Math.round((this.frames * 1000) / span);
        this.frames = 0;
        this.fpsWindowStart = now;

        if (!this.refreshHz && this.fps > 0) {
          // First full window sets the bar. Snap to the nearest common rate so
          // a slightly-short first sample doesn't lower it permanently.
          this.refreshHz = [30, 60, 90, 120, 144].reduce((best, hz) =>
            Math.abs(hz - this.fps) < Math.abs(best - this.fps) ? hz : best
          );
        }

        // Two graceful step-downs, then leave it alone.
        const floor = Math.max(20, this.refreshHz * 0.7);
        if (this.fps > 0 && this.fps < floor && this.reductions < 2 && this.backend) {
          this.reductions++;
          this.backend.setCount(Math.round(this.backend.count * 0.6));
        }
        this.emit();
      }
      this.fpsTimer = requestAnimationFrame(tick);
    };
    this.fpsTimer = requestAnimationFrame(tick);
    this.cleanups.push(() => cancelAnimationFrame(this.fpsTimer));
  }

  /* --- controls ----------------------------------------------------------- */

  setShape(shape: ShapeName) {
    this.shape = shape;
    this.backend?.setShape(shape);
    this.emit();
  }

  setTheme(name: ThemeName) {
    this.themeName = name;
    const theme: Theme = THEMES[name];
    this.backend?.setTheme(theme);
    applyThemeToCss(theme);
    this.emit();
  }

  setTurbulence(value: number) {
    this.turbulence = Math.max(0, Math.min(value, 4));
    this.backend?.setTurbulence(this.turbulence);
    this.emit();
  }

  setCount(value: number): number {
    const applied = this.backend?.setCount(value) ?? 0;
    this.emit();
    return applied;
  }

  cycleShape(): ShapeName {
    const order = Object.keys(SHAPE_ID) as ShapeName[];
    const next = order[(order.indexOf(this.shape) + 1) % order.length];
    this.setShape(next);
    return next;
  }

  get status(): EngineStatus {
    return {
      kind: this.backend?.kind ?? "none",
      adapterLabel: this.backend?.adapterLabel ?? "software",
      count: this.backend?.count ?? 0,
      shape: this.shape,
      theme: this.themeName,
      turbulence: this.turbulence,
      fps: this.fps,
      fallbackReason: this.fallbackReason,
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    const snapshot = this.status;
    for (const listener of this.listeners) listener(snapshot);
  }

  destroy() {
    this.disposed = true;
    for (const fn of this.cleanups) fn();
    this.cleanups = [];
    this.listeners.clear();
    this.backend?.destroy();
    this.backend = null;
  }
}
