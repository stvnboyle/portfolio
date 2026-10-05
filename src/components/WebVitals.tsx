"use client";

import { useEffect, useState } from "react";
import { Spinner } from "./Spinner";

type Rating = "good" | "needs-improvement" | "poor";
type Metric = { value: number; rating: Rating } | null;
type Vitals = { lcp: Metric; cls: Metric; ttfb: Metric };

/** Core Web Vitals thresholds (good up to the first, poor beyond the second). */
const THRESHOLDS = { lcp: [2500, 4000], cls: [0.1, 0.25], ttfb: [800, 1800] } as const;

const rate = (name: keyof Vitals, value: number): Metric => {
  const [good, poor] = THRESHOLDS[name];
  return { value, rating: value <= good ? "good" : value <= poor ? "needs-improvement" : "poor" };
};

const supports = (type: string) => PerformanceObserver.supportedEntryTypes?.includes(type) ?? false;

type LayoutShift = PerformanceEntry & { value: number; hadRecentInput: boolean };

/** When the page was first hidden, or Infinity if it has been visible throughout. */
const firstHiddenTime = () => {
  const hidden = supports("visibility-state")
    ? performance.getEntriesByType("visibility-state").find((e) => e.name === "hidden")
    : undefined;
  return hidden?.startTime ?? (document.visibilityState === "hidden" ? 0 : Infinity);
};

/** What ends LCP: the browser reports no further candidates after the first input. */
const INPUTS = ["keydown", "pointerdown", "wheel"] as const;

/**
 * This visit's own LCP, CLS and TTFB, measured in the browser as the page
 * loads, and rated against the Core Web Vitals thresholds. LCP and CLS need
 * Chromium or Firefox; Safari shows "n/a" for them. LCP is also "n/a" for a
 * page opened in a background tab, and settles at the first input.
 */
export function WebVitals() {
  const [vitals, setVitals] = useState<Vitals>({ lcp: null, cls: null, ttfb: null });
  const [unavailable, setUnavailable] = useState<Array<keyof Vitals>>([]);

  useEffect(() => {
    const observers: PerformanceObserver[] = [];
    const cleanups: Array<() => void> = [];
    const set = (name: keyof Vitals, value: number) => setVitals((v) => ({ ...v, [name]: rate(name, value) }));

    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (nav) {
      // From when the page was actually requested, for prerendered loads too.
      const activation = (nav as PerformanceNavigationTiming & { activationStart?: number }).activationStart ?? 0;
      set("ttfb", Math.max(0, nav.responseStart - activation));
    }

    const missing: Array<keyof Vitals> = [];
    // A page opened in a background tab first paints when it's looked at, so its LCP would be the time spent away.
    let hiddenAt = firstHiddenTime();
    if (supports("largest-contentful-paint") && hiddenAt > 0) {
      let measured = false;
      const read = (entries: PerformanceEntry[]) => {
        const last = entries.filter((e) => e.startTime < hiddenAt).at(-1);
        if (!last) return;
        measured = true;
        set("lcp", last.startTime);
      };
      const lcp = new PerformanceObserver((list) => {
        read(list.getEntries());
        if (hiddenAt !== Infinity) settle();
      });
      const settle = () => {
        read(lcp.takeRecords());
        lcp.disconnect();
        unlisten();
        if (!measured) setUnavailable((u) => (u.includes("lcp") ? u : [...u, "lcp"]));
      };
      const onVisibility = () => {
        if (document.visibilityState !== "hidden") return;
        hiddenAt = Math.min(hiddenAt, performance.now());
        settle();
      };
      const unlisten = () => {
        INPUTS.forEach((type) => removeEventListener(type, settle, true));
        document.removeEventListener("visibilitychange", onVisibility);
      };
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
      INPUTS.forEach((type) => addEventListener(type, settle, { capture: true, passive: true }));
      document.addEventListener("visibilitychange", onVisibility);
      observers.push(lcp);
      cleanups.push(unlisten);
    } else missing.push("lcp");

    if (supports("layout-shift")) {
      // The largest burst of shifts (session windows of up to 5s, gaps under 1s), as CLS is defined.
      let worst = 0;
      let session = 0;
      let first = 0;
      let last = 0;
      set("cls", 0);
      const cls = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShift[]) {
          if (entry.hadRecentInput) continue;
          if (session && entry.startTime - last < 1000 && entry.startTime - first < 5000) {
            session += entry.value;
          } else {
            session = entry.value;
            first = entry.startTime;
          }
          last = entry.startTime;
          worst = Math.max(worst, session);
        }
        set("cls", worst);
      });
      cls.observe({ type: "layout-shift", buffered: true });
      observers.push(cls);
    } else missing.push("cls");
    setUnavailable((u) => [...new Set([...u, ...missing])]);

    return () => {
      observers.forEach((o) => o.disconnect());
      cleanups.forEach((c) => c());
    };
  }, []);

  const show = (name: keyof Vitals, format: (v: number) => string) => {
    const metric = vitals[name];
    return (
      <div key={name} data-metric={name} data-rating={metric?.rating}>
        <dt>{name}</dt>
        <dd>{metric ? format(metric.value) : unavailable.includes(name) ? "n/a" : <Spinner label="" />}</dd>
      </div>
    );
  };

  return (
    <dl className="vitals" aria-label="Core Web Vitals for this visit">
      {show("lcp", (ms) => (ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`))}
      {show("cls", (v) => v.toFixed(2))}
      {show("ttfb", (ms) => `${Math.round(ms)} ms`)}
    </dl>
  );
}
