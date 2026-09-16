"use client";

import { useEffect, useRef, useState } from "react";
import { WaveField, type FieldStatus } from "@/gfx/engine";
import { profile } from "@/data/profile";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<FieldStatus | null>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!hero || !canvas) return;

    const field = new WaveField(canvas, hero);
    const off = field.onStatus(setStatus);
    void field.start();
    return () => {
      off();
      field.destroy();
    };
  }, []);

  return (
    <section className="hero" id="top" ref={heroRef}>
      <canvas ref={canvasRef} className="hero__canvas" aria-hidden />

      <div className="shell hero__inner">
        <p className="hero__eyebrow mono">{profile.roles.join(" · ")}</p>
        <h1 className="hero__name">{profile.name}</h1>
        <p className="hero__tagline">
          Tech lead &amp; engineering manager at hedgehog lab, and founder of{" "}
          <a className="link" href={profile.links.gitgood} target="_blank" rel="noreferrer">
            gitgood.io
          </a>
          . Based in Newcastle.
        </p>
      </div>

      <div className="shell hero__spec mono" aria-hidden>
        <span>∂²h/∂t² = c²∇²h</span>
        <span data-live={status ? true : undefined}>
          {status
            ? `${status.backend === "webgpu" ? "webgpu compute" : "webgl2 · cpu sim"} · ${status.nodes.toLocaleString("en-GB")} nodes · ${status.fps} fps`
            : "move to disturb · click to drop"}
        </span>
      </div>
    </section>
  );
}
