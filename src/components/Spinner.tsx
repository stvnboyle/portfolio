"use client";

import { useEffect, useState } from "react";

/** A terminal-style braille spinner. */
const FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
const FRAME_MS = 80;

/**
 * A CLI spinner and a dim label, for a value that's still being worked out.
 * Holds still under reduced motion.
 */
export function Spinner({ label }: { label: string }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), FRAME_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="spinner">
      <span className="spinner__glyph" aria-hidden>
        {FRAMES[frame]}
      </span>
      {label}
    </span>
  );
}
