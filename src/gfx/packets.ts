import { MAX_PACKETS, type Grid } from "./field";

type Rgb = [number, number, number];

/** Saturated tints that hold their hue against the dark plane. */
export const PALETTE: Rgb[] = [
  [0.16, 0.48, 1.0], // electric blue
  [0.58, 0.3, 1.0], // violet
  [1.0, 0.24, 0.6], // magenta
  [0.1, 0.92, 0.82], // cyan
  [1.0, 0.62, 0.12], // amber
  [0.3, 1.0, 0.45], // green
];

type Packet = {
  x: number;
  z: number;
  dx: number;
  dz: number;
  /** Nodes per second. */
  speed: number;
  color: Rgb;
  age: number;
  life: number;
  /** Node the packet last crossed, so turns happen once per node. */
  lastNode: number;
};

const AXES: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const TURN_CHANCE = 0.1;
const SPLIT_CHANCE = 0.025;

/**
 * Packets travel the grid lines like signals through a mesh: straight runs,
 * right-angle turns, the odd fork. They live on the CPU — there are only a
 * few dozen — and are uploaded each step as the field's paint sources.
 */
export class PacketSystem {
  private packets: Packet[] = [];
  readonly head = new Float32Array(MAX_PACKETS * 4);
  readonly tint = new Float32Array(MAX_PACKETS * 4);
  private paletteIndex = Math.floor(Math.random() * PALETTE.length);

  constructor(private readonly grid: Grid) {}

  get count() {
    return this.packets.length;
  }

  private nextColor(): Rgb {
    this.paletteIndex = (this.paletteIndex + 1) % PALETTE.length;
    return PALETTE[this.paletteIndex];
  }

  private add(x: number, z: number, [dx, dz]: [number, number], color: Rgb, speed: number, life: number) {
    if (this.packets.length >= MAX_PACKETS) return;
    this.packets.push({
      x: Math.round(x),
      z: Math.round(z),
      dx,
      dz,
      speed,
      color,
      age: 0,
      life,
      lastNode: -1,
    });
  }

  /** One packet in a random axis direction. */
  emit(x: number, z: number) {
    const axis = AXES[Math.floor(Math.random() * 4)];
    this.add(x, z, axis, this.nextColor(), 26 + Math.random() * 14, 2.4 + Math.random() * 1.6);
  }

  /** A burst: one packet per axis, sharing a colour, fanning out from a node. */
  burst(x: number, z: number) {
    const color = this.nextColor();
    for (const axis of AXES) this.add(x, z, axis, color, 32 + Math.random() * 12, 2.8 + Math.random() * 1.4);
  }

  step(dt: number) {
    const { gx, gz } = this.grid;
    const survivors: Packet[] = [];

    for (const p of this.packets) {
      p.age += dt;
      p.x += p.dx * p.speed * dt;
      p.z += p.dz * p.speed * dt;
      if (p.age > p.life || p.x < 0 || p.z < 0 || p.x > gx - 1 || p.z > gz - 1) continue;

      // Decide on turns and forks only as the packet reaches a new node.
      const node = Math.round(p.z) * gx + Math.round(p.x);
      if (node !== p.lastNode) {
        p.lastNode = node;
        if (Math.random() < SPLIT_CHANCE && this.packets.length + survivors.length < MAX_PACKETS) {
          survivors.push({ ...p, dx: -p.dz, dz: p.dx, age: p.age * 0.5, lastNode: node });
        }
        if (Math.random() < TURN_CHANCE) {
          // Snap onto the node before turning so runs stay on the grid lines.
          p.x = Math.round(p.x);
          p.z = Math.round(p.z);
          const left = Math.random() < 0.5;
          [p.dx, p.dz] = left ? [-p.dz, p.dx] : [p.dz, -p.dx];
        }
      }
      survivors.push(p);
    }
    this.packets = survivors.slice(0, MAX_PACKETS);

    this.head.fill(0);
    this.tint.fill(0);
    this.packets.forEach((p, i) => {
      // Ease in at birth and out towards the end of life.
      const strength = Math.min(1, p.age * 6) * Math.min(1, (p.life - p.age) * 1.5);
      this.head.set([p.x, p.z, strength * 1.2, 0], i * 4);
      this.tint.set([...p.color, 0], i * 4);
    });
  }
}
