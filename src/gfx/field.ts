/**
 * Shared description of the wave field: grid, world extents, camera and
 * simulation constants. Both backends and the engine read from here.
 */

export type Vec3 = [number, number, number];

/** Node counts, plane width in world units, and disc radius. */
export type Grid = { gx: number; gz: number; width: number; pointSize: number };

export const GRID_DESKTOP: Grid = { gx: 220, gz: 150, width: 17, pointSize: 0.028 };
// Portrait screens only see the middle of the plane, so it's narrower and
// denser rather than the same plane with fewer nodes.
export const GRID_MOBILE: Grid = { gx: 110, gz: 150, width: 8, pointSize: 0.022 };

/** World-space depth of the plane. It runs from `NEAR_Z` away from the camera. */
export const DEPTH = 15;
export const NEAR_Z = 3.4;

export const CAMERA = {
  eye: [0, 1.7, 4.6] as Vec3,
  target: [0, -0.35, -2.2] as Vec3,
  fovY: (48 * Math.PI) / 180,
};

/** Wave speed² in cells per step² (explicit scheme is stable below 0.5). */
export const WAVE_C2 = 0.24;
export const DAMPING = 0.988;
export const SIM_HZ = 60;
export const MAX_DROPS = 4;

/** A disturbance: grid position, radius (cells), amplitude. */
export type Drop = { x: number; z: number; radius: number; amp: number };

/** View uniforms, as 28 floats: mat4, then three vec4s. */
export const VIEW_FLOATS = 28;

/* --- camera math --------------------------------------------------------- */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export function cameraBasis() {
  const forward = normalize(sub(CAMERA.target, CAMERA.eye));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { forward, right, up };
}

/** Column-major view-projection matrix. */
export function viewProjection(aspect: number): { matrix: Float32Array; p00: number; p11: number } {
  const { forward: f, right: r, up: u } = cameraBasis();
  const e = CAMERA.eye;
  const view = [
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -dot(r, e), -dot(u, e), dot(f, e), 1,
  ];

  const near = 0.1;
  const far = 60;
  const p11 = 1 / Math.tan(CAMERA.fovY / 2);
  const p00 = p11 / aspect;
  // Depth mapped to 0..1, which suits both WebGPU and (unused) GL depth.
  const proj = [
    p00, 0, 0, 0,
    0, p11, 0, 0,
    0, 0, far / (near - far), -1,
    0, 0, (near * far) / (near - far), 0,
  ];

  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let row = 0; row < 4; row++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += proj[k * 4 + row] * view[c * 4 + k];
      out[c * 4 + row] = v;
    }
  }
  return { matrix: out, p00, p11 };
}

/** Where a screen point (NDC) lands on the plane, in grid cells — or null above the horizon. */
export function screenToCell(ndcX: number, ndcY: number, aspect: number, grid: Grid) {
  const { forward, right, up } = cameraBasis();
  const t = Math.tan(CAMERA.fovY / 2);
  const dir = normalize([
    forward[0] + right[0] * ndcX * t * aspect + up[0] * ndcY * t,
    forward[1] + right[1] * ndcX * t * aspect + up[1] * ndcY * t,
    forward[2] + right[2] * ndcX * t * aspect + up[2] * ndcY * t,
  ]);
  if (dir[1] >= -1e-3) return null;
  const s = -CAMERA.eye[1] / dir[1];
  const x = CAMERA.eye[0] + dir[0] * s;
  const z = CAMERA.eye[2] + dir[2] * s;

  const cx = (x / grid.width + 0.5) * (grid.gx - 1);
  const cz = ((NEAR_Z - z) / DEPTH) * (grid.gz - 1);
  if (cx < 0 || cz < 0 || cx > grid.gx - 1 || cz > grid.gz - 1) return null;
  return { x: cx, z: cz };
}
