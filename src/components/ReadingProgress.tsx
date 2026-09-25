"use client";

import { useEffect, useRef } from "react";
import { drawRobot } from "@/gfx/strays";
import type { Rgb } from "@/gfx/palette";

const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;

/**
 * A reading-progress line under the post bar, with one of the hero's robots
 * flying along its leading edge: it leans forward as you read on, back as
 * you scroll up, and hovers when you stop.
 */
export function ReadingProgress({ tone }: { tone: string }) {
  const barRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const body = document.querySelector<HTMLElement>(".prose");
    if (!bar || !canvas || !context || !body) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tint = hexToRgb(tone);

    // How far through the body the reader is: 0 at its top, 1 once its end is in view.
    const progress = () => {
      const r = body.getBoundingClientRect();
      const span = r.height - window.innerHeight * 0.6;
      return Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / Math.max(1, span)));
    };

    let shown = progress();
    let velocity = 0;
    let t = 0;
    let last = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      t += dt;
      const target = progress();
      const step = (target - shown) * (1 - Math.exp(-dt * 8));
      shown += step;
      const width = canvas.clientWidth;
      // px/s along the bar, eased so the lean settles when reading stops.
      velocity += ((step * width) / Math.max(dt, 1e-3) - velocity) * (1 - Math.exp(-dt * 6));

      bar.style.transform = `scaleX(${shown})`;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr)) canvas.width = Math.round(width * dpr);
      if (canvas.height !== Math.round(height * dpr)) canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const x = 12 + shown * (width - 24);
      drawRobot(context, x, height / 2 + 1.5 * Math.sin(t * 2.4), {
        vx: Math.max(-90, Math.min(90, velocity)) + 8,
        vy: 0,
        tint,
        weight: 1,
        alpha: 1,
        time: t,
        seed: 0,
        size: 14,
      });
      frame = requestAnimationFrame(tick);
    };

    if (calm) {
      const still = () => {
        shown = progress();
        bar.style.transform = `scaleX(${shown})`;
      };
      still();
      window.addEventListener("scroll", still, { passive: true });
      return () => window.removeEventListener("scroll", still);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tone]);

  return (
    <div className="progress" aria-hidden>
      <div className="progress__bar" ref={barRef} />
      <canvas className="progress__bot" ref={canvasRef} />
    </div>
  );
}
