"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneStats, StartScene } from "@/gfx/scene";
import { startSignalField } from "@/gfx/signal";
import { startAgents } from "@/gfx/agents";
import { SCENES, SCENE_EVENT, type SceneId } from "@/data/scenes";
import { profile } from "@/data/profile";

type FieldState = { kind: "starting" } | { kind: "live"; status: SceneStats | null } | { kind: "unsupported" };

const START: Record<SceneId, StartScene> = {
  signal: startSignalField,
  agents: startAgents,
};

/** What each scene computes, as it's actually implemented. */
const EQUATIONS: Record<SceneId, React.ReactNode> = {
  signal: (
    <>
      gₜ₊₁ = γ(gₜ + κ∇²gₜ) + Σₖ sₖ·e<sup>−|x−pₖ|²/r²</sup>
    </>
  ),
  agents: <>vᵢ += a·sepᵢ + b·alignᵢ + c·cohᵢ + d·(tₖ − xᵢ)</>,
};

const STORAGE_KEY = "hero-scene";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [field, setField] = useState<FieldState>({ kind: "starting" });
  const [index, setIndex] = useState(0);
  const scene = SCENES[index];

  // Remember the last scene per viewer, and let the ⌘K menu switch it.
  useEffect(() => {
    try {
      const saved = SCENES.findIndex((s) => s.id === localStorage.getItem(STORAGE_KEY));
      if (saved > 0) setIndex(saved);
    } catch {}
    const onScene = (e: Event) => {
      const i = SCENES.findIndex((s) => s.id === (e as CustomEvent<string>).detail);
      if (i >= 0) select(i);
    };
    window.addEventListener(SCENE_EVENT, onScene);
    return () => window.removeEventListener(SCENE_EVENT, onScene);
  }, []);

  const select = (i: number) => {
    const next = (i + SCENES.length) % SCENES.length;
    setIndex(next);
    try {
      localStorage.setItem(STORAGE_KEY, SCENES[next].id);
    } catch {}
  };

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    if (!hero || !canvas) return;

    setField((f) => (f.kind === "unsupported" ? f : { kind: "starting" }));
    return START[scene.id](canvas, hero, {
      onLive: () => setField({ kind: "live", status: null }),
      onStatus: (status) => setField({ kind: "live", status }),
      onUnsupported: (reason) => {
        console.info(`[hero] falling back to a static preview: ${reason}`);
        setField({ kind: "unsupported" });
      },
    });
  }, [scene.id]);

  const unsupported = field.kind === "unsupported";
  const status = field.kind === "live" ? field.status : null;

  return (
    <section className="hero" id="top" ref={heroRef} data-field={field.kind}>
      {/* A fresh canvas per scene, so each one gets a clean context. */}
      <canvas key={scene.id} ref={canvasRef} className="hero__canvas" aria-hidden />
      {/* Scenes can pin small labels over the canvas here. */}
      <div className="hero__overlay" aria-hidden />

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

      <div className="shell hero__hud">
        <div className="hud__equation">
          {!unsupported && (
            <div className="hud__scenes">
              <button type="button" onClick={() => select(index - 1)} aria-label="Previous scene">
                ‹
              </button>
              <span aria-live="polite">
                {String(index + 1).padStart(2, "0")}/{String(SCENES.length).padStart(2, "0")} {scene.name}
              </span>
              <button type="button" onClick={() => select(index + 1)} aria-label="Next scene">
                ›
              </button>
            </div>
          )}
          <span className="hud__formula" aria-hidden>
            {EQUATIONS[scene.id]}
          </span>
          <span aria-hidden>{unsupported ? "static preview" : scene.hint}</span>
        </div>
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
