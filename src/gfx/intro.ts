import { PALETTE } from "./palette";

type Vec4 = [number, number, number, number];
type Rgb = [number, number, number];

/** Mirrors the intro array lengths in agents.wgsl and agents-render.wgsl. */
export const MAX_INTRO = 8;
/** Seconds: the crew flies in, fires a bolt at each letter in turn, then breaks away. */
const FLY_IN = 0.8;
const SHOOT = 1.7;
/** How long a bolt takes to cross to its letter, and how long its impact flash lasts. */
const FLIGHT = 0.2;
const FLASH = 0.16;
const EXIT = 0.5;
/** Seconds for a letter to cool from its bolt's colour to white, and to settle from its pop. */
const COOL = 0.9;
const POP = 0.3;
/** Longest a bolt's streak gets, in px. */
const STREAK = 30;
/**
 * After this long since navigation the CSS fallback has already shown the
 * name (see .hero[data-intro] in globals.css), so the intro is skipped rather
 * than hiding it again.
 */
const LATEST_START_MS = 2000;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const zeros = (): Vec4[] => Array.from({ length: MAX_INTRO }, () => [0, 0, 0, 0]);
const css = (c: Rgb) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")})`;

export type Intro = {
  /** Scripted robots this frame: position and velocity (x, y, vx, vy), and tint (rgb, weight). */
  at: Vec4[];
  tint: Vec4[];
  count: number;
  /** Bolts in flight (tail x, y → head x, y), and colour + strength. */
  beams: Vec4[];
  beamTint: Vec4[];
  update(dt: number): void;
};

type Gunner = {
  color: Rgb;
  /** Which half of the name it covers, and whether it hovers above (-1) or below (1). */
  half: 0 | 1;
  side: -1 | 1;
  /** Where it swoops in from and breaks away to, relative to its hover point. */
  from: [number, number];
  exit: [number, number];
  /** When it last fired, for the recoil. */
  fired: number;
  aimX: number;
};

type Shot = { letter: HTMLElement; gunner: number; at: number };

/**
 * The name's entrance. Four robots swoop in, two above the name and two
 * below, and shoot it into existence: each fires colour bolts at the letters
 * on its half, and each letter bursts in where a bolt lands, in the bolt's
 * colour, then cools to white. Once every letter's in they break away and
 * join the swarm. The robots are scripted here and written into the GPU swarm
 * (agents.wgsl) each step, and the bolts are drawn by the beam pass
 * (agents-render.wgsl); the letters are CSS, driven per letter (GlowHeadings
 * splits the name into [data-g] spans) by --fill, --hot, --cool and --pop.
 */
