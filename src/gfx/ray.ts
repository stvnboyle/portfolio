import type { Rgb } from "./palette";

/** The flare's radius at the ray's head, px. */
const FLARE = 10;
/**
 * How far behind a riding robot's centre the ray should end, as a share of its
 * height: at its thrusters, so the beam trails out of it rather than lighting
 * up its body.
 */
export const RIDE_BEHIND = 0.45;

const rgba = (c: Rgb, a: number) => `rgb(${c.map((v) => Math.round(v * 255)).join(" ")} / ${a})`;

/**
 * A light ray along a progress line, drawn on a 2D canvas: a thin beam that
 * warms from `from` at its tail to `to` at its head, a soft glow around it,
 * a white-hot core towards the head, and a flare where it ends. The robot
 * riding it is drawn by the caller, on top and just ahead (see RIDE_BEHIND).
 */
export function drawRay(c: CanvasRenderingContext2D, x0: number, x1: number, y: number, from: Rgb, to: Rgb, alpha: number) {
  const length = x1 - x0;
  if (length < 1 || alpha <= 0.002) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  c.lineCap = "round";

  const beam = (width: number, strength: number) => {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, rgba(from, 0));
    g.addColorStop(0.55, rgba(from, 0.45 * strength));
    g.addColorStop(0.9, rgba(to, 0.9 * strength));
    g.addColorStop(1, rgba(to, strength));
    c.strokeStyle = g;
    c.lineWidth = width;
    c.beginPath();
    c.moveTo(x0, y);
    c.lineTo(x1, y);
    c.stroke();
  };
  c.globalAlpha = alpha;
  // Glow, then the beam itself.
  beam(7, 0.18);
  beam(3, 0.4);
  beam(1.2, 1);

  // A white-hot core over the last stretch.
  const coreFrom = Math.max(x0, x1 - Math.min(160, length * 0.5));
  const core = c.createLinearGradient(coreFrom, 0, x1, 0);
  core.addColorStop(0, "rgb(255 255 255 / 0)");
  core.addColorStop(1, "rgb(255 255 255 / 0.95)");
  c.strokeStyle = core;
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(coreFrom, y);
  c.lineTo(x1, y);
  c.stroke();

  // The flare at the head: tight, so a robot riding just ahead of it stays crisp.
  const flare = c.createRadialGradient(x1, y, 0, x1, y, FLARE);
  flare.addColorStop(0, "rgb(255 255 255 / 0.8)");
  flare.addColorStop(0.22, rgba(to, 0.5));
  flare.addColorStop(1, rgba(to, 0));
  c.fillStyle = flare;
  c.beginPath();
  c.arc(x1, y, FLARE, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

/** Sizes a canvas's backing store to its CSS size at the device's pixel ratio (up to 3x), and clears it. */
export function fitCanvas(canvas: HTMLCanvasElement, c: CanvasRenderingContext2D) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const [width, height] = [canvas.clientWidth, canvas.clientHeight];
  if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
  if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, width, height);
  return [width, height] as const;
}
