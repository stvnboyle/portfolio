type Rgb = [number, number, number];

type Stray = {
  /** Page coordinates (CSS px). */
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: Rgb;
  /** 0..1 how much of its task colour it still carries. */
  tint: number;
  age: number;
  seed: number;
};

/** At most this many agents wander the page at once. */
export const MAX_STRAYS = 8;
/** Drift down the page, in px/s. */
const DRIFT = 26;
const SPEED = 34;
const LIFE = 40;
const BODY: Rgb = [0.55, 0.57, 0.66];
/** Robot height in px; mirrors the hero's agents. */
const ROBOT = 12;

/**
 * Agents that have left the hero and carry on down the page. There are only
 * ever a few, so they're simulated on the CPU and drawn with a 2D canvas that
 * sits fixed over the viewport, positioned in page coordinates so they scroll
 * with the content like everything else.
 */
export class StrayLayer {
  private strays: Stray[] = [];
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;
  private frame = 0;
  private last = 0;
  private pointer: [number, number] | null = null;

  constructor() {
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
    this.strays.push({ x, y, vx, vy: Math.max(vy, 10), color, tint, age: 0, seed: Math.random() * 100 });
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
      // Wander side to side while drifting down; curious about a nearby pointer.
      const wander = Math.sin(s.age * 0.5 + s.seed) * 0.8 + Math.sin(s.age * 0.23 + s.seed * 2) * 0.6;
      let ax = wander * 18 - s.vx * 0.4;
      let ay = (DRIFT - s.vy) * 0.6;
      if (this.pointer) {
        const dx = this.pointer[0] - s.x;
        const dy = this.pointer[1] - s.y;
        const d = Math.hypot(dx, dy);
        if (d < 160 && d > 1) {
          ax += (dx / d) * 40;
          ay += (dy / d) * 40;
        }
      }
      s.vx += ax * dt;
      s.vy += ay * dt;
      const speed = Math.hypot(s.vx, s.vy);
      if (speed > SPEED) {
        s.vx *= SPEED / speed;
        s.vy *= SPEED / speed;
      }
      s.x = Math.min(Math.max(s.x + s.vx * dt, 8), width - 8);
      s.y += s.vy * dt;
      s.tint = Math.max(0, s.tint - dt / 30);
      return s.age < LIFE && s.y < pageBottom;
    });

    this.draw();
    this.frame = this.strays.length ? requestAnimationFrame(this.tick) : 0;
  };

  private draw() {
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
      if (y < -20 || y > h + 20) continue;
      // Same look and brightness as in the hero, so the handover is seamless; fade out at the end.
      const alpha = Math.min(1, (LIFE - s.age) / 4) * (0.45 + 0.55 * s.tint);
      const rgb = BODY.map((g, i) => Math.round(Math.min(1, g + (s.color[i] * 1.2 + 0.05 - g) * s.tint) * 255)).join(" ");
      const thrust = 0.55 + 0.45 * Math.sin(s.age * 22 + s.seed);
      drawRobot(c, x, y, Math.max(-0.5, Math.min(0.5, s.vx * 0.012)), `rgb(${rgb} / ${alpha})`, alpha * 0.8 * thrust, thrust);
    }
  }
}

/**
 * The hero's robot, drawn with the 2D canvas: body with two eyes cut out, an
 * antenna, and a flickering thruster. Units are a tenth of its height, y down.
 */
function drawRobot(c: CanvasRenderingContext2D, x: number, y: number, tilt: number, body: string, fireAlpha: number, thrust: number) {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  c.scale(ROBOT / 10, ROBOT / 10);

  c.fillStyle = `rgb(255 158 51 / ${fireAlpha})`;
  c.beginPath();
  c.moveTo(-1.3, 3.5);
  c.lineTo(1.3, 3.5);
  c.lineTo(0, 3.5 + 1.4 + thrust * 1.6);
  c.fill();

  c.fillStyle = body;
  c.beginPath();
  c.roundRect(-3.6, -2.3, 7.2, 5.8, 1.3);
  c.rect(-0.45, -4, 0.9, 1.8);
  c.arc(0, -4.6, 0.95, 0, Math.PI * 2);
  c.fill();

  c.globalCompositeOperation = "destination-out";
  c.beginPath();
  c.arc(-1.35, 0.3, 0.8, 0, Math.PI * 2);
  c.arc(1.35, 0.3, 0.8, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
