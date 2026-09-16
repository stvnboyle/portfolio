"use client";

import { useEffect, useRef } from "react";
import { LightField } from "@/gfx/engine";
import { profile } from "@/data/profile";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nameRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const hero = heroRef.current;
    const canvas = canvasRef.current;
    const name = nameRef.current;
    if (!hero || !canvas || !name) return;

    const field = new LightField(canvas, hero, name);
    void field.start();
    return () => field.destroy();
  }, []);

  return (
    <section className="hero" id="top" ref={heroRef}>
      <canvas ref={canvasRef} className="hero__canvas" aria-hidden />

      <div className="shell hero__inner">
        <h1 className="hero__name" ref={nameRef}>
          {profile.name}
        </h1>
        <p className="hero__tagline">
          Tech lead &amp; engineering manager at hedgehog lab, and founder of{" "}
          <a className="link" href={profile.links.gitgood} target="_blank" rel="noreferrer">
            gitgood.io
          </a>
          . Based in Newcastle.
        </p>
      </div>
    </section>
  );
}
