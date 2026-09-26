import { MAX_INTRO, type Intro } from "./intro";
import type { Rgb } from "./palette";

type Vec4 = [number, number, number, number];

/** Layers the name is printed in, bottom to top (fewer on phones, where the name is smaller). */
const LAYERS = 14;
const LAYERS_SMALL = 10;
/** Seconds: the head flies in to the bottom corner, prints, then flies off. */
const FLY_IN = 0.7;
const PASS = 0.15;
const EXIT = 0.6;
/** Seconds for the printed name to cool to white once the last layer's down. */
const COOL = 0.8;
/** How much of the fresh layer's colour the printed part keeps while printing (0 all, 1 none). */
const WARM = 0.35;
/**
 * After this long since navigation the CSS fallback has already shown the
 * name (see .hero[data-intro] in globals.css), so the intro is skipped rather
 * than hiding it again.
 */
const LATEST_START_MS = 2000;

/** The glow ramp, magenta through cyan, printed bottom to top. Mirrors --glow-1..4 in globals.css. */
const GLOW: Rgb[] = [
  [1, 0.24, 0.6],
  [0.58, 0.31, 1],
  [0.16, 0.48, 1],
  [0.1, 0.92, 0.82],
];
const glowAt = (t: number): Rgb => {
  const x = Math.min(0.999, Math.max(0, t)) * (GLOW.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return GLOW[i].map((v, k) => v + (GLOW[i + 1][k] - v) * f) as Rgb;
};
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const zeros = (): Vec4[] => Array.from({ length: MAX_INTRO }, () => [0, 0, 0, 0]);
const css = (c: Rgb) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

/**
 * The name's entrance, printed. One robot flies in as a print head and works
 * across the name in layers from the bottom up, like a 3D printer: a pass
 * left to right, step up, a pass back. A scan line lights the layer being
 * printed, a beam runs from the head's nozzle to where it's laying down, and
 * each letter fills upwards behind it with a hot edge on the fresh layer. The
 * colour climbs the glow ramp as the print rises, and once it's done the
 * head flies off and the name cools to white.
 *
 * The head is scripted here and written into the GPU swarm (agents.wgsl) each
 * step; the scan line and nozzle beam are drawn by the beam pass
 * (agents-render.wgsl); the letters are CSS, driven per letter (GlowHeadings
 * splits the name into [data-g] spans) by --fill, --hot, --base and --cool.
 */
export function createPrint(hero: HTMLElement, canvas: HTMLCanvasElement, enabled: boolean, robot: number): Intro {
  const name = hero.querySelector<HTMLElement>(".hero__name");
  const letters = name ? [...name.querySelectorAll<HTMLElement>("[data-g]")] : [];
  const intro: Intro = { at: zeros(), tint: zeros(), count: 0, beams: zeros(), beamTint: zeros(), update };
  const layers = robot < 20 ? LAYERS_SMALL : LAYERS;
  const printed = FLY_IN + layers * PASS;

  let t = 0;
  let running = enabled && letters.length > 0 && performance.now() < LATEST_START_MS;
  if (running) {
    hero.dataset.intro = "etching";
    // Selects the printed style of the letters (globals.css).
    hero.dataset.print = "";
  }

  function finish() {
    running = false;
    intro.count = 0;
    intro.beamTint = zeros();
    hero.dataset.intro = "done";
    delete hero.dataset.print;
    for (const g of letters) for (const prop of ["--fill", "--angle", "--hot", "--base", "--cool"]) g.style.removeProperty(prop);
  }

  function update(dt: number) {
    if (!running || !name) return;
    t += dt;
    if (t > printed + COOL + 0.05) return finish();

    const origin = canvas.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    const left = box.left - origin.left;
    const right = box.right - origin.left;
    const top = box.top - origin.top;
    const bottom = box.bottom - origin.top;
    const layerHeight = (bottom - top) / layers;
    // The head overshoots each end a little before stepping up.
    const margin = 14;

    // Where the print is: which layer, which way this pass goes, and how far along it.
    const printing = clamp01((t - FLY_IN) / (layers * PASS)) * layers;
    const layer = Math.min(layers - 1, Math.floor(printing));
    const along = t < FLY_IN ? 0 : t >= printed ? 1 : smooth(printing - layer);
    const rightward = layer % 2 === 0;
    const headX = rightward ? left - margin + along * (right - left + 2 * margin) : right + margin - along * (right - left + 2 * margin);
    const lineY = bottom - (layer + 1) * layerHeight;
    const colour = glowAt((layer + along) / layers);
    const [r, g, b] = colour;

    // The head: flies in to the bottom left, rides just above the layer, then leaves up and to the right.
    let x = headX;
    let y = lineY - robot * 0.9 + 1.5 * Math.sin(t * 9);
    let vx = (rightward ? 1 : -1) * ((right - left + 2 * margin) / PASS) * 0.08;
    let vy = 0;
    if (t < FLY_IN) {
      const q = t / FLY_IN;
      const ease = 1 - (1 - q) ** 3;
      const from: [number, number] = [left - 320, bottom + 180];
      x = from[0] + (x - from[0]) * ease;
      y = from[1] + (y - from[1]) * ease;
      vx = ((headX - from[0]) * 3 * (1 - q) ** 2) / FLY_IN;
      vy = ((lineY - robot * 0.9 - from[1]) * 3 * (1 - q) ** 2) / FLY_IN;
    } else if (t > printed) {
      const s = t - printed;
      x += 260 * s * s;
      y -= 200 * s * s;
      vx = 520 * s;
      vy = -400 * s;
    }
    intro.at[0] = [x, y, vx, vy];
    intro.tint[0] = [r, g, b, 1];
    intro.count = t > printed + EXIT ? 0 : 1;

    // The scan line across the layer, in two halves meeting (and flaring) at the head,
    // and the nozzle beam from the head down to the print.
    const live = t >= FLY_IN - 0.1 && t < printed + 0.05 ? smooth(clamp01((t - FLY_IN + 0.1) / 0.2)) : 0;
    const settle = t >= printed ? 1 - clamp01((t - printed) / 0.25) : 1;
    const scanY = lineY + layerHeight * 0.5;
    intro.beams = zeros();
    intro.beamTint = zeros();
    intro.beams[0] = [left - 40, scanY, headX, scanY];
    intro.beams[1] = [right + 40, scanY, headX, scanY];
    intro.beams[2] = [x, y + robot * 0.45, headX, scanY];
    intro.beamTint[0] = [r, g, b, 0.35 * live * settle];
    intro.beamTint[1] = [r, g, b, 0.35 * live * settle];
    intro.beamTint[2] = [r, g, b, live * settle];

    // Each letter is printed up to the layer below, plus this layer once the head's passed it.
    const base = css(glowAt(0));
    const cool = t < printed ? WARM : WARM + (1 - WARM) * clamp01((t - printed) / COOL);
    for (const el of letters) {
      const rect = el.getBoundingClientRect();
      const centre = (rect.left + rect.right) / 2 - origin.left;
      const passed = t >= printed || (t >= FLY_IN && (rightward ? centre < headX : centre > headX));
      const edge = t < FLY_IN ? bottom : passed ? lineY : lineY + layerHeight;
      const letterTop = rect.top - origin.top;
      const letterBottom = rect.bottom - origin.top;
      const done = clamp01((letterBottom - edge) / (letterBottom - letterTop));
      el.style.setProperty("--fill", done.toFixed(4));
      el.style.setProperty("--angle", "0deg");
      el.style.setProperty("--hot", css(colour));
      el.style.setProperty("--base", base);
      el.style.setProperty("--cool", cool.toFixed(3));
    }
  }

  return intro;
}
