import { PALETTE } from "./palette";

type Vec4 = [number, number, number, number];
type Rgb = [number, number, number];

/** Mirrors the intro array lengths in agents.wgsl and agents-render.wgsl. */
export const MAX_INTRO = 8;
/** Seconds: the pair flies in, welds the name from both ends to the middle, then breaks away. */
const FLY_IN = 0.8;
const WELD = 2.0;
const EXIT = 0.5;
/** Seconds for a welded letter to cool from its laser's colour to white. */
const COOL = 0.9;
/**
 * After this long since navigation the CSS fallback has already shown the
 * name (see .hero[data-intro] in globals.css), so the intro is skipped rather
 * than hiding it again.
 */
const LATEST_START_MS = 2000;

const MAGENTA = PALETTE[2];
const CYAN = PALETTE[3];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const zeros = (): Vec4[] => Array.from({ length: MAX_INTRO }, () => [0, 0, 0, 0]);
const css = (c: Rgb) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

export type Intro = {
  /** Scripted robots this frame: position and velocity (x, y, vx, vy), and tint (rgb, weight). */
  at: Vec4[];
  tint: Vec4[];
  count: number;
  /** A laser per robot, from the robot to where it's welding (x0, y0, x1, y1), and colour + strength. */
  beams: Vec4[];
  beamTint: Vec4[];
  update(dt: number): void;
};

/**
 * The name's entrance. Two robots come in from opposite sides: magenta swoops
 * in from the top left and fires down, cyan rises from the bottom right and
 * fires up. Their lasers scan up and down the letters as they work in from
 * each end, and each letter welds in glowing in its laser's colour and cools
 * to white. Where they meet they break away in opposite directions and join
 * the swarm. The robots are scripted here and written into the GPU swarm
 * (agents.wgsl) each step; the letters are CSS, driven per letter
 * (GlowHeadings splits the name into [data-g] spans) by --fill, --angle,
 * --hot and --cool.
 */
export function createIntro(hero: HTMLElement, canvas: HTMLCanvasElement, enabled: boolean, robot: number): Intro {
  const name = hero.querySelector<HTMLElement>(".hero__name");
  const intro: Intro = { at: zeros(), tint: zeros(), count: 0, beams: zeros(), beamTint: zeros(), update };
  // When each letter finished welding, for its cool-down.
  const welded = new Map<HTMLElement, number>();

  let t = 0;
  let running = enabled && Boolean(name) && performance.now() < LATEST_START_MS;
  hero.dataset.intro = running ? "etching" : "done";

  function finish() {
    running = false;
    intro.count = 0;
    intro.beamTint = zeros();
    hero.dataset.intro = "done";
    name?.querySelectorAll<HTMLElement>("[data-g]").forEach((g) => {
      for (const prop of ["--fill", "--angle", "--hot", "--cool"]) g.style.removeProperty(prop);
    });
  }

  function update(dt: number) {
    if (!running || !name) return;
    t += dt;
    // The last letters to weld finish cooling after the robots have gone.
    if (t > FLY_IN + WELD + COOL + 0.05) return finish();
    const released = t > FLY_IN + WELD + EXIT;

    const origin = canvas.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    const left = box.left - origin.left;
    const right = box.right - origin.left;
    const top = box.top - origin.top;
    const bottom = box.bottom - origin.top;
    const mid = (left + right) / 2;
    // The robots keep a little closer on a narrow name (phones).
    const scale = Math.min(1, box.width / 700);

    const p = clamp01((t - FLY_IN) / WELD);
    const e = smooth(p);
    const speed = t > FLY_IN && p < 1 ? (6 * p * (1 - p) * (mid - left)) / WELD : 0;
    const fronts = [left + e * (mid - left), right - e * (right - mid)];
    const beam = smooth(clamp01((t - FLY_IN + 0.2) / 0.3)) * (1 - smooth(clamp01((t - FLY_IN - WELD + 0.05) / 0.2)));

    // Magenta works from the left, above the name; cyan from the right, below it.
    const crew = [
      { color: MAGENTA, dir: 1, from: [left - 260 * scale, -60], hover: [fronts[0] - 24 * scale, top - 62 * scale], exit: [170, -110] },
      { color: CYAN, dir: -1, from: [right + 260 * scale, bottom + 240], hover: [fronts[1] + 24 * scale, bottom + 58 * scale], exit: [-170, 110] },
    ];
    crew.forEach((c, k) => {
      const bob = 5 * Math.sin(t * 2.6 + k * 2);
      let [x, y] = [c.hover[0], c.hover[1] + bob];
      let [vx, vy] = [c.dir * speed, 13 * Math.cos(t * 2.6 + k * 2)];
      if (t < FLY_IN) {
        // Swoop in, easing out onto the hover point.
        const q = t / FLY_IN;
        const ease = 1 - (1 - q) ** 3;
        const slope = (3 * (1 - q) ** 2) / FLY_IN;
        x = c.from[0] + (c.hover[0] - c.from[0]) * ease;
        y = c.from[1] + (c.hover[1] - c.from[1]) * ease;
        vx = (c.hover[0] - c.from[0]) * slope;
        vy = (c.hover[1] - c.from[1]) * slope;
      } else if (p >= 1) {
        // Break away, speeding up, then the swarm takes over with this velocity.
        const s = t - FLY_IN - WELD;
        x += c.exit[0] * s * s;
        y += c.exit[1] * s * s;
        vx = c.exit[0] * 2 * s;
        vy = c.exit[1] * 2 * s;
      }
      const [r, g, b] = c.color;
      intro.at[k] = [x, y, vx, vy];
      intro.tint[k] = [r, g, b, 1];
      // Each laser scans up and down the letters as it goes.
      const scan = top + (bottom - top) * (0.5 + 0.34 * Math.sin(t * 10 + k * 1.7));
      intro.beams[k] = [x, y + c.dir * robot * 0.35, fronts[k], scan];
      intro.beamTint[k] = [r, g, b, beam];
    });
    intro.count = released ? 0 : crew.length;
    if (released) intro.beamTint = zeros();

    // Each letter welds in from its side's end, hot in its laser's colour, then cools.
    for (const g of name.querySelectorAll<HTMLElement>("[data-g]")) {
      const r = g.getBoundingClientRect();
      const fromLeft = (r.left + r.right) / 2 - origin.left < mid;
      const fill = clamp01(
        fromLeft ? (fronts[0] - (r.left - origin.left)) / r.width : (r.right - origin.left - fronts[1]) / r.width
      );
      if (fill >= 1 && !welded.has(g)) welded.set(g, t);
      const since = welded.get(g);
      g.style.setProperty("--fill", fill.toFixed(3));
      g.style.setProperty("--angle", fromLeft ? "90deg" : "270deg");
      g.style.setProperty("--hot", css(fromLeft ? MAGENTA : CYAN));
      g.style.setProperty("--cool", since === undefined ? "0" : clamp01((t - since) / COOL).toFixed(3));
    }
  }

  return intro;
}
