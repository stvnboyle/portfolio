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
    if (!canvas) return;

    // Track the pointer across the whole hero, not just the canvas layer —
    // the canvas sits behind the copy, so it would otherwise miss most moves.
    const surface = canvas.closest<HTMLElement>(".hero") ?? surfaceRef.current;
    if (!surface) return;

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
      <canvas ref={canvasRef} className="hero__canvas" aria-hidden data-fallback="none" />
      <div className="hero__veil" aria-hidden />
    </div>
  );
}

/**
 * Live telemetry from the renderer, presented as a debug overlay. Everything
 * in it is read from the running simulation, not hardcoded.
 */
export function RendererHud() {
  const { engine, status } = useFieldEngine();
  const [shape, setShape] = useState<ShapeName>("lattice");

  useEffect(() => {
    if (status?.shape) setShape(status.shape);
  }, [status?.shape]);

  const offline = !status || status.kind === "none";

  return (
    <div className="hud mono">
      <div className="hud__bar">
        <span className="hud__title">renderer</span>
        <span className="hud__state" data-live={!offline}>
          {offline ? "offline" : "live"}
        </span>
      </div>

      <dl className="hud__rows">
        <Row
          k="backend"
          v={
            offline
              ? "css fallback"
              : status.kind === "webgpu"
                ? "webgpu · compute"
                : "webgl2 · feedback"
          }
        />
        <Row k="device" v={offline ? "—" : status.adapterLabel.toLowerCase()} />
        <Row k="particles" v={offline ? "—" : status.count.toLocaleString("en-GB")} />
        <Row
          k="frame"
          v={offline || !status.fps ? "—" : `${status.fps} fps`}
          accent={!offline && status.fps >= 55}
        />
        <Row k="shape" v={shape} />
      </dl>

      <div className="hud__shapes">
        {SHAPES.map((s) => (
          <button
            key={s}
            type="button"
            className="hud__shape"
            data-active={shape === s}
            onClick={() => engine?.setShape(s)}
            disabled={offline}
          >
            {s}
          </button>
        ))}
      </div>

      <p className="hud__hint">move the cursor through it · click to disturb</p>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="hud__row">
      <dt>{k}</dt>
      <dd data-accent={accent}>{v}</dd>
    </div>
  );
}
