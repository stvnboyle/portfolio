import { seeded } from "./random";

type Rgb = [number, number, number];

/** Mirrors the targets array in agents.wgsl: two vec4s per point. */
export const MAX_FORMATION = 640;
/** vec4s of state per agent. Mirrors agents.wgsl. */
const STRIDE = 3;
/** Seconds: robots launch over LAUNCH (left to right, with some scatter), hold once all are in, then burst. */
const LAUNCH = 1.1;
const TRAVEL = 1.0;
const HOLD = 0.7;
/** Seconds for the letters to light up left to right once the swarm bursts, and to cool to white. */
const IGNITE = 0.3;
const COOL = 0.9;
const POP = 0.3;
/**
 * After this long since navigation the CSS fallback has already shown the
 * name (see .hero[data-intro] in globals.css), so the intro is skipped rather
 * than hiding it again.
 */
const LATEST_START_MS = 2000;

/** The glow ramp, magenta through cyan. Mirrors --glow-1..4 in globals.css. */
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
const css = (c: Rgb) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

export type Formation = {
  /** Per point: target x, y (px), launch time (s), -; then colour rgb, -. */
  targets: Float32Array<ArrayBuffer>;
  /** For the swarm uniform: clock (s), burst time (s, 1e9 until then), -, -. */
  form(): [number, number, number, number];
  /** Where the burst blows out from (x, y px), and the robots' scale once they've landed. */
  centre(): [number, number, number, number];
  update(dt: number): void;
};

/**
 * The name's entrance: the swarm assembles it. Several hundred robots fly in
 * from beyond the edges, sweeping left to right, each to a point sampled from
 * the name's own letters, shrinking to a glowing pixel as it lands. Their
 * trails streak in behind them. Once the whole name is held in robots, they
 * burst outward and away, and the letters ignite where they were, in the
 * swarm's colours, cooling to white.
 *
 * The robots are ordinary swarm agents in otherwise empty slots, flagged in
 * their state (info.z = 1 + their point) so agents.wgsl steers them here
 * instead of flocking; the letters are CSS, driven per letter by --fill,
 * --hot, --cool and --pop.
 */
export function createFormation(
  hero: HTMLElement,
  canvas: HTMLCanvasElement,
  enabled: boolean,
  state: Float32Array<ArrayBuffer>,
  robot: number
): Formation {
  const name = hero.querySelector<HTMLElement>(".hero__name");
  const letters = name ? [...name.querySelectorAll<HTMLElement>("[data-g]")] : [];
  const targets = new Float32Array(MAX_FORMATION * 8);
  const formation: Formation = {
    targets,
    form: () => [t, burstAt, 0, 0],
    centre: () => [centre[0], centre[1], formedScale, 0],
    update,
  };

  let t = 0;
  let burstAt = 1e9;
  let formedScale = 1;
  let centre: [number, number, number, number] = [0, 0, 0, 0];
  let running = enabled && letters.length > 0 && performance.now() < LATEST_START_MS;
  if (!running || !name) return formation;

  /* --- sample the name's letters into points ------------------------------ */

  const origin = canvas.getBoundingClientRect();
  const box = name.getBoundingClientRect();
  const style = getComputedStyle(name);
  const width = Math.ceil(box.width);
  const height = Math.ceil(box.height);
  const ink = document.createElement("canvas");
  ink.width = width;
  ink.height = height;
  const context = ink.getContext("2d", { willReadFrequently: true });
  if (!context || !width || !height) {
    running = false;
    return formation;
  }
  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  context.textBaseline = "alphabetic";
  context.fillStyle = "#fff";
  // Each letter where the page actually laid it out (letter spacing, wrapping and all).
  for (const g of letters) {
    const r = g.getBoundingClientRect();
    const m = context.measureText(g.textContent ?? "");
    const baseline = r.top - box.top + (r.height - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
    context.fillText(g.textContent ?? "", r.left - box.left, baseline);
  }
  const alpha = context.getImageData(0, 0, width, height).data;
  const sample = (spacing: number) => {
    const points: Array<[number, number]> = [];
    for (let y = spacing / 2; y < height; y += spacing) {
      // Alternate rows offset, for a closer, less grid-like fill.
      const shift = (Math.round(y / spacing) % 2) * (spacing / 2);
      for (let x = spacing / 2 + shift; x < width; x += spacing) {
        if (alpha[(Math.floor(y) * width + Math.floor(x)) * 4 + 3] > 140) points.push([x, y]);
      }
    }
    return points;
  };
  // As fine as the robot budget allows: the points array's size, and the swarm's empty slots.
  const slots = state.length / (STRIDE * 4);
  let free = 0;
  for (let i = 0; i < slots; i++) if (state[i * STRIDE * 4 + 8] < 0.5) free++;
  const budget = Math.min(MAX_FORMATION, free);
  let spacing = Math.max(3, parseFloat(style.fontSize) / 16);
  let points = sample(spacing);
  while (points.length > budget) points = sample((spacing *= 1.12));
  formedScale = Math.min(0.5, (spacing * 1.55) / robot);

  /* --- recruit robots from empty slots ------------------------------------ */

  const random = seeded(7);
  const left = box.left - origin.left;
  const top = box.top - origin.top;
  centre = [left + width / 2, top + height / 2, 0, 0];
  const reach = Math.hypot(canvas.clientWidth, hero.clientHeight) * 0.62;
  let k = 0;
  for (let i = slots - 1; i >= 0 && k < points.length; i--) {
    const o = i * STRIDE * 4;
    if (state[o + 8] > 0.5) continue;
    const [px, py] = points[k];
    const [x, y] = [left + px, top + py];
    const colour = glowAt(px / width);
    // Launch left to right, with some scatter so it streams rather than marches.
    const launch = (px / width) * LAUNCH * 0.75 + random() * LAUNCH * 0.25;
    targets.set([x, y, launch, 0, ...colour, 0], k * 8);
    // Start out beyond the edges, roughly behind where they're headed.
    const angle = Math.atan2(y - centre[1], x - centre[0]) + (random() - 0.5) * 1.6;
    const far = reach * (0.9 + random() * 0.5);
    state.set([centre[0] + Math.cos(angle) * far, centre[1] + Math.sin(angle) * far, 0, 0], o);
    state.set([...colour, 0], o + 4);
    state.set([1, -1, 1 + k, 1], o + 8);
    k++;
  }
  const holdFrom = LAUNCH + TRAVEL;
  // Only a running intro claims the name; agents.ts marks it done if none does.
  hero.dataset.intro = "etching";

  function update(dt: number) {
    if (!running) return;
    t += dt;
    if (burstAt > 1e8 && t > holdFrom + HOLD) burstAt = t;
    const lit = t - burstAt;

    for (const g of letters) {
      const r = g.getBoundingClientRect();
      const across = clamp01(((r.left + r.right) / 2 - box.left) / width);
      const hit = lit - across * IGNITE;
      g.style.setProperty("--fill", hit >= 0 ? "1" : "0");
      g.style.setProperty("--angle", "90deg");
      g.style.setProperty("--hot", css(glowAt(across)));
      g.style.setProperty("--cool", hit >= 0 ? clamp01(hit / COOL).toFixed(3) : "0");
      g.style.setProperty("--pop", hit >= 0 ? (1 - smooth(clamp01(hit / POP))).toFixed(3) : "0");
    }

    if (lit > IGNITE + COOL + 0.05) {
      running = false;
      hero.dataset.intro = "done";
      for (const g of letters) for (const prop of ["--fill", "--angle", "--hot", "--cool", "--pop"]) g.style.removeProperty(prop);
    }
  }

  return formation;
}
