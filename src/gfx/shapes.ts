export type ShapeName = "lattice" | "field" | "sphere" | "torus" | "helix" | "galaxy";

export const SHAPES: ShapeName[] = ["lattice", "field", "sphere", "torus", "helix", "galaxy"];

export const SHAPE_ID: Record<ShapeName, number> = {
  lattice: 0,
  field: 1,
  sphere: 2,
  torus: 3,
  helix: 4,
  galaxy: 5,
};

export const SHAPE_BLURB: Record<ShapeName, string> = {
  lattice: "ordered 150x100 grid, each node a cluster of particles, rippling in depth",
  field: "free curl-noise flow — turbulence only, no attractor",
  sphere: "fibonacci sphere — even distribution, no pole clustering",
  torus: "parametric torus, R=1.35 r=0.52",
  helix: "double helix, two strands, phase-offset by pi",
  galaxy: "logarithmic spiral arms with radial density falloff",
};

/**
 * Per-shape simulation constants. The lattice is held tight and calm so it
 * reads as something engineered; the organic shapes are looser.
 */
export const SHAPE_PHYSICS: Record<
  ShapeName,
  { attract: number; turbulence: number; damping: number }
> = {
  lattice: { attract: 7.5, turbulence: 0.14, damping: 3.4 },
  field: { attract: 0.22, turbulence: 1.5, damping: 0.85 },
  sphere: { attract: 3.8, turbulence: 0.7, damping: 2.1 },
  torus: { attract: 3.8, turbulence: 0.7, damping: 2.1 },
  helix: { attract: 3.8, turbulence: 0.6, damping: 2.1 },
  galaxy: { attract: 2.8, turbulence: 0.8, damping: 1.8 },
};

export function isShape(v: string): v is ShapeName {
  return (SHAPES as string[]).includes(v);
}
