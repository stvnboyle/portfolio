"use client";

import { useEffect } from "react";
import { PALETTE } from "@/gfx/packets";

const SELECTOR = ".hero__name, .section__title";
/** Seconds for a lit letter to settle back. */
const SETTLE = 0.9;

type Glyph = { el: HTMLElement; heat: number; index: number };

/** Wraps each non-space character under `root` in its own span, keeping any child elements. */
function split(root: Element, glyphs: Glyph[]) {
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      split(node as Element, glyphs);
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent) continue;
    const fragment = document.createDocumentFragment();
    for (const char of node.textContent) {
      if (/\s/.test(char)) {
        fragment.append(char);
        continue;
      }
      const span = document.createElement("span");
      span.dataset.g = "";
      span.textContent = char;
      fragment.append(span);
      glyphs.push({ el: span, heat: 0, index: glyphs.length });
    }
    node.replaceWith(fragment);
  }
}

/** A colour along the palette, blended between neighbouring entries. */
function paletteAt(t: number) {
  const n = PALETTE.length;
  const i = Math.floor(t) % n;
  const f = t - Math.floor(t);
  const [a, b] = [PALETTE[i], PALETTE[(i + 1) % n]];
  return `rgb(${a.map((v, k) => Math.round(Math.min(1, (v + (b[k] - v) * f) * 1.1) * 255)).join(" ")})`;
}

/**
 * Makes the name and section headings glow under the pointer: letters near it
 * light up in the same vivid colours the agents take on while they work, then
 * settle back once the pointer moves on.
 */
export function GlowHeadings() {
  useEffect(() => {
    const headings = [...document.querySelectorAll(SELECTOR)].map((el) => {
      const glyphs: Glyph[] = [];
      split(el, glyphs);
      return { el: el as HTMLElement, glyphs };
    });

    let pointer: { x: number; y: number; heading: (typeof headings)[number] } | null = null;
    let hue = Math.random() * PALETTE.length;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      let active = Boolean(pointer);
      for (const heading of headings) {
        const size = parseFloat(getComputedStyle(heading.el).fontSize) || 16;
        const reach = size * 1.8;
        for (const g of heading.glyphs) {
          let heat = g.heat * Math.exp(-dt / (SETTLE / 3));
          if (pointer && pointer.heading === heading) {
            const r = g.el.getBoundingClientRect();
            const d = Math.hypot(r.left + r.width / 2 - pointer.x, r.top + r.height / 2 - pointer.y);
            const near = Math.max(0, 1 - d / reach);
            heat = Math.max(heat, near * near * (3 - 2 * near));
          }
          // Colour is chosen as a letter lights up, and kept while it glows.
          if (g.heat < 0.02 && heat >= 0.02) g.el.style.setProperty("--glow", paletteAt(hue + g.index * 0.12));
          if (Math.abs(heat - g.heat) > 0.002 || (heat < 0.002 && g.heat > 0)) {
            g.heat = heat < 0.002 ? 0 : heat;
            g.el.style.setProperty("--heat", g.heat.toFixed(3));
          }
          if (g.heat > 0) active = true;
        }
      }
      frame = active ? requestAnimationFrame(tick) : 0;
    };
    const wake = () => {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    };

    const cleanups = headings.map((heading) => {
      const onEnter = () => (hue += 1.3);
      const onMove = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY, heading };
        wake();
      };
      const onLeave = () => (pointer = null);
      heading.el.addEventListener("pointerenter", onEnter);
      heading.el.addEventListener("pointermove", onMove, { passive: true });
      heading.el.addEventListener("pointerleave", onLeave);
      return () => {
        heading.el.removeEventListener("pointerenter", onEnter);
        heading.el.removeEventListener("pointermove", onMove);
        heading.el.removeEventListener("pointerleave", onLeave);
      };
    });

    return () => {
      cancelAnimationFrame(frame);
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
