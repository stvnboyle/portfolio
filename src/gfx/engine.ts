import { createWebGPURenderer } from "./webgpu";
import { createWebGL2Renderer } from "./webgl";
import { buildMasks, sampleMask, type Masks } from "./mask";
import {
  EMITTERS,
  PROBE,
  srgbToCss,
  srgbToLinear,
  wavelengthToSrgb,
  type Rgb,
} from "./emitters";
import {
  HEADER_FLOATS,
  LIGHT_FLOATS,
  UNIFORM_FLOATS,
  type Renderer,
  type RendererKind,
} from "./types";

const TAU = Math.PI * 2;

/** Quality steps, walked down one at a time if the frame rate can't hold. */
const TIERS = [
  { samples: 48, scatterScale: 0.36 },
  { samples: 34, scatterScale: 0.28 },
  { samples: 24, scatterScale: 0.22 },
];
const SOFT_MASK_SCALE = 0.25;
const MAX_OUTPUT_PIXELS = 4_200_000;
const EXPOSURE = 0.62;
const SCATTER_GAIN = 2.2;

export type EmitterSnapshot = {
  id: string;
  label: string;
  color: string;
  /** CSS px, relative to the hero. */
  x: number;
  y: number;
  /** Normalised position, 0..1. */
  u: number;
  v: number;
  /** 1 = clear line of sight to the viewer, 0 = fully behind a glyph. */
  transmittance: number;
  /** 0..1 — the probe fades in and out with the pointer. */
  presence: number;
};

export type FieldStatus = {
  backend: RendererKind | "none";
  device: string;
  emitters: number;
  samples: number;
  scatter: [number, number];
  fps: number;
};

type Source = {
  id: string;
  label: string;
  css: string;
  linear: Rgb;
  strength: number;
  radius: number;
  occ: number;
};

