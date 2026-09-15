"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for otherwise-static markup: scroll reveals, the
 * cursor-tracked card glow, and the sticky-nav state. Keeping this in one
 * island lets every section stay a server component.
 */
export function Enhancements() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* --- scroll reveal --------------------------------------------------- */
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    let revealObserver: IntersectionObserver | undefined;

    if (reduced) {
      targets.forEach((el) => (el.dataset.reveal = "in"));
    } else {
      revealObserver = new IntersectionObserver(
        (entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const el = entry.target as HTMLElement;
            el.dataset.reveal = "in";
            observer.unobserve(el);
          }
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      targets.forEach((el) => revealObserver!.observe(el));
    }

    /* --- cursor glow on cards -------------------------------------------- */
    const onPointerMove = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.(".card--glow");
      if (!(card instanceof HTMLElement)) return;
      const rect = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
      card.style.setProperty("--my", `${event.clientY - rect.top}px`);
    };
    if (!reduced) {
      document.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    /* --- sticky nav ------------------------------------------------------- */
    const nav = document.querySelector<HTMLElement>(".nav");
    const onScroll = () => {
      if (nav) nav.dataset.stuck = String(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      revealObserver?.disconnect();
      document.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
