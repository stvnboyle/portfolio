"use client";

import { useEffect, useRef, useState } from "react";
import type { LabStats } from "@/gfx/lab/robots3d";
import { profile } from "@/data/profile";
import { Spinner } from "./Spinner";

/** POC hero: three.js WebGPU robots. Loaded on demand, so three stays out of the main page's bundle. */
export function LabRobots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stats, setStats] = useState<LabStats | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    void import("@/gfx/lab/robots3d").then(({ startRobots3D }) => {
      if (!cancelled) stop = startRobots3D(canvas, setStats);
    });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  return (
    <section className="hero lab-hero">
      <canvas ref={canvasRef} className="lab-hero__canvas" aria-hidden />
      <div className="shell hero__inner">
        <p className="hero__eyebrow">{profile.roles.join(" · ")}</p>
        <h1 className="hero__name lab-hero__name">{profile.name}</h1>
      </div>
      <div className="shell hero__hud">
        <p className="hud__equation">
          <span>poc · three.js r187 · WebGPURenderer · TSL · PBR + bloom</span>
          <span aria-hidden>click to post a task</span>
        </p>
        <dl className="hud" aria-hidden>
          <div data-stat="runtime">
            <dt>runtime</dt>
            <dd>{stats ? `three · ${stats.backend}` : <Spinner label="probing" />}</dd>
          </div>
          <div data-stat="count">
            <dt>robots</dt>
            <dd>{stats?.robots ?? <Spinner label="" />}</dd>
          </div>
          <div data-stat="count">
            <dt>tasks</dt>
            <dd>{stats?.tasks ?? <Spinner label="" />}</dd>
          </div>
          <div data-stat="frame">
            <dt>frame</dt>
            <dd>{stats ? `${stats.fps} fps` : <Spinner label="fps" />}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
