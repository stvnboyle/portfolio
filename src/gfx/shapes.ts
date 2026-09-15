export type ShapeName =
  | "field"
  | "triangle"
  | "sphere"
  | "torus"
  | "wave"
  | "helix"
  | "galaxy";

export const SHAPES: ShapeName[] = [
  "field",
  "triangle",
  "sphere",
  "torus",
  "wave",
  "helix",
  "galaxy",
];

export const SHAPE_ID: Record<ShapeName, number> = {
  field: 0,
  triangle: 1,
  sphere: 2,
  torus: 3,
  wave: 4,
  helix: 5,
  galaxy: 6,
};

export const SHAPE_BLURB: Record<ShapeName, string> = {
  field: "free curl-noise flow field — particles obey turbulence only",
  triangle: "the mark. uniform-area triangle sampling, weighted to the edges",
  sphere: "fibonacci sphere — even distribution, no pole clustering",
  torus: "parametric torus, R=1.35 r=0.52",
  wave: "displaced grid plane, travelling sine interference",
  helix: "double helix, two strands, phase-offset by π",
  galaxy: "logarithmic spiral arms with radial density falloff",
};

export function isShape(v: string): v is ShapeName {
  return (SHAPES as string[]).includes(v);
}
