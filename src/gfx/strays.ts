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
export const ROBOT = 20;
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
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
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
      drawRobot(c, x, y, { vx: s.vx, vy: s.vy, tint: s.color, weight: s.tint, alpha, time, seed: s.seed });
    }
  }
}

const IDLE: Rgb = [0.6, 0.63, 0.72];
const rgb = (c: Rgb, k = 1, alpha = 1) =>
  `rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v * k)) * 255)).join(" ")} / ${alpha})`;
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => v + (b[i] - v) * t) as Rgb;

export type RobotStyle = {
  /** Velocity in px/s: sets the lean and where the exhaust streams. */
  vx: number;
  vy: number;
  /** Task colour, and how much of it the robot has taken on (0..1). */
  tint: Rgb;
  weight: number;
  alpha: number;
  /** Seconds, for the scanner and thruster flicker, and a per-robot offset. */
  time: number;
  seed: number;
  /** Height in px; defaults to ROBOT. */
  size?: number;
};

/** A capsule from a to b, tapering from radius ra to rb. */
function taper(c: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, ra: number, rb: number) {
  const angle = Math.atan2(by - ay, bx - ax);
  c.moveTo(ax + Math.cos(angle - Math.PI / 2) * ra, ay + Math.sin(angle - Math.PI / 2) * ra);
  c.arc(bx, by, rb, angle - Math.PI / 2, angle + Math.PI / 2);
  c.arc(ax, ay, ra, angle + Math.PI / 2, angle + (Math.PI * 3) / 2);
}

/**
 * The hero's robot, drawn with the 2D canvas: a crisp helmet with a lit rim,
 * swept-back fins, a dark visor with an LED strip and a sweeping scanner eye,
 * a chin plate, and twin thrusters whose exhaust streams out behind it as it
 * leans into its direction of travel. Units are a tenth of its height, y
 * down. Mirrors vs_agents / fs_agents in agents-render.wgsl.
 */
export function drawRobot(c: CanvasRenderingContext2D, x: number, y: number, style: RobotStyle) {
  const { vx, vy, tint, weight, alpha, time, seed } = style;
  const body = mixRgb(IDLE, tint.map((v) => v * 1.1 + 0.06) as Rgb, weight);
  const eye = mixRgb([0.78, 0.96, 1.0], tint.map((v) => v * 1.3 + 0.25) as Rgb, weight);
  const fire = mixRgb([1.0, 0.62, 0.2], tint.map((v) => v * 1.2 + 0.1) as Rgb, 0.55 * weight);

  const tilt = Math.max(-0.9, Math.min(0.9, vx * 0.02));
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const speed = Math.hypot(vx, vy);
  // Heading in the robot's own frame; the exhaust streams back against it.
  const hx = (vx * cos + vy * sin) / Math.max(speed, 1e-3);
  const hy = (-vx * sin + vy * cos) / Math.max(speed, 1e-3);
  const burn = Math.min(1.3, speed / 70);
  const ex = -hx * burn;
  const ey = 0.7 - hy * burn;
  const el = Math.hypot(ex, ey) || 1;
  const length = (1.8 + burn * 4.2) * (0.85 + 0.15 * Math.sin(time * 30 + seed));
  const scan = 2 * Math.sin(time * (1.4 + 2.6 * weight) + seed);

  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  const unit = (style.size ?? ROBOT) / 10;
  c.scale(unit, unit);
  c.globalAlpha = alpha;

  // Exhaust from both nozzles.
  for (const side of [-1, 1]) {
    const nx = side * 1.75;
    const tx = nx + (ex / el) * length;
    const ty = 4.2 + (ey / el) * length;
    const burnFill = c.createLinearGradient(nx, 4.2, tx, ty);
    burnFill.addColorStop(0, rgb(fire, 1, 0.95));
    burnFill.addColorStop(1, rgb(fire, 1, 0));
    c.fillStyle = burnFill;
    c.beginPath();
    taper(c, nx, 4.2, tx, ty, 0.55, 0.05);
    c.fill();
  }

  // Swept-back fins, thruster pods and chin plate.
  c.fillStyle = rgb(body, 0.6);
  c.beginPath();
  for (const side of [-1, 1]) {
    c.moveTo(side * 3.2, -1.9);
    c.lineTo(side * 5.6, -4.3);
    c.lineTo(side * 3.7, 0.6);
    c.closePath();
  }
  c.roundRect(-2.5, 3.15, 1.5, 1.2, 0.3);
  c.roundRect(1.0, 3.15, 1.5, 1.2, 0.3);
  c.roundRect(-2.3, 2.45, 4.6, 1.1, 0.3);
  c.fill();

  // Helmet, lit from above, with a bright rim along the top.
  const shade = c.createLinearGradient(0, -3.1, 0, 2.9);
  shade.addColorStop(0, rgb(body, 1.2));
  shade.addColorStop(1, rgb(body, 0.74));
  c.fillStyle = shade;
  c.beginPath();
  c.roundRect(-3.7, -3.1, 7.4, 5.8, 1.1);
  c.fill();
  c.save();
  c.beginPath();
  c.rect(-4, -3.2, 8, 2);
  c.clip();
  c.strokeStyle = rgb(body, 1.6);
  c.lineWidth = 0.35;
  c.beginPath();
  c.roundRect(-3.53, -2.93, 7.06, 5.46, 0.93);
  c.stroke();
  c.restore();

  // Visor, LED strip and scanner eye.
  c.fillStyle = "rgb(10 11 15)";
  c.beginPath();
  c.roundRect(-3.0, -1.2, 6.0, 1.9, 0.8);
  c.fill();
  c.fillStyle = rgb(eye, 0.3);
  c.beginPath();
  c.roundRect(-2.45, -0.45, 4.9, 0.4, 0.2);
  c.fill();
  const glow = c.createRadialGradient(scan, -0.25, 0, scan, -0.25, 1.8);
  glow.addColorStop(0, rgb(eye, 1, 0.55));
  glow.addColorStop(1, rgb(eye, 1, 0));
  c.fillStyle = glow;
  c.beginPath();
  c.roundRect(-3.0, -1.2, 6.0, 1.9, 0.8);
  c.fill();
  c.fillStyle = rgb(eye, 1.15);
  c.beginPath();
  c.roundRect(scan - 0.65, -0.59, 1.3, 0.68, 0.3);
  c.fill();
  c.restore();
}
