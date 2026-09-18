"use client";

import { useEffect } from "react";

const SELECTOR = ".hero__name, .section__title";
/** Seconds for a lit letter to settle back. */
const SETTLE = 0.9;

type Glyph = { el: HTMLElement; heat: number };

/**
 * Wraps each non-space character under `root` in its own span, keeping any
 * child elements. Letters are grouped into unbreakable words, since each
 * letter is its own inline block and lines could otherwise break mid-word.
 */
function split(root: Element, glyphs: Glyph[]) {
  for (const node of [...root.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      split(node as Element, glyphs);
      continue;
    }
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent) continue;
    const fragment = document.createDocumentFragment();
    for (const part of node.textContent.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        continue;
      }
      const word = document.createElement("span");
      word.className = "glow-word";
      for (const char of part) {
        const span = document.createElement("span");
        span.dataset.g = "";
        span.textContent = char;
        word.append(span);
        glyphs.push({ el: span, heat: 0 });
      }
      fragment.append(word);
    }
    node.replaceWith(fragment);
  }
}

/** The four glow colours, magenta through cyan. Mirrors --glow-1..4 in globals.css. */
const GLOW = [
  [255, 61, 153],
  [148, 80, 255],
  [42, 122, 255],
  [26, 235, 209],
];

/** A colour along the magenta → violet → blue → cyan ramp, t in 0..1. */
function glowAt(t: number) {
  const x = Math.min(0.999, Math.max(0, t)) * (GLOW.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  return `rgb(${GLOW[i].map((v, k) => Math.round(v + (GLOW[i + 1][k] - v) * f)).join(" ")})`;
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

    // Each letter's colour is fixed by where it sits in its heading, so it's the same every visit.
    for (const { glyphs } of headings) {
      glyphs.forEach((g, i) => g.el.style.setProperty("--glow", glowAt(i / Math.max(1, glyphs.length - 1))));
    }

    let pointer: { x: number; y: number; heading: (typeof headings)[number] } | null = null;
    let frame = 0;
    let last = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      let active = Boolean(pointer);
      for (const heading of headings) {
        const size = parseFloat(getComputedStyle(heading.el).fontSize) || 16;
        const reach = size * 1.5;
        for (const g of heading.glyphs) {
          let heat = g.heat * Math.exp(-dt / (SETTLE / 3));
          if (pointer && pointer.heading === heading) {
            const r = g.el.getBoundingClientRect();
            const d = Math.hypot(r.left + r.width / 2 - pointer.x, r.top + r.height / 2 - pointer.y);
            const near = Math.max(0, 1 - d / reach);
            heat = Math.max(heat, near * near * (3 - 2 * near));
          }
          if (Math.abs(heat - g.heat) > 0.002 || (heat < 0.002 && g.heat > 0)) {
            g.heat = heat < 0.002 ? 0 : heat;
            g.el.style.setProperty("--heat", g.heat.toFixed(3));
            // Colour arrives almost at once; the glow and lift follow the heat.
            g.el.style.setProperty("--mix", Math.min(1, g.heat * 2.5).toFixed(3));
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
      const onMove = (e: PointerEvent) => {
        pointer = { x: e.clientX, y: e.clientY, heading };
        wake();
      };
      const onLeave = () => (pointer = null);
      heading.el.addEventListener("pointermove", onMove, { passive: true });
      heading.el.addEventListener("pointerleave", onLeave);
      return () => {
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
