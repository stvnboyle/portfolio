"use client";

import { useEffect, useState } from "react";
import type { Heading } from "@/data/articles";

/** The post's contents, highlighting the section being read. */
export function PostContents({ headings }: { headings: Heading[] }) {
  const [active, setActive] = useState(headings[0]?.id);

  useEffect(() => {
    const targets = headings.map((h) => document.getElementById(h.id)).filter((el): el is HTMLElement => Boolean(el));
    // The current section is the last heading above a line a third of the way down the screen.
    const update = () => {
      const line = window.innerHeight / 3;
      const current = targets.filter((el) => el.getBoundingClientRect().top < line).at(-1);
      setActive(current?.id ?? headings[0]?.id);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [headings]);

  return (
    <nav className="toc" aria-label="Contents">
      <p className="toc__label">{"// contents"}</p>
      <ol>
        {headings.map((h) => (
          <li key={h.id} data-level={h.level} data-active={h.id === active || undefined}>
            <a href={`#${h.id}`}>{h.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
