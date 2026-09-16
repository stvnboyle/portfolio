"use client";

import { useEffect, useRef, useState } from "react";
import { startWaveField, type FieldStatus } from "@/gfx/engine";
import { profile } from "@/data/profile";

type FieldState = { kind: "starting" } | { kind: "live"; status: FieldStatus | null } | { kind: "unsupported" };

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [field, setField] = useState<FieldState>({ kind: "starting" });

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!hero || !canvas) return;

    return startWaveField(canvas, hero, {
      onLive: () => setField({ kind: "live", status: null }),
      onStatus: (status) => setField({ kind: "live", status }),
      onUnsupported: (reason) => {
        console.info(`[wave-field] falling back to a static preview: ${reason}`);
        setField({ kind: "unsupported" });
      },
    });
  }, []);

  const status = field.kind === "live" ? field.status : null;

  return (
    <section className="hero" id="top" ref={heroRef} data-field={field.kind}>
      <canvas ref={canvasRef} className="hero__canvas" aria-hidden />

      <div className="shell hero__inner">
        <p className="hero__eyebrow">{profile.roles.join(" · ")}</p>
        <h1 className="hero__name">{profile.name}</h1>
        <p className="hero__tagline">
          Tech lead &amp; engineering manager at hedgehog lab, and founder of{" "}
          <a className="link" href={profile.links.gitgood} target="_blank" rel="noreferrer">
            gitgood.io
          </a>
          . Based in Newcastle.
        </p>
      </div>

      <div className="shell hero__hud" aria-hidden>
        <p className="hud__equation">
          ∂²h/∂t² = c²∇²h
          <span>{field.kind === "unsupported" ? "static preview" : "click the surface"}</span>
        </p>
        <dl className="hud">
          <div>
            <dt>runtime</dt>
            <dd>{field.kind === "unsupported" ? "no webgpu" : "vgpu · webgpu"}</dd>
          </div>
          <div>
            <dt>nodes</dt>
            <dd>{status ? status.nodes.toLocaleString("en-GB") : "—"}</dd>
          </div>
          <div>
            <dt>frame</dt>
            <dd>{status ? `${status.fps} fps` : "—"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