export function createIntro(hero: HTMLElement, canvas: HTMLCanvasElement, enabled: boolean, robot: number): Intro {
  const name = hero.querySelector<HTMLElement>(".hero__name");
  const intro: Intro = { at: zeros(), tint: zeros(), count: 0, beams: zeros(), beamTint: zeros(), update };
  const letters = name ? [...name.querySelectorAll<HTMLElement>("[data-g]")] : [];

  const gunners: Gunner[] = [
    { color: PALETTE[2], half: 0, side: -1, from: [-300, -140], exit: [-150, -120], fired: -1, aimX: 0 },
    { color: PALETTE[3], half: 1, side: 1, from: [300, 260], exit: [160, 120], fired: -1, aimX: 0 },
    { color: PALETTE[1], half: 1, side: -1, from: [260, -160], exit: [150, -120], fired: -1, aimX: 0 },
    { color: PALETTE[0], half: 0, side: 1, from: [-260, 240], exit: [-160, 120], fired: -1, aimX: 0 },
  ];

  // Letters go in from the outside in, alternating ends, each shot by a robot on its half.
  const order: number[] = [];
  for (let a = 0, b = letters.length - 1; a <= b; a++, b--) {
    order.push(a);
    if (a !== b) order.push(b);
  }
  const shots: Shot[] = order.map((index, k) => {
    const half = index < letters.length / 2 ? 0 : 1;
    // Above and below take turns on each half.
    const pair = gunners.map((g, i) => i).filter((i) => gunners[i].half === half);
    return { letter: letters[index], gunner: pair[Math.floor(k / 2) % pair.length], at: FLY_IN + (k / Math.max(1, order.length - 1)) * SHOOT };
  });
  const lastHit = FLY_IN + SHOOT + FLIGHT;

  let t = 0;
  let running = enabled && letters.length > 0 && performance.now() < LATEST_START_MS;
  // Only a running intro claims the name; agents.ts marks it done if none does.
  if (running) hero.dataset.intro = "etching";

  function finish() {
    running = false;
    intro.count = 0;
    intro.beamTint = zeros();
    hero.dataset.intro = "done";
    for (const g of letters) for (const prop of ["--fill", "--angle", "--hot", "--cool", "--pop"]) g.style.removeProperty(prop);
  }

  function update(dt: number) {
    if (!running || !name) return;
    t += dt;
    if (t > lastHit + COOL + 0.05) return finish();
    const released = t > lastHit + EXIT;

    const origin = canvas.getBoundingClientRect();
    const box = name.getBoundingClientRect();
    const left = box.left - origin.left;
    const right = box.right - origin.left;
    const top = box.top - origin.top;
    const bottom = box.bottom - origin.top;
    // The robots keep a little closer on a narrow name (phones).
    const scale = Math.min(1, box.width / 700);
    const centre = (el: HTMLElement): [number, number] => {
      const r = el.getBoundingClientRect();
      return [(r.left + r.right) / 2 - origin.left, (r.top + r.bottom) / 2 - origin.top];
    };

    // Each robot hovers over its half, drifting towards the letter it's aiming at.
    const hover = gunners.map((g, k) => {
      const home = left + (right - left) * (g.half === 0 ? 0.25 : 0.75);
      const next = shots.find((s) => s.gunner === k && s.at >= t - FLIGHT);
      const aim = next ? centre(next.letter)[0] : home;
      g.aimX += ((t < FLY_IN ? home : mixTo(home, aim, 0.55)) - g.aimX) * (g.aimX ? 1 - Math.exp(-dt * 5) : 1);
      const y = g.side < 0 ? top - 64 * scale : bottom + 58 * scale;
      return [g.aimX, y + 5 * Math.sin(t * 2.6 + k * 1.9)] as [number, number];
    });

    gunners.forEach((g, k) => {
      let [x, y] = hover[k];
      let vx = 0;
      let vy = 13 * Math.cos(t * 2.6 + k * 1.9);
      if (t < FLY_IN) {
        // Swoop in, easing out onto the hover point.
        const q = t / FLY_IN;
        const ease = 1 - (1 - q) ** 3;
        const slope = (3 * (1 - q) ** 2) / FLY_IN;
        x += g.from[0] * (1 - ease);
        y += g.from[1] * (1 - ease);
        vx = -g.from[0] * slope;
        vy = -g.from[1] * slope;
      } else if (t > lastHit) {
        // Break away, speeding up, then the swarm takes over with this velocity.
        const s = t - lastHit;
        x += g.exit[0] * s * s;
        y += g.exit[1] * s * s;
        vx = g.exit[0] * 2 * s;
        vy = g.exit[1] * 2 * s;
      } else if (g.fired >= 0) {
        // A kick back from the shot, settling quickly.
        const kick = Math.exp(-(t - g.fired) * 14);
        y += g.side * 7 * kick;
        vy += g.side * 90 * kick;
      }
      const [r, gr, b] = g.color;
      intro.at[k] = [x, y, vx, vy];
      intro.tint[k] = [r, gr, b, 1];
    });
    intro.count = released ? 0 : gunners.length;

    // Bolts: a short bright streak from the muzzle to the letter, then a flash where it lands.
    intro.beams = zeros();
    intro.beamTint = zeros();
    let slot = 0;
    for (const shot of shots) {
      const g = gunners[shot.gunner];
      const since = t - shot.at;
      const [tx, ty] = centre(shot.letter);
      if (since >= 0 && g.fired < shot.at) g.fired = shot.at;

      if (since >= 0 && since < FLIGHT + FLASH && slot < MAX_INTRO) {
        const [mx, my0] = hover[shot.gunner];
        const my = my0 - g.side * robot * 0.35;
        const k = smooth(clamp01(since / FLIGHT));
        const hx = mx + (tx - mx) * k;
        const hy = my + (ty - my) * k;
        const len = Math.hypot(tx - mx, ty - my) || 1;
        const tail = Math.min(STREAK, len * k);
        const [dx, dy] = [(tx - mx) / len, (ty - my) / len];
        const flash = since > FLIGHT ? 1 - (since - FLIGHT) / FLASH : 1;
        intro.beams[slot] = [hx - dx * Math.max(2, tail * flash), hy - dy * Math.max(2, tail * flash), hx, hy];
        intro.beamTint[slot] = [...g.color, flash] as Vec4;
        slot++;
      }

      // The letter bursts in where the bolt lands, then cools and settles.
      const hit = since - FLIGHT;
      const el = shot.letter;
      el.style.setProperty("--fill", hit >= 0 ? "1" : "0");
      el.style.setProperty("--angle", "90deg");
      el.style.setProperty("--hot", css(g.color));
      el.style.setProperty("--cool", hit >= 0 ? clamp01(hit / COOL).toFixed(3) : "0");
      el.style.setProperty("--pop", hit >= 0 ? (1 - smooth(clamp01(hit / POP))).toFixed(3) : "0");
    }
  }

  return intro;
}

const mixTo = (a: number, b: number, t: number) => a + (b - a) * t;
