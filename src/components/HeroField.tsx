"use client";

import { useEffect, useRef, useState } from "react";
import { FieldEngine } from "@/gfx/engine";
import { setEngine, useFieldEngine } from "@/gfx/store";
import { SHAPES, type ShapeName } from "@/gfx/shapes";

export function HeroField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const surface = surfaceRef.current;
    if (!canvas || !surface) return;

    const engine = new FieldEngine(canvas, surface);
    setEngine(engine);
    void engine.start();

    return () => {
      setEngine(null);
      engine.destroy();
    };
  }, []);

  return (
    <div ref={surfaceRef} className="field">
      <div className="grid-bg" aria-hidden />
      <canvas
        ref={canvasRef}
        className="hero__canvas"
        aria-hidden
        // A still gradient stands in if neither WebGPU nor WebGL2 is available.
        data-fallback="none"
      />
      <div className="hero__veil" aria-hidden />
    </div>
  );
}

/** Shape switcher — makes the field discoverable without using the terminal. */
export function ShapeChips() {
  const { engine, status } = useFieldEngine();
  const [active, setActive] = useState<ShapeName>("triangle");

  useEffect(() => {
    if (status?.shape) setActive(status.shape);
  }, [status?.shape]);

  if (!engine) return null;

  return (
    <div className="chips" role="group" aria-label="Particle field shape">
      <span className="chips__label mono">render</span>
      {SHAPES.map((shape) => (
        <button
          key={shape}
          type="button"
          className="chip mono"
          data-active={active === shape}
          onClick={() => engine.setShape(shape)}
        >
          {shape}
        </button>
      ))}
    </div>
  );
}

/** Live renderer badge: which backend actually won, and how fast it's running. */
export function GpuBadge() {
  const { status } = useFieldEngine();
  if (!status || status.kind === "none") return null;

  return (
    <span className="gpu-badge mono" title={status.adapterLabel}>
      <i className="gpu-badge__dot" />
      {status.kind === "webgpu" ? "WebGPU" : "WebGL2"}
      <span className="gpu-badge__sep">/</span>
      {formatCount(status.count)} particles
      {status.fps > 0 && (
        <>
          <span className="gpu-badge__sep">/</span>
          {status.fps} fps
        </>
      )}
    </span>
  );
}

function formatCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
}
