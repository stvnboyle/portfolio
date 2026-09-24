"use client";

import { useEffect, useState } from "react";

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

/**
 * This visit's own LCP, CLS and TTFB, measured in the browser as the page
 * loads, and rated against the Core Web Vitals thresholds. LCP and CLS need
 * Chromium or Firefox; Safari shows "n/a" for them.
 */
export function WebVitals() {
  const [vitals, setVitals] = useState<Vitals>({ lcp: null, cls: null, ttfb: null });
  const [unsupported, setUnsupported] = useState<Array<keyof Vitals>>([]);

  useEffect(() => {
    const observers: PerformanceObserver[] = [];
    const set = (name: keyof Vitals, value: number) => setVitals((v) => ({ ...v, [name]: rate(name, value) }));

    const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (nav) {
      // From when the page was actually requested, for prerendered loads too.
      const activation = (nav as PerformanceNavigationTiming & { activationStart?: number }).activationStart ?? 0;
      set("ttfb", Math.max(0, nav.responseStart - activation));
    }

    const missing: Array<keyof Vitals> = [];
    if (supports("largest-contentful-paint")) {
      const lcp = new PerformanceObserver((list) => {
        const last = list.getEntries().at(-1);
        if (last) set("lcp", last.startTime);
      });
      lcp.observe({ type: "largest-contentful-paint", buffered: true });
      observers.push(lcp);
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
    setUnsupported(missing);

    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const show = (name: keyof Vitals, format: (v: number) => string) => {
    const metric = vitals[name];
    return (
      <div key={name} data-rating={metric?.rating}>
        <dt>{name}</dt>
        <dd>{metric ? format(metric.value) : unsupported.includes(name) ? "n/a" : "—"}</dd>
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
