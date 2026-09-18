type Rgb = [number, number, number];

type Stray = {
  /** Page coordinates (CSS px). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The spot on the page it's making for, and then floats about. */
  homeX: number;
  homeY: number;
  color: Rgb;
  /** 0..1 how much of its task colour it still carries. */
  tint: number;
  age: number;
  life: number;
  seed: number;
};

/** At most this many agents wander the page at once. */
export const MAX_STRAYS = 9;
/** Robot height in px; mirrors the hero's agents. */
export const ROBOT = 15;
const CRUISE = 60;
const FLOAT = 14;

/**
 * Agents that have left the hero. Each picks a spot somewhere down the page,
 * flies there, then floats about it for a while, so a handful end up spread
 * across the site rather than streaming past. There are only ever a few, so
 * they're simulated on the CPU and drawn with a 2D canvas fixed over the
 * viewport, positioned in page coordinates so they scroll with the content.
 */
export class StrayLayer {
  private strays: Stray[] = [];
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private frame = 0;
  private last = 0;
  private pointer: [number, number] | null = null;

  constructor(private readonly random: () => number) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = "strays";
    this.canvas.setAttribute("aria-hidden", "true");
    document.body.append(this.canvas);
    this.context = this.canvas.getContext("2d")!;
    window.addEventListener("pointermove", this.onMove, { passive: true });
  }

  get count() {
    return this.strays.length;
  }

  /** Lets an agent out at a page position, heading on from where it was going. */
  release(x: number, y: number, vx: number, vy: number, color: Rgb, tint: number) {
    if (this.strays.length >= MAX_STRAYS) return;
    const r = this.random;
    const doc = document.documentElement;
    const width = doc.clientWidth;
    // Somewhere down the page, spread out; on wide screens, mostly in the margins beside the content.
    const content = Math.min(1040, width);
    const margin = (width - content) / 2;
    const side = r() < 0.5;
    const homeX =
      margin > 120 && r() < 0.8
        ? side
          ? margin * (0.2 + r() * 0.6)
          : width - margin * (0.2 + r() * 0.6)
        : width * (0.08 + r() * 0.84);
    const homeY = y + 200 + r() * Math.max(400, doc.scrollHeight - y - 400);
    this.strays.push({
      x,
      y,
      vx,
      vy: Math.max(vy, 20),
      homeX,
      homeY,
      color,
      tint,
      age: 0,
      life: 90 + r() * 60,
      seed: r() * 100,
    });
    if (!this.frame) {
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.tick);
    }
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("pointermove", this.onMove);
    this.canvas.remove();
  }

  private onMove = (e: PointerEvent) => {
    this.pointer = e.pointerType === "touch" ? null : [e.pageX, e.pageY];
  };

  private tick = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    const pageBottom = document.documentElement.scrollHeight - 24;
    const width = document.documentElement.clientWidth;

    this.strays = this.strays.filter((s) => {
      s.age += dt;
      // Fly towards home, then drift about it on a slow, looping wander.
      const wx = Math.sin(s.age * 0.31 + s.seed) * 70 + Math.sin(s.age * 0.13 + s.seed * 2) * 50;
      const wy = Math.cos(s.age * 0.27 + s.seed * 3) * 50;
      const dx = s.homeX + wx - s.x;
      const dy = s.homeY + wy - s.y;
      const far = Math.hypot(dx, dy);
      const speed = far > 160 ? CRUISE : FLOAT + (CRUISE - FLOAT) * (far / 160);
      let tx = (dx / Math.max(far, 1)) * speed;
      let ty = (dy / Math.max(far, 1)) * speed;
      if (this.pointer) {
        // Curious about a nearby pointer.
        const px = this.pointer[0] - s.x;
        const py = this.pointer[1] - s.y;
        const d = Math.hypot(px, py);
        if (d < 160 && d > 24) {
          tx += (px / d) * 30;
          ty += (py / d) * 30;
        }
      }
      const k = 1 - Math.exp(-dt * 1.2);
      s.vx += (tx - s.vx) * k;
      s.vy += (ty - s.vy) * k;
      s.x = Math.min(Math.max(s.x + s.vx * dt, 10), width - 10);
      s.y = Math.min(s.y + s.vy * dt, pageBottom);
      s.tint = Math.max(0, s.tint - dt / 30);
      return s.age < s.life;
    });

    this.draw(now / 1000);
    this.frame = this.strays.length ? requestAnimationFrame(this.tick) : 0;
  };

  private draw(time: number) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const c = this.context;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    for (const s of this.strays) {
      const x = s.x - window.scrollX;
      const y = s.y - window.scrollY;
      if (y < -30 || y > h + 30) continue;
      // Same look and brightness as in the hero; fade out at the end.
      const alpha = Math.min(1, (s.life - s.age) / 4) * (0.5 + 0.5 * s.tint);
      drawRobot(c, x, y, {
        tilt: Math.max(-0.45, Math.min(0.45, s.vx * 0.012)),
        tint: s.color,
        weight: s.tint,
        alpha,
        thrust: 0.55 + 0.45 * Math.sin(time * 22 + s.seed),
      });
    }
  }
}

