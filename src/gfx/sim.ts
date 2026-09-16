import { DAMPING, WAVE_C2, type Drop, type Grid } from "./field";

/** CPU twin of the WGSL `step` kernel, for the WebGL2 path. */
export class WaveSim {
  current: Float32Array<ArrayBuffer>;
  private previous: Float32Array<ArrayBuffer>;

  constructor(private readonly grid: Grid) {
    this.current = new Float32Array(grid.gx * grid.gz);
    this.previous = new Float32Array(grid.gx * grid.gz);
  }

  step(drops: Drop[]) {
    const { gx, gz } = this.grid;
    const cur = this.current;
    const prev = this.previous;

    for (let z = 0; z < gz; z++) {
      const row = z * gx;
      const down = Math.max(z - 1, 0) * gx;
      const up = Math.min(z + 1, gz - 1) * gx;
      for (let x = 0; x < gx; x++) {
        const i = row + x;
        const lap =
          cur[row + Math.max(x - 1, 0)] +
          cur[row + Math.min(x + 1, gx - 1)] +
          cur[down + x] +
          cur[up + x] -
          4 * cur[i];
        let next = (2 * cur[i] - prev[i] + WAVE_C2 * lap) * DAMPING;
        for (const d of drops) {
          const dx = x - d.x;
          const dz = z - d.z;
          next += d.amp * Math.exp(-(dx * dx + dz * dz) / (d.radius * d.radius));
        }
        prev[i] = next;
      }
    }

    this.previous = cur;
    this.current = prev;
  }
}
