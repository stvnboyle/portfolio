"use client";

import { useRef, useState } from "react";
import { seek } from "@/lib/seek";

const SECTIONS = ["about", "timeline", "projects", "writing", "contact"];
const EDITORS = ["vi", "vim", "nvim", "cat", "less", "open"];
const COMMANDS = ["cd", "vi", "ls", "help"];
const HINT = "cd <section> · vi <post> · ls";
const HELP = [
  "cd <section>   about, timeline, projects, writing, contact",
  "cd             back to the top",
  "vi <post>      open a post (tab completes)",
  "ls [writing]   list sections, or posts",
  "esc            leave the prompt",
];

/** `~/writing/foo.md`, `stevenboyle.dev/about/` and `./about` all name the same place as `writing/foo` and `about`. */
const clean = (path: string) =>
  path
    .replace(/^(stevenboyle\.dev|~)(?=\/|$)/, "")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.md$/, "");

/**
 * The nav's shell prompt, made typeable. At rest it shows `children` (the
 * breadcrumb lib/seek.ts types out); focused, it clears to `$ ▮` and takes
 * `cd <section>` or `vi <post>`. A transparent <input> over the prompt holds
 * the text, mirrored into spans so the prompt keeps its own type and caret.
 */
export function Prompt({
  className,
  posts,
  home = false,
  children,
}: {
  className: string;
  /** Post slugs, newest first. */
  posts: string[];
  /** On the home page sections seek in place; elsewhere they load /#section. */
  home?: boolean;
  children: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [typing, setTyping] = useState(false);
  const [value, setValue] = useState("");
  const [out, setOut] = useState<string[] | null>(null);

  /* --- completion: the rest of the word being typed, shown dim after the caret --- */
  const space = value.search(/\s/);
  const name = space < 0 ? value : value.slice(0, space);
  const token = space < 0 ? "" : value.slice(space).trimStart();
  let ghost = "";
  if (space < 0) {
    if (value) ghost = (COMMANDS.find((c) => c.startsWith(value)) ?? value).slice(value.length);
  } else if (name === "cd" || EDITORS.includes(name)) {
    const stem = name === "cd" ? clean(token) : clean(token).replace(/^writing\//, "");
    const names = name === "cd" ? SECTIONS : posts.map((p) => `${p}.md`);
    const match = names.find((n) => n.startsWith(stem));
    if (match && token.endsWith(stem)) ghost = match.slice(stem.length);
  }

  const leave = () => inputRef.current?.blur();

  const goSection = (id: string) => {
    leave();
    if (home) seek(`#${id}`);
    else window.location.href = id === "top" ? "/" : `/#${id}`;
  };

  const run = (line: string) => {
    const [cmd = "", ...rest] = line.trim().split(/\s+/);
    const arg = rest.join(" ");
    const path = clean(arg);
    setValue("");
    setOut(null);

    if (!cmd) return;
    if (cmd === "cd") {
      if (!path || arg === "..") goSection("top");
      else if (SECTIONS.includes(path)) goSection(path);
      else if (posts.includes(path.replace(/^writing\//, ""))) setOut([`cd: not a directory: ${arg}`]);
      else setOut([`cd: no such file or directory: ${arg}`]);
    } else if (EDITORS.includes(cmd)) {
      const stem = path.replace(/^writing\//, "");
      const matches = posts.filter((p) => p.startsWith(stem));
      const post = posts.includes(stem) ? stem : matches.length === 1 ? matches[0] : null;
      if (!arg) setOut([`usage: ${cmd} <post>`, ...posts.map((p) => `${p}.md`)]);
      else if (post) {
        leave();
        window.location.href = `/writing/${post}`;
      } else if (SECTIONS.includes(path)) setOut([`${cmd}: ${arg}: is a directory`]);
      else if (stem && matches.length) setOut(matches.map((p) => `${p}.md`));
      else setOut([`${cmd}: ${arg}: no such file or directory`]);
    } else if (cmd === "ls") {
      if (!path) setOut([SECTIONS.map((s) => `${s}/`).join("  ")]);
      else if (path === "writing") setOut(posts.map((p) => `${p}.md`));
      else if (!SECTIONS.includes(path)) setOut([`ls: ${arg}: no such file or directory`]);
    } else if (cmd === "help" || cmd === "man") {
      setOut(HELP);
    } else if (/^(:w?q!?|exit)$/.test(cmd)) {
      if (home) leave();
      else goSection("top");
    } else if (cmd !== "clear") {
      setOut([`zsh: command not found: ${cmd}`]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      run(value);
    } else if (e.key === "Escape") {
      leave();
    } else if (e.key === "Tab" && !e.shiftKey && value) {
      // Tab stays in the prompt while there's a command to complete.
      e.preventDefault();
      if (ghost) setValue(value + ghost);
    } else if (e.key === "ArrowRight" && ghost) {
      e.preventDefault();
      setValue(value + ghost);
    } else if (e.key === "ArrowLeft" || e.key === "Home") {
      // The block caret only ever sits at the end of the line.
      e.preventDefault();
    }
  };

  return (
    <div className={`prompt ${className}`} data-typing={typing}>
      <span className="nav__prompt" aria-hidden>
        $
      </span>
      <span className="prompt__rest">{children}</span>
      <span className="prompt__typed" aria-hidden>
        <span>{value}</span>
      </span>
      <i className="caret" aria-hidden />
      <span className="prompt__ghost" aria-hidden>
        {value ? ghost : ` ${HINT}`}
      </span>
      <input
        ref={inputRef}
        className="prompt__input"
        aria-label="Shell prompt: cd to a section, or vi a post"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOut(null);
        }}
        onKeyDown={onKeyDown}
        onSelect={(e) => {
          const el = e.currentTarget;
          el.setSelectionRange(el.value.length, el.value.length);
        }}
        onFocus={() => setTyping(true)}
        onBlur={() => {
          setTyping(false);
          setValue("");
          setOut(null);
        }}
        enterKeyHint="go"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      {out && (
        <div className="prompt__out" role="status">
          {out.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
