"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneStats } from "@/gfx/scene";
import { startAgents } from "@/gfx/agents";
import { profile } from "@/data/profile";

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
        <p className="hero__eyebrow">{profile.roles.join(" · ")}</p>
        <h1 className="hero__name">{profile.name}</h1>
      </div>

      <div className="shell hero__hud" aria-hidden>
        <p className="hud__equation">
          <span className="hud__formula">vᵢ += a·sepᵢ + b·alignᵢ + c·cohᵢ + d·(tₖ − xᵢ)</span>
          <span>{unsupported ? "static preview" : "click to post a task"}</span>
        </p>
        <dl className="hud">
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
