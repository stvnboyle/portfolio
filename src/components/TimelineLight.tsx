"use client";

import { useEffect, useRef } from "react";
import { startTimelineLight } from "@/gfx/timeline-light";

/** A WebGPU light over the timeline's branch lanes that follows the scroll. */
export function TimelineLight() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.closest<HTMLElement>(".timeline-wrap");
    if (!canvas || !host) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    return startTimelineLight(canvas, host);
  }, []);

  return (
    <div className="timeline__light" aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
}
