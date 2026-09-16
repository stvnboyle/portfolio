"use client";

import { useEffect } from "react";

/**
 * Progressive enhancement for otherwise-static markup: scroll reveals and the
 * sticky-nav state. Keeping this in one island lets every section stay a
 * server component.
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

    /* --- sticky nav ------------------------------------------------------- */
    const nav = document.querySelector<HTMLElement>(".nav");
    const onScroll = () => {
      if (nav) nav.dataset.stuck = String(window.scrollY > 24);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      revealObserver?.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