export class LightField {
  private renderer: Renderer | null = null;
  private masks: Masks | null = null;
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);
  private readonly cleanups: Array<() => void> = [];
  private disposed = false;

  private css = { w: 1, h: 1 };
  private output = { w: 1, h: 1 };
  private scatterSize: [number, number] = [1, 1];
  private tier = 0;

  private raf = 0;
  private last = 0;
  private time = 14;
  private onScreen = true;
  private live = false;
  private readonly calm: boolean;

  private pointer: { u: number; v: number } | null = null;
  private probe = { u: 0.5, v: 0.5, presence: 0 };
  private flash = 0;

  private readonly sources: Source[];
  private readonly snapshots: EmitterSnapshot[];
  private readonly frameListeners = new Set<(emitters: EmitterSnapshot[]) => void>();
  private readonly statusListeners = new Set<(status: FieldStatus) => void>();

  private fps = 0;
  private frames = 0;
  private windowStart = 0;
  private refreshHz = 0;
  private warmup = 2;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hero: HTMLElement,
    private readonly name: HTMLElement
  ) {
    this.calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (coarse || window.innerWidth < 768) this.tier = 1;

    this.sources = [
      ...EMITTERS.map((e) => {
        const srgb = wavelengthToSrgb(e.nm);
        return {
          id: e.id,
          label: `${e.nm} nm`,
          css: srgbToCss(srgb),
          linear: srgbToLinear(srgb),
          strength: e.strength,
          radius: e.radius,
          occ: 0,
        };
      }),
      {
        id: PROBE.id,
        label: PROBE.label,
        css: srgbToCss(PROBE.srgb),
        linear: srgbToLinear(PROBE.srgb),
        strength: PROBE.strength,
        radius: PROBE.radius,
        occ: 0,
      },
    ];
    this.snapshots = this.sources.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.css,
      x: 0,
      y: 0,
      u: 0.5,
      v: 0.5,
      transmittance: 1,
      presence: s.id === PROBE.id ? 0 : 1,
    }));
  }

  async start(): Promise<void> {
    try {
      this.renderer = await createWebGPURenderer(this.canvas);
    } catch (gpuError) {
      console.info(`[light-field] WebGPU unavailable, using WebGL2: ${(gpuError as Error).message}`);
      try {
        this.renderer = createWebGL2Renderer(this.canvas);
      } catch (glError) {
        console.info(`[light-field] no GPU path: ${(glError as Error).message}`);
        this.emitStatus();
        return;
      }
    }

    if (this.disposed) {
      this.renderer.destroy();
      this.renderer = null;
      return;
    }

    // Glyph positions are only final once the webfont has loaded.
    await document.fonts.ready;
    if (this.disposed) return;

    this.layout();
    this.attach();
    this.raf = requestAnimationFrame(this.frame);
    this.emitStatus();
  }

  onFrame(fn: (emitters: EmitterSnapshot[]) => void): () => void {
    this.frameListeners.add(fn);
    return () => this.frameListeners.delete(fn);
  }

  onStatus(fn: (status: FieldStatus) => void): () => void {
    this.statusListeners.add(fn);
    fn(this.status);
    return () => this.statusListeners.delete(fn);
  }

  get status(): FieldStatus {
    return {
      backend: this.renderer?.kind ?? "none",
      device: this.renderer?.device ?? "—",
      emitters: EMITTERS.length + (this.probe.presence > 0.01 ? 1 : 0),
      samples: TIERS[this.tier].samples,
      scatter: this.scatterSize,
      fps: this.fps,
    };
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.frameListeners.clear();
    this.statusListeners.clear();
    this.renderer?.destroy();
    this.renderer = null;
  }

  /* --- sizing ------------------------------------------------------------ */

  private layout() {
    if (!this.renderer) return;
    const rect = this.hero.getBoundingClientRect();
    this.css = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };

    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pixels = this.css.w * this.css.h * dpr * dpr;
    if (pixels > MAX_OUTPUT_PIXELS) dpr *= Math.sqrt(MAX_OUTPUT_PIXELS / pixels);

    this.output = { w: Math.round(this.css.w * dpr), h: Math.round(this.css.h * dpr) };
    const { scatterScale } = TIERS[this.tier];
    this.scatterSize = [
      Math.max(1, Math.round(this.css.w * scatterScale)),
      Math.max(1, Math.round(this.css.h * scatterScale)),
    ];

    this.renderer.resize(this.output.w, this.output.h, ...this.scatterSize);
    this.masks = buildMasks(this.canvas, this.name, this.output.w, this.output.h, SOFT_MASK_SCALE);
    this.renderer.setMasks(this.masks.full, this.masks.soft);
  }

  private attach() {
    let pending = 0;
    const relayout = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => this.layout());
    };
    const resizeObserver = new ResizeObserver(relayout);
    resizeObserver.observe(this.hero);
    document.fonts.addEventListener("loadingdone", relayout);

    const toUv = (e: PointerEvent) => {
      const rect = this.hero.getBoundingClientRect();
      return { u: (e.clientX - rect.left) / rect.width, v: (e.clientY - rect.top) / rect.height };
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const next = toUv(e);
      // Snap into place on entry rather than streaking in from the last exit.
      if (!this.pointer && this.probe.presence < 0.05) Object.assign(this.probe, next);
      this.pointer = next;
    };
    const onLeave = () => (this.pointer = null);
    const onDown = (e: PointerEvent) => {
      this.flash = 1;
      if (e.pointerType === "touch") {
        const at = toUv(e);
        Object.assign(this.probe, at);
        this.pointer = at;
        window.setTimeout(() => (this.pointer = null), 1400);
      }
    };
    this.hero.addEventListener("pointermove", onMove, { passive: true });
    this.hero.addEventListener("pointerleave", onLeave, { passive: true });
    this.hero.addEventListener("pointerdown", onDown, { passive: true });

    const visibility = new IntersectionObserver(([entry]) => (this.onScreen = entry.isIntersecting));
    visibility.observe(this.hero);

    this.cleanups.push(() => {
      cancelAnimationFrame(pending);
      resizeObserver.disconnect();
      visibility.disconnect();
      document.fonts.removeEventListener("loadingdone", relayout);
      this.hero.removeEventListener("pointermove", onMove);
      this.hero.removeEventListener("pointerleave", onLeave);
      this.hero.removeEventListener("pointerdown", onDown);
    });
  }

  /* --- frame ------------------------------------------------------------- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
    this.last = now;
    if (!this.onScreen || !this.renderer || !this.masks) return;

    this.time += dt * (this.calm ? 0.2 : 1);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    const boost = 1 + this.flash * this.flash * 1.8;

    const { x0, y0, x1, y1 } = this.masks.bounds;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = (x1 - x0) / 2;
    const hh = Math.max((y1 - y0) / 2, 0.14);

    const u = this.uniforms;
    u.fill(0);
    let count = 0;

    EMITTERS.forEach((e, i) => {
      const { ax, ay, fx, fy, px, py } = e.path;
      const lu = cx + hw * ax * Math.sin(this.time * fx * TAU + px);
      const lv = cy + hh * ay * Math.sin(this.time * fy * TAU + py);
      this.writeSource(count++, i, lu, lv, 1, boost, dt);
    });

    // The probe eases after the pointer and fades with its presence.
    const k = Math.min(1, dt * 9);
    if (this.pointer) {
      this.probe.u += (this.pointer.u - this.probe.u) * k;
      this.probe.v += (this.pointer.v - this.probe.v) * k;
    }
    this.probe.presence += ((this.pointer ? 1 : 0) - this.probe.presence) * Math.min(1, dt * 5);
    const probeIndex = this.sources.length - 1;
    if (this.probe.presence > 0.002) {
      this.writeSource(count++, probeIndex, this.probe.u, this.probe.v, this.probe.presence, boost, dt);
    }
    this.snapshots[probeIndex].presence = this.probe.presence;

    // Dim as the hero scrolls away, so the page below takes over gently.
    const scrolled = Math.min(1, Math.max(0, window.scrollY / this.css.h));
    const { samples } = TIERS[this.tier];

    u[0] = this.output.w;
    u[1] = this.output.h;
    u[2] = this.scatterSize[0];
    u[3] = this.scatterSize[1];
    u[4] = this.time;
    u[5] = count;
    u[6] = samples;
    u[7] = EXPOSURE * (1 - scrolled * 0.65);
    u[8] = this.css.w / this.css.h;
    u[9] = SCATTER_GAIN;

    this.renderer.render(u);

    if (!this.live) {
      this.live = true;
      this.hero.dataset.field = "live";
    }
    for (const fn of this.frameListeners) fn(this.snapshots);
    this.measure(now);
  };

  private writeSource(slot: number, index: number, lu: number, lv: number, presence: number, boost: number, dt: number) {
    const source = this.sources[index];
    const target = sampleMask(this.masks!, lu, lv);
    source.occ += (target - source.occ) * Math.min(1, dt * 12);

    const o = HEADER_FLOATS + slot * LIGHT_FLOATS;
    const u = this.uniforms;
    u[o] = lu;
    u[o + 1] = lv;
    u[o + 2] = source.radius;
    u[o + 3] = source.strength * presence * boost;
    u[o + 4] = source.linear[0];
    u[o + 5] = source.linear[1];
    u[o + 6] = source.linear[2];
    u[o + 7] = source.occ;

    const snap = this.snapshots[index];
    snap.u = lu;
    snap.v = lv;
    snap.x = lu * this.css.w;
    snap.y = lv * this.css.h;
    snap.transmittance = 1 - source.occ;
  }

  /* --- adaptive quality ---------------------------------------------------- */

  private measure(now: number) {
    this.frames++;
    if (!this.windowStart) this.windowStart = now;
    const span = now - this.windowStart;
    if (span < 1000) return;

    this.fps = Math.round((this.frames * 1000) / span);
    this.frames = 0;
    this.windowStart = now;

    if (this.warmup > 0) {
      this.warmup--;
    } else {
      if (!this.refreshHz) {
        // 30Hz panels and throttled tabs are normal, so "slow" is judged
        // against the display rather than a fixed 60.
        this.refreshHz = [30, 60, 90, 120, 144].reduce((best, hz) =>
          Math.abs(hz - this.fps) < Math.abs(best - this.fps) ? hz : best
        );
      }
      if (this.fps < this.refreshHz * 0.75 && this.tier < TIERS.length - 1) {
        this.tier++;
        this.layout();
      }
    }
    this.emitStatus();
  }

  private emitStatus() {
    const status = this.status;
    for (const fn of this.statusListeners) fn(status);
  }
}
