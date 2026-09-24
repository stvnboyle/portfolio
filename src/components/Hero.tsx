"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneStats } from "@/gfx/scene";
import { startAgents } from "@/gfx/agents";
import { profile } from "@/data/profile";
import { WebVitals } from "./WebVitals";

/** Craig Reynolds' boids, the flocking model the swarm's first three terms come from. */
const BOIDS_URL = "https://www.red3d.com/cwr/boids/";

type FieldState = { kind: "starting" } | { kind: "live"; status: SceneStats | null } | { kind: "unsupported" };

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [field, setField] = useState<FieldState>({ kind: "starting" });

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!hero || !canvas) return;

    return startAgents(canvas, hero, {
      onLive: () => setField({ kind: "live", status: null }),
      onStatus: (status) => setField({ kind: "live", status }),
      onUnsupported: (reason) => {
        console.info(`[hero] falling back to a static preview: ${reason}`);
        setField({ kind: "unsupported" });
      },
    });
  }, []);

  const unsupported = field.kind === "unsupported";
  const status = field.kind === "live" ? field.status : null;

  return (
    <section className="hero" id="top" ref={heroRef} data-field={field.kind}>
      <canvas ref={canvasRef} className="hero__canvas" aria-hidden />
      {/* Task labels are pinned over the canvas here. */}
      <div className="hero__overlay" aria-hidden />

      <div className="shell hero__inner">
        <WebVitals />
        <p className="hero__eyebrow">{profile.roles.join(" · ")}</p>
        <h1 className="hero__name">{profile.name}</h1>
      </div>

      <div className="shell hero__hud">
        <p className="hud__equation">
          <a
            className="hud__formula"
            href={BOIDS_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Boids, Craig Reynolds' flocking model (opens in a new tab)"
          >
            vᵢ += a·sepᵢ + b·alignᵢ + c·cohᵢ + d·(tₖ − xᵢ)
            <span aria-hidden> ↗</span>
          </a>
          <span aria-hidden>{unsupported ? "static preview" : "boids, reynolds ’87 · click to post a task"}</span>
        </p>
        <dl className="hud" aria-hidden>
          <div>
            <dt>runtime</dt>
            <dd>{unsupported ? "no webgpu" : "vgpu · webgpu"}</dd>
          </div>
          {(status?.stats ?? []).map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <div>
            <dt>frame</dt>
            <dd>{status ? `${status.fps} fps` : "—"}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
