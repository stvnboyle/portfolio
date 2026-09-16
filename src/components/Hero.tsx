"use client";

import { useEffect, useRef, useState } from "react";
import { LightField, type FieldStatus } from "@/gfx/engine";
import { EMITTERS, PROBE, srgbToCss, wavelengthToSrgb } from "@/gfx/emitters";
import { profile } from "@/data/profile";

const MARKERS = [
  ...EMITTERS.map((e) => ({ id: e.id, label: `${e.nm} nm`, color: srgbToCss(wavelengthToSrgb(e.nm)) })),
  { id: PROBE.id, label: PROBE.label, color: srgbToCss(PROBE.srgb) },
];

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);
  const markerRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [status, setStatus] = useState<FieldStatus | null>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    const name = nameRef.current;
    if (!hero || !canvas || !name) return;

    const field = new LightField(canvas, hero, name);
    const offStatus = field.onStatus(setStatus);

    // Markers are moved straight on the DOM every frame; only the readings
    // are throttled, since text changes cost layout.
    let tick = 0;
    const offFrame = field.onFrame((emitters) => {
      const writeText = tick++ % 8 === 0;
      emitters.forEach((e, i) => {
        const el = markerRefs.current[i];
        if (!el) return;
        el.style.transform = `translate3d(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px, 0)`;
        el.style.opacity = String(e.presence * (0.35 + 0.65 * e.transmittance));
        if (writeText) {
          const reading = el.querySelector<HTMLElement>("[data-reading]");
          if (reading) {
            reading.textContent =
              e.id === PROBE.id
                ? `${e.u.toFixed(3)}, ${e.v.toFixed(3)}`
                : `T ${e.transmittance.toFixed(2)}`;
          }
        }
      });
    });

    void field.start();
    return () => {
      offStatus();
      offFrame();
      field.destroy();
    };
  }, []);

  const live = status && status.backend !== "none";

  return (
    <section className="hero" id="top" ref={heroRef}>
      <canvas ref={canvasRef} className="hero__canvas" aria-hidden />

      <div className="hero__markers" aria-hidden>
        {MARKERS.map((m, i) => (
          <div
            key={m.id}
            className="marker"
            data-probe={m.id === PROBE.id || undefined}
            ref={(el) => {
              markerRefs.current[i] = el;
            }}
            style={{ "--marker": m.color } as React.CSSProperties}
          >
            <i className="marker__cross" />
            <span className="marker__label mono">
              <b>{m.id}</b> {m.label}
              <span className="marker__reading" data-reading />
            </span>
          </div>
        ))}
      </div>

      <div className="hero__frame" aria-hidden>
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="hero__inner">
        <p className="hero__meta mono">
          <span>Fig. 01 — Light transport through a name</span>
          <span>54.97° N, 1.61° W</span>
        </p>

        <h1 className="hero__name" ref={nameRef}>
          <span className="hero__word">Steven</span> <span className="hero__word">Boyle</span>
        </h1>

        <div className="hero__foot">
          <p className="hero__tagline">
            {profile.roles[0]} &amp; {profile.roles[1].toLowerCase()} at{" "}
            <strong>hedgehog lab</strong>. Founder of{" "}
            <a className="link" href={profile.links.gitgood} target="_blank" rel="noreferrer">
              gitgood.io
            </a>
            . I build platforms, and the teams that ship them.
          </p>

          <dl className="readout mono" data-live={live || undefined}>
            <div>
              <dt>pipeline</dt>
              <dd>
                {live
                  ? `${status.backend === "webgpu" ? "webgpu · wgsl" : "webgl2 · glsl"} · 2 pass`
                  : "static"}
              </dd>
            </div>
            <div>
              <dt>emitters</dt>
              <dd>{live ? `${status.emitters} · ${status.samples} samples/ray` : "—"}</dd>
            </div>
            <div>
              <dt>scatter</dt>
              <dd>{live ? `${status.scatter[0]}×${status.scatter[1]}` : "—"}</dd>
            </div>
            <div>
              <dt>frame</dt>
              <dd>{live && status.fps ? `${status.fps} fps` : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
