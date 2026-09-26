import { clock, frameLoop, init, surface } from "vgpu";
import type { Frame, FrameLoopHandle, Gpu, Surface } from "vgpu";

/** Label/value pairs the hero HUD shows next to the runtime and frame rate. */
export type SceneStats = { stats: Array<[string, string]>; fps: number };

export type SceneCallbacks = {
  onLive(): void;
  onStatus(status: SceneStats): void;
  onUnsupported(reason: string): void;
};

/** Starts a scene on `canvas`, with pointer input from `hero`. Returns a teardown. */
export type StartScene = (canvas: HTMLCanvasElement, hero: HTMLElement, callbacks: SceneCallbacks) => () => void;

export type SceneContext = {
  gpu: Gpu;
  canvas: HTMLCanvasElement;
  hero: HTMLElement;
  surface: Surface;
  /** prefers-reduced-motion */
  calm: boolean;
  /** Phones and narrow windows get lighter workloads. */
  small: boolean;
  /** Registers teardown work (listeners, observers). */
  onCleanup(fn: () => void): void;
};

export type SceneLoop = {
  /** `dt` is scaled down under reduced motion; `realDt` is wall-clock. */
  tick(frame: Frame, dt: number, realDt: number): void;
  stats(): Array<[string, string]>;
};

/**
 * The shared shell every hero scene runs in: device + surface setup, an
 * on-screen-only frame loop, an fps meter and teardown. Scenes only build
 * their pipelines and say what to draw each frame.
 */
export function runScene(
  canvas: HTMLCanvasElement,
  hero: HTMLElement,
  callbacks: SceneCallbacks,
  setup: (ctx: SceneContext) => SceneLoop,
  limits: Record<string, number> = {}
): () => void {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      gpu = await init({ powerPreference: "high-performance", requiredLimits: limits });
    } catch (error) {
      callbacks.onUnsupported((error as Error).message);
      return;
    }
    if (disposed) return gpu.dispose();

    const ctx: SceneContext = {
      gpu,
      canvas,
      hero,
      // Up to 3x, so the robots stay sharp on dense screens and when the page is zoomed in.
      surface: surface(gpu, canvas, { dpr: [1, 3] }),
      calm: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      small: window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768,
      onCleanup: (fn) => cleanups.push(fn),
    };
    const scene = setup(ctx);

    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    visibility.observe(hero);
    cleanups.push(() => visibility.disconnect());

    const time = clock(gpu);
    const speed = ctx.calm ? 0.3 : 1;
    let frames = 0;
    let windowStart = performance.now();
    let live = false;

    loop = frameLoop(gpu, (frame) => {
      if (!onScreen) return;
      const realDt = Math.min(time.deltaTime, 0.1);
      scene.tick(frame, realDt * speed, realDt);

      if (!live) {
        live = true;
        callbacks.onLive();
      }
      frames++;
      const now = performance.now();
      if (now - windowStart >= 1000) {
        callbacks.onStatus({ stats: scene.stats(), fps: Math.round((frames * 1000) / (now - windowStart)) });
        frames = 0;
        windowStart = now;
      }
    });
  })().catch((error: Error) => callbacks.onUnsupported(error.message));

  return () => {
    disposed = true;
    loop?.stop();
    for (const fn of cleanups) fn();
    gpu?.dispose();
  };
}

/** Pointer position relative to the canvas, in CSS pixels. */
export function pointerIn(canvas: HTMLCanvasElement, e: MouseEvent): [number, number] {
  const rect = canvas.getBoundingClientRect();
  return [e.clientX - rect.left, e.clientY - rect.top];
}

/** True when a press lands on the hero copy or a HUD link, which are left alone so text can be selected and links followed. */
export const onCopy = (e: Event) => Boolean((e.target as Element).closest(".hero__inner > *, .hero__hud a"));

/** Splits a flat Float32Array into the vec4 tuples a uniform array expects. */
export function vec4s(data: Float32Array): number[][] {
  return Array.from({ length: data.length / 4 }, (_, i) => Array.from(data.subarray(i * 4, i * 4 + 4)));
}
