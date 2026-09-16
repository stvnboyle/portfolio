/**
 * Shared description of the signal field: grid, world extents, camera and
 * simulation constants.
 */

export type Vec3 = [number, number, number];

/** Node counts, plane width in world units, and disc radius. */
export type Grid = { gx: number; gz: number; width: number; pointSize: number };

export const GRID_DESKTOP: Grid = { gx: 240, gz: 160, width: 17, pointSize: 0.026 };
// Portrait screens only see the middle of the plane, so it's narrower and
// denser rather than the same plane with fewer nodes.
export const GRID_MOBILE: Grid = { gx: 120, gz: 160, width: 8, pointSize: 0.021 };

/** World-space depth of the plane. It runs from `NEAR_Z` away from the camera. */
export const DEPTH = 15;
export const NEAR_Z = 3.4;
/** Where the depth of field is sharpest, as a fraction of the depth. */
export const FOCUS = 0.22;

export const CAMERA = {
  position: [0, 1.5, 4.6] as Vec3,
  target: [0, 0.05, -2.2] as Vec3,
  fovDegrees: 48,
};

export const SIM_HZ = 60;
/** Fraction of glow a node keeps per step, and how much bleeds from neighbours. */
export const GLOW_DECAY = 0.968;
export const GLOW_BLEED = 0.025;
/** Packet footprint, in nodes. */
export const PACKET_RADIUS = 0.62;
/** Mirrors the array length in signal-field.wgsl. */
export const MAX_PACKETS = 48;

/* --- picking ------------------------------------------------------------- */

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Where a screen point (NDC) lands on the plane, in grid cells — or null off the plane. */
export function screenToCell(ndcX: number, ndcY: number, aspect: number, grid: Grid) {
  const forward = normalize(sub(CAMERA.target, CAMERA.position));
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const t = Math.tan((CAMERA.fovDegrees * Math.PI) / 360);
  const dir = normalize([
    forward[0] + right[0] * ndcX * t * aspect + up[0] * ndcY * t,
    forward[1] + right[1] * ndcX * t * aspect + up[1] * ndcY * t,
    forward[2] + right[2] * ndcX * t * aspect + up[2] * ndcY * t,
  ]);
  if (dir[1] >= -1e-3) return null;

  const s = -CAMERA.position[1] / dir[1];
  const x = CAMERA.position[0] + dir[0] * s;
  const z = CAMERA.position[2] + dir[2] * s;
  const cx = (x / grid.width + 0.5) * (grid.gx - 1);
  const cz = ((NEAR_Z - z) / DEPTH) * (grid.gz - 1);
  if (cx < 0 || cz < 0 || cx > grid.gx - 1 || cz > grid.gz - 1) return null;
  return { x: cx, z: cz };
}
