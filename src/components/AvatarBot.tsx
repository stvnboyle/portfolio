"use client";

import { useEffect, useRef } from "react";
import { drawRobot } from "@/gfx/strays";

/** The four glow colours, magenta through cyan. Mirrors --glow-1..4 in globals.css. */
const COLOURS: Array<[number, number, number]> = [
  [1.0, 0.24, 0.6],
  [0.58, 0.31, 1.0],
  [0.16, 0.48, 1.0],
  [0.1, 0.92, 0.82],
];
/** Space around the photo the robot flies through, in px. */
const MARGIN = 34;

/**
 * One of the hero's robots, flying loops around the avatar: a wobbling orbit
 * with a gentle bob, leaning into its turns and cycling through the heading
 * colours. The same path every visit.
 */
export function AvatarBot() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    let visible = false;
    let t = 0;
    let last = 0;

    const place = (time: number) => {
      const size = canvas.clientWidth;
      const radius = size / 2 - MARGIN + 16;
      const angle = time * 0.42 + 0.35 * Math.sin(time * 0.7) - Math.PI / 2;
      const r = radius + 9 * Math.sin(time * 1.3);
      return [size / 2 + r * Math.cos(angle), size / 2 + r * Math.sin(angle) * 0.94 + 2.5 * Math.sin(time * 3.1)];
    };

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const size = canvas.clientWidth;
      if (canvas.width !== Math.round(size * dpr)) canvas.width = canvas.height = Math.round(size * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, size, size);

      const [x, y] = place(t);
      const [nx, ny] = place(t + 0.05);
      // Hold each colour, then blend quickly into the next: a flash, not a fade.
      const phase = (t / 1.3) % COLOURS.length;
      const i = Math.floor(phase);
      const blend = Math.min(1, Math.max(0, (phase - i - 0.8) / 0.2));
      const a = COLOURS[i];
      const b = COLOURS[(i + 1) % COLOURS.length];
      const tint = a.map((v, k) => v + (b[k] - v) * blend) as [number, number, number];

      context.shadowColor = `rgb(${tint.map((v) => Math.round(v * 255)).join(" ")} / 0.7)`;
      context.shadowBlur = 10;
      drawRobot(context, x, y, {
        vx: (nx - x) / 0.05,
        vy: (ny - y) / 0.05,
        tint,
        weight: 1,
        alpha: 1,
        time: t,
        seed: 0,
        size: 22,
      });
    };

    const tick = (now: number) => {
      t += Math.min((now - last) / 1000, 0.1);
      last = now;
      draw();
      frame = visible && !calm ? requestAnimationFrame(tick) : 0;
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !frame && !calm) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    });
    observer.observe(canvas);
    draw();

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className="about__bot" aria-hidden />;
}