const IDLE: Rgb = [0.6, 0.63, 0.72];
const rgb = (c: Rgb, k = 1, add = 0) =>
  `rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v * k + add)) * 255)).join(" ")})`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v + (b[i] - v) * t) as Rgb;

export type RobotStyle = {
  tilt: number;
  /** Task colour, and how much of it the robot has taken on (0..1). */
  tint: Rgb;
  weight: number;
  alpha: number;
  /** 0..1 flicker of the thruster. */
  thrust: number;
  /** Height in px; defaults to ROBOT. */
  size?: number;
};

/**
 * The hero's robot, drawn with the 2D canvas: a rounded head with a dark visor
 * and two glowing eyes, ears, an antenna with a lit tip, and a nozzle with a
 * flickering flame. Units are a tenth of its height, y down. Mirrors
 * fs_agents in agents-render.wgsl.
 */
export function drawRobot(c: CanvasRenderingContext2D, x: number, y: number, style: RobotStyle) {
  const { tilt, tint, weight, alpha, thrust } = style;
  const body = mixRgb(IDLE, tint.map((v) => v * 1.1 + 0.06) as Rgb, weight);
  const eye = mixRgb([0.78, 0.96, 1.0], tint.map((v) => v * 1.3 + 0.25) as Rgb, weight);
  const tip = mixRgb([1.0, 0.7, 0.3], tint.map((v) => v * 1.3 + 0.2) as Rgb, weight);

  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  const unit = (style.size ?? ROBOT) / 10;
  c.scale(unit, unit);
  c.globalAlpha = alpha;

  const flame = 1.2 + thrust * 1.8;
  const fire = c.createLinearGradient(0, 4.5, 0, 4.5 + flame);
  fire.addColorStop(0, `rgb(255 158 51 / ${0.55 + 0.45 * thrust})`);
  fire.addColorStop(1, "rgb(255 158 51 / 0.2)");
  c.fillStyle = fire;
  c.beginPath();
  c.moveTo(-1.1, 4.5);
  c.lineTo(1.1, 4.5);
  c.lineTo(0, 4.5 + flame);
  c.fill();

  c.fillStyle = rgb(body, 0.72);
  c.beginPath();
  c.roundRect(-1.4, 3.4, 2.8, 1.1, 0.4);
  c.roundRect(-4.6, -0.6, 1, 2.2, 0.4);
  c.roundRect(3.6, -0.6, 1, 2.2, 0.4);
  c.rect(-0.3, -4.1, 0.6, 1.6);
  c.fill();

  c.fillStyle = rgb(tip);
  c.beginPath();
  c.arc(0, -4.7, 0.8, 0, Math.PI * 2);
  c.fill();

  // Head, lit from above.
  const shade = c.createLinearGradient(0, -2.6, 0, 3.6);
  shade.addColorStop(0, rgb(body, 1.18));
  shade.addColorStop(1, rgb(body, 0.78));
  c.fillStyle = shade;
  c.beginPath();
  c.roundRect(-3.8, -2.6, 7.6, 6.2, 1.8);
  c.fill();

  c.fillStyle = "rgb(13 14 18)";
  c.beginPath();
  c.roundRect(-2.8, -1.1, 5.6, 2.6, 1.1);
  c.fill();

  c.fillStyle = rgb(eye);
  c.beginPath();
  c.roundRect(-1.9, -0.35, 1.1, 1.1, 0.45);
  c.roundRect(0.8, -0.35, 1.1, 1.1, 0.45);
  c.fill();
  c.restore();
}
