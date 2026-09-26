"use client";

import { useEffect } from "react";
import { seekOnClick } from "@/lib/seek";

/** In-page links (the contents, footnotes) seek the way the home page's do, rather than jumping. */
export function SeekLinks() {
  useEffect(() => {
    document.addEventListener("click", seekOnClick);
    return () => document.removeEventListener("click", seekOnClick);
  }, []);

  return null;
}
