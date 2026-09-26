"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneStats } from "@/gfx/scene";
import { startAgents } from "@/gfx/agents";
import { profile } from "@/data/profile";
import { WebVitals } from "./WebVitals";
import { Spinner } from "./Spinner";

/** Craig Reynolds' boids, the flocking model the swarm's first three terms come from. */
const BOIDS_URL = "https://www.red3d.com/cwr/boids/";

/** The swarm's stats (gfx/agents.ts), shown as placeholders until its first readout. */
const PENDING_STATS = ["agents", "working", "done"];

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
    // data-intro starts "pending" (the name as an outline); the swarm's intro
    // (gfx/intro.ts) moves it to "etching" and then "done" on the element itself.
    <section className="hero" id="top" ref={heroRef} data-field={field.kind} data-intro="pending">
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
            {/* As agents.wgsl steers them: boids plus an orbit round the nearest task. */}
            v̇ᵢ = a·sepᵢ + b·alignᵢ + c·cohᵢ + d·orbitₖ(xᵢ)
            <span aria-hidden> ↗</span>
          </a>
          <span aria-hidden>{unsupported ? "static preview" : "boids, reynolds ’87 · click to post a task"}</span>
        </p>
        <dl className="hud" aria-hidden>
          <div>
            <dt>runtime</dt>
            <dd>
              {unsupported ? "no webgpu" : field.kind === "starting" ? <Spinner label="probing webgpu" /> : "vgpu · webgpu"}
            </dd>
          </div>
          {status
            ? status.stats.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))
            : !unsupported &&
              PENDING_STATS.map((label) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    <Spinner label="counting" />
                  </dd>
                </div>
              ))}
          <div>
            <dt>frame</dt>
            <dd>{status ? `${status.fps} fps` : unsupported ? "—" : <Spinner label="measuring" />}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
