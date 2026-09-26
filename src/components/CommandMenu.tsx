"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { seek } from "@/lib/seek";

export type Command = {
  id: string;
  group: string;
  label: string;
  /** Short right-aligned detail, e.g. a domain or shortcut. */
  hint?: string;
} & ({ href: string; external?: boolean } | { copy: string });

/**
 * A ⌘K palette: the site's one nod to the command line. Built on <dialog> so
 * focus trapping, Escape and the backdrop come from the platform.
 */
export function CommandMenu({ commands }: { commands: Command[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [mac, setMac] = useState(true);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => `${c.group} ${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q));
  }, [commands, query]);

  const open = useCallback(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    setQuery("");
    setActive(0);
    setNotice(null);
    dialog.showModal();
    inputRef.current?.focus();
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    setMac(/Mac|iPhone|iPad/.test(navigator.platform));
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const run = async (command: Command | undefined) => {
    if (!command) return;
    if ("copy" in command) {
      try {
        await navigator.clipboard.writeText(command.copy);
        setNotice(`copied ${command.copy}`);
      } catch {
        setNotice("clipboard unavailable");
      }
      return;
    }
    close();
    if (command.external) window.open(command.href, "_blank", "noopener,noreferrer");
    else if (!(command.href.startsWith("#") && seek(command.href))) window.location.href = command.href;
  };

  const onInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      void run(results[active]);
    }
  };

  let lastGroup = "";

  return (
    <>
      <button type="button" className="kbd-button" onClick={open} aria-haspopup="dialog">
        <kbd>{mac ? "⌘" : "Ctrl"}</kbd>
        <kbd>K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        className="palette"
        aria-label="Command menu"
        onClick={(e) => {
          // A click on the dialog element itself is a click on the backdrop.
          if (e.target === dialogRef.current) close();
        }}
      >
        <div className="palette__prompt">
          <span aria-hidden>&gt;</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setNotice(null);
            }}
            onKeyDown={onInputKey}
            placeholder="jump to, open or copy…"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>

        <ul className="palette__list" id={listId} role="listbox">
          {results.map((command, i) => {
            const heading = command.group !== lastGroup ? command.group : null;
            lastGroup = command.group;
            return (
              <li key={command.id} role="presentation">
                {heading && <p className="palette__group">{heading}</p>}
                <button
                  type="button"
                  id={`${listId}-${command.id}`}
                  role="option"
                  aria-selected={i === active}
                  className="palette__item"
                  onMouseMove={() => setActive(i)}
                  onClick={() => void run(command)}
                >
                  <span>{command.label}</span>
                  {command.hint && <span className="palette__hint">{command.hint}</span>}
                </button>
              </li>
            );
          })}
          {!results.length && <li className="palette__empty">no matches for “{query}”</li>}
        </ul>

        <p className="palette__foot" aria-live="polite">
          {notice ?? (
            <>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate <kbd>↵</kbd> run
            </>
          )}
        </p>
      </dialog>
    </>
  );
}
