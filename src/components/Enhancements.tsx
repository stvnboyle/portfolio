"use client";

import { useEffect } from "react";
import { decode, isSeeking, seekOnClick, setSection } from "@/lib/seek";

/**
 * Progressive enhancement for otherwise-static markup: section headings that
 * decode in as they scroll into view, the sticky-nav state, in-page seeks and
 * the nav breadcrumb. Keeping this in one island lets every section stay a
 * server component.
 */
export function Enhancements() {
  useEffect(() => {
    /* --- always start at the top ------------------------------------------ */
    // Coming back from a post (cd .., or the back button) or reloading starts from the hero, not the old scroll.
    history.scrollRestoration = "manual";
    if (!location.hash) window.scrollTo(0, 0);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.scrollTo(0, 0);
    };
    window.addEventListener("pageshow", onShow);

    /* --- section headings decode in as they come into view ----------------- */
    const headings = new IntersectionObserver(
      (entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          decode(entry.target as HTMLElement);
        }
      },
      { rootMargin: "0px 0px -8% 0px" }
    );
    document.querySelectorAll<HTMLElement>(".section__eyebrow").forEach((el) => headings.observe(el));

    /* --- sticky nav ------------------------------------------------------- */
    const nav = document.querySelector<HTMLElement>(".nav");
    const onScroll = () => {
      if (nav) nav.dataset.stuck = String(window.scrollY > 24);
      // The footer is short and may never reach the spy's band, so the bottom of the page counts as contact.
      const root = document.documentElement;
      if (!isSeeking() && window.scrollY + window.innerHeight >= root.scrollHeight - 2) setSection("contact");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    /* --- breadcrumb: the section crossing the middle of the viewport ---------- */
    const sections = document.querySelectorAll<HTMLElement>("#top, main > section[id], footer[id]");
    const spy = new IntersectionObserver(
      (entries) => {
        if (isSeeking()) return;
        for (const entry of entries) if (entry.isIntersecting) setSection(entry.target.id);
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => spy.observe(s));

    /* --- in-page links seek instead of jumping ---------------------------- */
    document.addEventListener("click", seekOnClick);

    return () => {
      headings.disconnect();
      spy.disconnect();
      window.removeEventListener("pageshow", onShow);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", seekOnClick);
    };
  }, []);

  return null;
}
