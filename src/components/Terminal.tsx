"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFieldEngine } from "@/gfx/store";
import { SHAPES, SHAPE_BLURB, isShape } from "@/gfx/shapes";
import { THEMES, THEME_NAMES, type ThemeName } from "@/gfx/theme";
import { profile, roles, skillGroups, education, hobbies } from "@/data/profile";
import type { Article } from "@/data/articles";

type Line = {
  id: number;
  kind: "in" | "out" | "dim" | "ok" | "warn" | "err" | "head";
  content: ReactNode;
};

type Ctx = {
  print: (kind: Line["kind"], content: ReactNode) => void;
  clear: () => void;
  articles: Article[];
};

type Command = {
  name: string;
  args?: string;
  help: string;
  hidden?: boolean;
  run: (args: string[], ctx: Ctx) => void;
};

let lineId = 0;

export function Terminal({ articles }: { articles: Article[] }) {
  const { engine, status } = useFieldEngine();
  const [lines, setLines] = useState<Line[]>([]);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [booted, setBooted] = useState(false);
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputId = useId();

  const print = useCallback((kind: Line["kind"], content: ReactNode) => {
    setLines((prev) => [...prev, { id: lineId++, kind, content }]);
  }, []);

  const clear = useCallback(() => setLines([]), []);

  /* --- command table ------------------------------------------------------ */

  const commands = useMemo<Command[]>(() => {
    const list: Command[] = [
      {
        name: "help",
        help: "list every command",
        run: (_a, ctx) => {
          ctx.print("head", "Available commands");
          for (const c of list.filter((c) => !c.hidden)) {
            ctx.print(
              "out",
              <span className="tl-row">
                <b className="tl-cmd">
                  {c.name}
                  {c.args ? <span className="tl-args"> {c.args}</span> : null}
                </b>
                <span className="tl-dash">—</span>
                <span className="tl-help">{c.help}</span>
              </span>
            );
          }
          ctx.print("dim", "Tab completes · ↑ ↓ recalls history · Ctrl+L clears");
        },
      },
      {
        name: "whoami",
        help: "who you're talking to",
        run: (_a, ctx) => {
          ctx.print("head", profile.fullName);
          ctx.print("out", profile.roles.join(" / "));
          ctx.print("dim", `${profile.location} · available for interesting problems`);
          ctx.print("out", "");
          ctx.print("out", profile.intro);
          ctx.print("out", "");
          ctx.print("out", profile.intro2);
        },
      },
      {
        name: "skills",
        help: "the stack and the practice",
        run: (_a, ctx) => {
          for (const group of skillGroups) {
            ctx.print("head", group.label);
            ctx.print("out", group.items.join(" · "));
            ctx.print("out", "");
          }
        },
      },
      {
        name: "experience",
        args: "[company]",
        help: "roles, engagements, and what shipped",
        run: (args, ctx) => {
          const query = args.join(" ").toLowerCase();
          const matched = query
            ? roles.filter((r) => r.company.toLowerCase().includes(query))
            : roles;

          if (!matched.length) {
            ctx.print("err", `no role matching "${query}"`);
            ctx.print("dim", `try: ${roles.map((r) => r.company).join(", ")}`);
            return;
          }

          for (const role of matched) {
            ctx.print(
              "head",
              <>
                {role.company} <span className="tl-dash">·</span> {role.title}
              </>
            );
            ctx.print("dim", role.period);
            ctx.print("out", role.summary);
            for (const point of role.points) ctx.print("out", `  › ${point}`);
            if (role.engagements?.length) {
              ctx.print("dim", "  engagements (high level):");
              for (const e of role.engagements) {
                ctx.print("out", `  › ${e.name} — ${e.summary}`);
              }
            }
            ctx.print("out", "");
          }
        },
      },
      {
        name: "blog",
        help: "posts pulled from Medium at build time",
        run: (_a, ctx) => {
          ctx.print("head", `${ctx.articles.length} posts on Medium`);
          for (const article of ctx.articles) {
            ctx.print(
              "out",
              <a className="tl-link" href={article.url} target="_blank" rel="noreferrer">
                {article.title}
              </a>
            );
            ctx.print("dim", `  ${article.date} · ${article.readingMinutes} min read`);
          }
          ctx.print("out", "");
          ctx.print(
            "dim",
            <a className="tl-link" href={profile.links.medium} target="_blank" rel="noreferrer">
              {profile.links.medium}
            </a>
          );
        },
      },
      {
        name: "education",
        help: "where the fundamentals came from",
        run: (_a, ctx) => {
          ctx.print("head", education.school);
          ctx.print("out", education.degree);
          ctx.print("dim", `${education.period} · ${education.location}`);
          ctx.print("out", "");
          ctx.print("out", education.detail);
          ctx.print("out", "");
          ctx.print("dim", education.dissertation);
        },
      },
      {
        name: "contact",
        help: "how to reach me",
        run: (_a, ctx) => {
          const entries: Array<[string, string, string]> = [
            ["email", profile.email, `mailto:${profile.email}`],
            ["linkedin", "steven-buchanan-boyle", profile.links.linkedin],
            ["medium", "@stevenboyle64", profile.links.medium],
            ["gitgood", "gitgood.io", profile.links.gitgood],
          ];
          for (const [key, label, href] of entries) {
            ctx.print(
              "out",
              <span className="tl-row">
                <b className="tl-cmd">{key}</b>
                <span className="tl-dash">—</span>
                <a className="tl-link" href={href} target="_blank" rel="noreferrer">
                  {label}
                </a>
              </span>
            );
          }
        },
      },
      {
        name: "render",
        args: "<shape>",
        help: `morph the field — ${SHAPES.join(" | ")}`,
        run: (args, ctx) => {
          const [shape] = args;
          if (!shape) {
            ctx.print("head", "Shapes");
            for (const s of SHAPES) {
              ctx.print(
                "out",
                <span className="tl-row">
                  <b className="tl-cmd">{s}</b>
                  <span className="tl-dash">—</span>
                  <span className="tl-help">{SHAPE_BLURB[s]}</span>
                </span>
              );
            }
            return;
          }
          if (!isShape(shape)) {
            ctx.print("err", `unknown shape "${shape}"`);
            ctx.print("dim", `available: ${SHAPES.join(", ")}`);
            return;
          }
          engine?.setShape(shape);
          ctx.print("ok", `rendering ${shape}`);
          ctx.print("dim", SHAPE_BLURB[shape]);
        },
      },
      {
        name: "theme",
        args: "<name>",
        help: `recolour everything — ${THEME_NAMES.join(" | ")}`,
        run: (args, ctx) => {
          const [name] = args;
          if (!name) {
            ctx.print("head", "Themes");
            for (const t of THEME_NAMES) {
              ctx.print(
                "out",
                <span className="tl-row">
                  <b className="tl-cmd">{t}</b>
                  <span className="tl-dash">—</span>
                  <span className="tl-help">{THEMES[t].label.split("— ")[1] ?? ""}</span>
                </span>
              );
            }
            return;
          }
          if (!THEME_NAMES.includes(name as ThemeName)) {
            ctx.print("err", `unknown theme "${name}"`);
            ctx.print("dim", `available: ${THEME_NAMES.join(", ")}`);
            return;
          }
          engine?.setTheme(name as ThemeName);
          ctx.print("ok", `theme → ${name}`);
        },
      },
      {
        name: "particles",
        args: "<count>",
        help: "resize the simulation buffer",
        run: (args, ctx) => {
          const n = Number(args[0]);
          if (!Number.isFinite(n)) {
            ctx.print("err", "usage: particles <count>   e.g. particles 250000");
            return;
          }
          const applied = engine?.setCount(n) ?? 0;
          ctx.print("ok", `simulating ${applied.toLocaleString("en-GB")} particles`);
          if (applied !== Math.round(n)) {
            ctx.print("dim", "clamped to what this device can sensibly handle");
          }
        },
      },
      {
        name: "turbulence",
        args: "<0-4>",
        help: "how hard the flow field pushes",
        run: (args, ctx) => {
          const n = Number(args[0]);
          if (!Number.isFinite(n)) {
            ctx.print("err", "usage: turbulence <0-4>   e.g. turbulence 2.2");
            return;
          }
          engine?.setTurbulence(n);
          ctx.print("ok", `turbulence → ${Math.max(0, Math.min(n, 4))}`);
        },
      },
      {
        name: "gpu",
        help: "what's actually drawing this",
        run: (_a, ctx) => {
          if (!status || status.kind === "none") {
            ctx.print("warn", "no GPU backend — showing the static fallback");
            if (status?.fallbackReason) ctx.print("dim", status.fallbackReason);
            return;
          }
          const rows: Array<[string, string]> = [
            ["backend", status.kind === "webgpu" ? "WebGPU (compute shader)" : "WebGL2 (transform feedback)"],
            ["device", status.adapterLabel],
            ["particles", status.count.toLocaleString("en-GB")],
            ["shape", status.shape],
            ["theme", status.theme],
            ["turbulence", status.turbulence.toFixed(2)],
            ["fps", status.fps ? String(status.fps) : "measuring…"],
          ];
          ctx.print("head", "Renderer");
          for (const [k, v] of rows) {
            ctx.print(
              "out",
              <span className="tl-row">
                <b className="tl-cmd">{k}</b>
                <span className="tl-dash">—</span>
                <span className="tl-help">{v}</span>
              </span>
            );
          }
          if (status.fallbackReason) {
            ctx.print("dim", `WebGPU unavailable: ${status.fallbackReason}`);
          }
        },
      },
      {
        name: "neofetch",
        help: "the obligatory system readout",
        run: (_a, ctx) => {
          const info: Array<[string, string]> = [
            ["role", profile.roles.join(" / ")],
            ["location", profile.location],
            ["uptime", `${yearsSince(2016)} years shipping software`],
            ["shell", "next.js 16 · static export"],
            ["gpu", status?.kind === "webgpu" ? "WebGPU compute" : "WebGL2 transform feedback"],
            ["particles", (status?.count ?? 0).toLocaleString("en-GB")],
            ["stack", "TypeScript · React · Next.js · Node · Python · AWS"],
            ["editor", "Claude Code"],
          ];
          ctx.print(
            "out",
            <div className="neofetch">
              <pre className="neofetch__art" aria-hidden>{ASCII_MARK}</pre>
              <div className="neofetch__info">
                <div className="neofetch__title">
                  {profile.handle}
                  <span className="tl-dash">@</span>
                  portfolio
                </div>
                <div className="neofetch__rule" />
                {info.map(([k, v]) => (
                  <div key={k} className="tl-row">
                    <b className="tl-cmd">{k}</b>
                    <span className="tl-help">{v}</span>
                  </div>
                ))}
                <div className="neofetch__swatches">
                  {THEME_NAMES.map((t) => (
                    <i key={t} style={{ background: THEMES[t].css.accent }} />
                  ))}
                </div>
              </div>
            </div>
          );
        },
      },
      {
        name: "cv",
        help: "the traditional two-pager",
        run: (_a, ctx) => {
          ctx.print("out", "Everything on my CV is on this page — try `experience`.");
          ctx.print("out", "");
          ctx.print(
            "dim",
            <>
              For the PDF,{" "}
              <a className="tl-link" href={`mailto:${profile.email}`}>
                drop me an email
              </a>
              .
            </>
          );
        },
      },
      {
        name: "open",
        args: "<section>",
        help: "scroll to a section",
        run: (args, ctx) => {
          const sections = ["stack", "terminal", "writing", "contact"];
          const [target] = args;
          if (!target || !sections.includes(target)) {
            ctx.print("err", `usage: open <${sections.join("|")}>`);
            return;
          }
          document.getElementById(target)?.scrollIntoView({ behavior: "smooth" });
          ctx.print("ok", `→ ${target}`);
        },
      },
      {
        name: "hobbies",
        hidden: true,
        help: "what happens away from the keyboard",
        run: (_a, ctx) => {
          for (const h of hobbies) ctx.print("out", `  › ${h}`);
        },
      },
      {
        name: "clear",
        help: "wipe the scrollback",
        run: (_a, ctx) => ctx.clear(),
      },
      {
        name: "sudo",
        hidden: true,
        help: "nice try",
        run: (args, ctx) => {
          ctx.print("err", `${profile.handle} is not in the sudoers file.`);
          ctx.print("dim", "This incident has been reported.");
          if (args.join(" ").includes("rm")) {
            ctx.print("warn", "…and honestly, that one would have hurt.");
          }
        },
      },
      {
        name: "exit",
        hidden: true,
        help: "there is no exit",
        run: (_a, ctx) => {
          ctx.print("warn", "There's no exit from a single-page site.");
          ctx.print("dim", "Try `contact` instead — that's the way out.");
        },
      },
    ];
    return list;
  }, [engine, status]);

  /* --- execution ---------------------------------------------------------- */

  const execute = useCallback(
    (raw: string) => {
      const input = raw.trim();
      print("in", input);
      if (!input) return;

      setHistory((prev) => [input, ...prev.filter((h) => h !== input)].slice(0, 50));
      setHistoryIndex(-1);

      const [name, ...args] = input.split(/\s+/);
      const command = commands.find((c) => c.name === name.toLowerCase());

      if (!command) {
        print("err", `command not found: ${name}`);
        const near = commands
          .filter((c) => !c.hidden && c.name.startsWith(name[0]?.toLowerCase() ?? ""))
          .map((c) => c.name);
        print("dim", near.length ? `did you mean: ${near.join(", ")}?` : "type `help`");
        return;
      }

      command.run(args, { print, clear, articles });
    },
    [commands, print, clear, articles]
  );

  /* --- boot sequence ------------------------------------------------------ */

  useEffect(() => {
    const root = rootRef.current;
    if (!root || booted) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setBooted(true);

        const script: Array<[number, Line["kind"], ReactNode]> = [
          [0, "dim", "loading profile…"],
          [240, "dim", "syncing medium.com/@stevenboyle64"],
          [440, "ok", "ready"],
          [540, "out", ""],
          [
            580,
            "out",
            <>
              <b>{profile.fullName}</b> — {profile.roles.join(" / ")}
            </>,
          ],
          [660, "dim", "help for commands. render galaxy to mess with the field."],
          [720, "out", ""],
        ];

        const timers = script.map(([delay, kind, content]) =>
          window.setTimeout(() => print(kind, content), delay)
        );
        cleanupTimers.current = timers;
      },
      { threshold: 0.25 }
    );

    observer.observe(root);
    return () => observer.disconnect();
  }, [booted, print]);

  const cleanupTimers = useRef<number[]>([]);
  useEffect(() => () => cleanupTimers.current.forEach(clearTimeout), []);

  /* --- keep the view pinned to the newest line ---------------------------- */

  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [lines]);

  /* --- key handling ------------------------------------------------------- */

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      execute(value);
      setValue("");
      return;
    }

    if (event.key === "l" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      clear();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      if (next >= 0) {
        setHistoryIndex(next);
        setValue(history[next]);
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = historyIndex - 1;
      setHistoryIndex(next);
      setValue(next >= 0 ? history[next] : "");
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      const [head, ...rest] = value.split(/\s+/);

      // Complete the argument when there is already a command.
      if (rest.length) {
        const pool =
          head === "render" ? SHAPES : head === "theme" ? THEME_NAMES : [];
        const partial = rest[rest.length - 1] ?? "";
        const hit = pool.find((p) => p.startsWith(partial));
        if (hit) setValue([head, ...rest.slice(0, -1), hit].join(" "));
        return;
      }

      const matches = commands.filter((c) => c.name.startsWith(head.toLowerCase()));
      if (matches.length === 1) setValue(matches[0].name + (matches[0].args ? " " : ""));
      else if (matches.length > 1) print("dim", matches.map((m) => m.name).join("   "));
    }
  }

  const suggestions = ["whoami", "experience", "neofetch", "render galaxy", "theme matrix", "gpu"];

  return (
    <div
      ref={rootRef}
      className="terminal"
      data-focused={focused}
      onClick={() => inputRef.current?.focus()}
    >
      <div className="terminal__bar">
        <div className="terminal__lights" aria-hidden>
          <i /> <i /> <i />
        </div>
        <span className="terminal__path mono">
          {profile.handle}@portfolio <span className="tl-dash">:</span> ~
        </span>
        <span className="terminal__badge mono">
          {status?.kind === "webgpu" ? "webgpu" : status?.kind === "webgl2" ? "webgl2" : "—"}
        </span>
      </div>

      <div ref={bodyRef} className="terminal__body mono" role="log" aria-live="polite">
        {lines.map((line) => (
          <div key={line.id} className="tl" data-kind={line.kind}>
            {line.kind === "in" && <span className="tl-prompt">›</span>}
            <span className="tl-body">{line.content}</span>
          </div>
        ))}

        <div className="terminal__prompt">
          <span className="tl-prompt">›</span>
          <label className="sr-only" htmlFor={inputId}>
            Terminal input — type help for available commands
          </label>
          <span className="terminal__mirror" aria-hidden>
            {value}
            <i className="terminal__caret" data-on={focused} />
          </span>
          <input
            ref={inputRef}
            id={inputId}
            className="terminal__input mono"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
          />
        </div>
      </div>

      <div className="terminal__hints">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="hint mono"
            onClick={(e) => {
              e.stopPropagation();
              execute(s);
              inputRef.current?.focus();
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function yearsSince(year: number): number {
  return new Date().getFullYear() - year;
}

const ASCII_MARK = `████   ████
█      █   █
████   ████
   █   █   █
████   ████`;
