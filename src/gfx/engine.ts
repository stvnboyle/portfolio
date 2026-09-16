import { createWebGPURenderer } from "./webgpu";
import { createWebGL2Renderer } from "./webgl";
import {
  DEPTH,
  GRID_DESKTOP,
  GRID_MOBILE,
  NEAR_Z,
  SIM_HZ,
  VIEW_FLOATS,
  screenToCell,
  viewProjection,
  type Drop,
  type Grid,
} from "./field";
import type { Renderer, RendererKind } from "./types";

const MAX_OUTPUT_PIXELS = 3_000_000;
const HEIGHT_SCALE = 1;
/** How often an idle surface gets a small disturbance of its own. */
const IDLE_DROP_MS = 2600;

export type FieldStatus = {
  backend: RendererKind;
  nodes: number;
  fps: number;
};

export class WaveField {
  private renderer: Renderer | null = null;
  private readonly view = new Float32Array(VIEW_FLOATS);
  private readonly cleanups: Array<() => void> = [];
  private disposed = false;

  private css = { w: 1, h: 1 };
  private raf = 0;
  private last = 0;
  private time = 0;
  private accumulator = 0;
  private onScreen = true;
  private readonly calm: boolean;
  private readonly grid: Grid;

  private drops: Drop[] = [];
  private lastPointerDrop = 0;
  private lastActivity = 0;
  private lastIdleDrop = 0;

  private frames = 0;
  private windowStart = 0;
  private readonly statusListeners = new Set<(status: FieldStatus) => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hero: HTMLElement
  ) {
    this.calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    this.grid = small ? GRID_MOBILE : GRID_DESKTOP;
  }

  async start(): Promise<void> {
    try {
      this.renderer = await createWebGPURenderer(this.canvas, this.grid);
    } catch {
      try {
        this.renderer = createWebGL2Renderer(this.canvas, this.grid);
      } catch {
        // No GPU path: the hero stays as plain type on the page background.
        return;
      }
    }
    if (this.disposed) {
      this.renderer.destroy();
      this.renderer = null;
      return;
    }

    this.layout();
    this.attach();
    this.raf = requestAnimationFrame(this.frame);
  }

  onStatus(fn: (status: FieldStatus) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.statusListeners.clear();
    this.renderer?.destroy();
    this.renderer = null;
  }

  /* --- sizing & input ------------------------------------------------------ */

  private layout() {
    if (!this.renderer) return;
    const rect = this.hero.getBoundingClientRect();
    this.css = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = this.css.w * this.css.h * dpr * dpr;
    if (pixels > MAX_OUTPUT_PIXELS) dpr *= Math.sqrt(MAX_OUTPUT_PIXELS / pixels);
    this.renderer.resize(Math.round(this.css.w * dpr), Math.round(this.css.h * dpr));
  }

  private cellAt(e: PointerEvent) {
    const rect = this.hero.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    return screenToCell(ndcX, ndcY, this.css.w / this.css.h, this.grid);
  }

  private attach() {
    const resizeObserver = new ResizeObserver(() => this.layout());
    resizeObserver.observe(this.hero);

    // Moving leaves a gentle wake; pressing drops something heavier.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = performance.now();
      this.lastActivity = now;
      if (now - this.lastPointerDrop < 45) return;
      const cell = this.cellAt(e);
      if (!cell) return;
      this.lastPointerDrop = now;
      this.drops.push({ ...cell, radius: 2.2, amp: 0.045 });
    };
    const onDown = (e: PointerEvent) => {
      this.lastActivity = performance.now();
      const cell = this.cellAt(e);
      if (cell) this.drops.push({ ...cell, radius: 3.2, amp: 0.55 });
    };
    this.hero.addEventListener("pointermove", onMove, { passive: true });
    this.hero.addEventListener("pointerdown", onDown, { passive: true });

    const visibility = new IntersectionObserver(([entry]) => (this.onScreen = entry.isIntersecting));
    visibility.observe(this.hero);

    this.cleanups.push(() => {
      resizeObserver.disconnect();
      visibility.disconnect();
      this.hero.removeEventListener("pointermove", onMove);
      this.hero.removeEventListener("pointerdown", onDown);
    });
  }

  /* --- frame --------------------------------------------------------------- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
    this.last = now;
    if (!this.onScreen || !this.renderer) return;

    this.time += dt * (this.calm ? 0.25 : 1);

    // Fixed-rate simulation, independent of the display's refresh rate.
    this.accumulator += dt * (this.calm ? 0.25 : 1);
    let steps = 0;
    while (this.accumulator >= 1 / SIM_HZ && steps < 2) {
      this.accumulator -= 1 / SIM_HZ;
      steps++;
    }
    if (steps === 2) this.accumulator = 0;

    if (!this.calm && now - this.lastActivity > IDLE_DROP_MS && now - this.lastIdleDrop > IDLE_DROP_MS) {
      this.lastIdleDrop = now;
      this.drops.push({
        x: this.grid.gx * (0.3 + Math.random() * 0.4),
        z: this.grid.gz * (0.08 + Math.random() * 0.3),
        radius: 3,
        amp: 0.35,
      });
    }

    const aspect = this.css.w / this.css.h;
    const { matrix, p00, p11 } = viewProjection(aspect);
    const v = this.view;
    v.set(matrix, 0);
    v.set([p00, p11, this.grid.pointSize, this.time], 16);
    v.set([this.grid.gx, this.grid.gz, this.grid.width, DEPTH], 20);
    v.set([NEAR_Z, HEIGHT_SCALE, aspect, 0], 24);

    const drops = steps > 0 ? this.drops.splice(0, 4) : [];
    this.renderer.render({ view: v, steps, drops });

    if (!this.hero.dataset.field) this.hero.dataset.field = "live";
    this.measure(now);
  };

  private measure(now: number) {
    this.frames++;
    if (!this.windowStart) this.windowStart = now;
    const span = now - this.windowStart;
    if (span < 1000 || !this.renderer) return;
    const status: FieldStatus = {
      backend: this.renderer.kind,
      nodes: this.grid.gx * this.grid.gz,
      fps: Math.round((this.frames * 1000) / span),
    };
    this.frames = 0;
    this.windowStart = now;
    for (const fn of this.statusListeners) fn(status);
  }
}
