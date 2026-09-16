import { createWebGPURenderer } from "./webgpu";
import { createWebGL2Renderer } from "./webgl";
import { buildMask, type Mask } from "./mask";
import { EMITTERS, PROBE, srgbToLinear, type Emitter } from "./emitters";
import { HEADER_FLOATS, LIGHT_FLOATS, UNIFORM_FLOATS, type Renderer } from "./types";

const TAU = Math.PI * 2;

/** Quality steps, walked down one at a time if the frame rate can't hold. */
const TIERS = [
  { samples: 32, scatterScale: 0.25 },
  { samples: 24, scatterScale: 0.2 },
  { samples: 16, scatterScale: 0.16 },
];
const MASK_SCALE = 0.25;
const MAX_OUTPUT_PIXELS = 2_400_000;
const EXPOSURE = 0.8;
const SCATTER_GAIN = 1.6;

type Light = Pick<Emitter, "strength" | "radius"> & { linear: [number, number, number] };

export class LightField {
  private renderer: Renderer | null = null;
  private mask: Mask | null = null;
  private readonly uniforms = new Float32Array(UNIFORM_FLOATS);
  private readonly cleanups: Array<() => void> = [];
  private disposed = false;

  private css = { w: 1, h: 1 };
  private output = { w: 1, h: 1 };
  private scatterSize: [number, number] = [1, 1];
  private tier = 0;

  private raf = 0;
  private last = 0;
  private time = 20;
  private onScreen = true;
  private live = false;
  private readonly calm: boolean;

  private pointer: { u: number; v: number } | null = null;
  private probe = { u: 0.5, v: 0.5, presence: 0 };

  private readonly lights: Light[] = EMITTERS.map((e) => ({ ...e, linear: srgbToLinear(e.srgb) }));
  private readonly probeLight: Light = { ...PROBE, linear: srgbToLinear(PROBE.srgb) };

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
  }

  async start(): Promise<void> {
    try {
      this.renderer = await createWebGPURenderer(this.canvas);
    } catch {
      try {
        this.renderer = createWebGL2Renderer(this.canvas);
      } catch {
        // No GPU path: the CSS background stands in.
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
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    this.renderer?.destroy();
    this.renderer = null;
  }

  /* --- sizing ------------------------------------------------------------ */

  private layout() {
    if (!this.renderer) return;
    const rect = this.hero.getBoundingClientRect();
    this.css = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };

    // The output is smooth gradients, so it never needs full device resolution.
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const pixels = this.css.w * this.css.h * dpr * dpr;
    if (pixels > MAX_OUTPUT_PIXELS) dpr *= Math.sqrt(MAX_OUTPUT_PIXELS / pixels);

    this.output = { w: Math.round(this.css.w * dpr), h: Math.round(this.css.h * dpr) };
    const { scatterScale } = TIERS[this.tier];
    this.scatterSize = [
      Math.max(1, Math.round(this.css.w * scatterScale)),
      Math.max(1, Math.round(this.css.h * scatterScale)),
    ];

    this.renderer.resize(this.output.w, this.output.h, ...this.scatterSize);
    this.mask = buildMask(this.canvas, this.name, MASK_SCALE);
    this.renderer.setMask(this.mask.canvas);
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

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const rect = this.hero.getBoundingClientRect();
      const next = { u: (e.clientX - rect.left) / rect.width, v: (e.clientY - rect.top) / rect.height };
      // Snap into place on entry rather than drifting in from the last exit.
      if (!this.pointer && this.probe.presence < 0.05) Object.assign(this.probe, next);
      this.pointer = next;
    };
    const onLeave = () => (this.pointer = null);
    this.hero.addEventListener("pointermove", onMove, { passive: true });
    this.hero.addEventListener("pointerleave", onLeave, { passive: true });

    const visibility = new IntersectionObserver(([entry]) => (this.onScreen = entry.isIntersecting));
    visibility.observe(this.hero);

    this.cleanups.push(() => {
      cancelAnimationFrame(pending);
      resizeObserver.disconnect();
      visibility.disconnect();
      document.fonts.removeEventListener("loadingdone", relayout);
      this.hero.removeEventListener("pointermove", onMove);
      this.hero.removeEventListener("pointerleave", onLeave);
    });
  }

  /* --- frame ------------------------------------------------------------- */

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 60;
    this.last = now;
    if (!this.onScreen || !this.renderer || !this.mask) return;

    this.time += dt * (this.calm ? 0.2 : 1);

    const { x0, y0, x1, y1 } = this.mask.bounds;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const hw = (x1 - x0) / 2;
    const hh = Math.max((y1 - y0) / 2, 0.06);

    const u = this.uniforms;
    u.fill(0);
    let count = 0;

    EMITTERS.forEach((e, i) => {
      const { ax, ay, fx, fy, px, py } = e.path;
      const lu = cx + hw * ax * Math.sin(this.time * fx * TAU + px);
      const lv = cy + hh * ay * Math.sin(this.time * fy * TAU + py);
      this.writeLight(count++, this.lights[i], lu, lv, 1);
    });

    // The probe eases after the pointer and fades with its presence.
    if (this.pointer) {
      const k = Math.min(1, dt * 4);
      this.probe.u += (this.pointer.u - this.probe.u) * k;
      this.probe.v += (this.pointer.v - this.probe.v) * k;
    }
    this.probe.presence += ((this.pointer ? 1 : 0) - this.probe.presence) * Math.min(1, dt * 2);
    if (this.probe.presence > 0.002) {
      this.writeLight(count++, this.probeLight, this.probe.u, this.probe.v, this.probe.presence);
    }

    u[0] = this.output.w;
    u[1] = this.output.h;
    u[2] = this.scatterSize[0];
    u[3] = this.scatterSize[1];
    u[4] = this.time;
    u[5] = count;
    u[6] = TIERS[this.tier].samples;
    u[7] = EXPOSURE;
    u[8] = this.css.w / this.css.h;
    u[9] = SCATTER_GAIN;

    this.renderer.render(u);

    if (!this.live) {
      this.live = true;
      this.hero.dataset.field = "live";
    }
    this.measure(now);
  };

  private writeLight(slot: number, light: Light, lu: number, lv: number, presence: number) {
    const o = HEADER_FLOATS + slot * LIGHT_FLOATS;
    const u = this.uniforms;
    u[o] = lu;
    u[o + 1] = lv;
    u[o + 2] = light.radius;
    u[o + 3] = light.strength * presence;
    u[o + 4] = light.linear[0];
    u[o + 5] = light.linear[1];
    u[o + 6] = light.linear[2];
  }

  /* --- adaptive quality ---------------------------------------------------- */

  private measure(now: number) {
    this.frames++;
    if (!this.windowStart) this.windowStart = now;
    const span = now - this.windowStart;
    if (span < 1000) return;

    const fps = (this.frames * 1000) / span;
    this.frames = 0;
    this.windowStart = now;

    if (this.warmup > 0) {
      this.warmup--;
      return;
    }
    if (!this.refreshHz) {
      // 30Hz panels and throttled tabs are normal, so "slow" is judged
      // against the display rather than a fixed 60.
      this.refreshHz = [30, 60, 90, 120, 144].reduce((best, hz) =>
        Math.abs(hz - fps) < Math.abs(best - fps) ? hz : best
      );
    }
    if (fps < this.refreshHz * 0.75 && this.tier < TIERS.length - 1) {
      this.tier++;
      this.layout();
    }
  }
}
