"use client";

import { useEffect, useState } from "react";
import { currentTheme, THEME_EVENT, toggleTheme, type Theme } from "@/lib/theme";

/** A one-key button beside ⌘K that flips between the dark and light themes. */
export function ThemeToggle() {
  // Unknown until mounted: the theme is set in the browser, not at build time.
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setTheme(currentTheme());
    sync();
    root.addEventListener(THEME_EVENT, sync);
    return () => root.removeEventListener(THEME_EVENT, sync);
  }, []);

  const next = theme === "light" ? "dark" : "light";

  return (
    <button
      type="button"
      className="kbd-button theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to the ${next} theme`}
      title={`${next} theme`}
    >
      <kbd>{theme === "light" ? <Moon /> : <Sun />}</kbd>
    </button>
  );
}

function Sun() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
    </svg>
  );
}

function Moon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
    </svg>
  );
}
