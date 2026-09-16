import type { ExperienceId } from "@/data/experiences";

/**
 * Small, CSS-animated diagrams for each experience. Server-rendered SVG and
 * markup only — the hero already has the page's one GPU canvas.
 */
export function ExperienceVisual({ id }: { id: ExperienceId }) {
  if (id === "dx") return <Pipeline />;
  if (id === "ax") return <ToolContract />;
  return <FrameBudget />;
}

/** push → check → preview → ship, with a pulse travelling the line. */
function Pipeline() {
  const stages = ["push", "check", "preview", "ship"];
  return (
    <div className="viz viz--pipeline" aria-hidden>
      <div className="pipeline">
        <i className="pipeline__rail" />
        <i className="pipeline__pulse" />
        {stages.map((stage, i) => (
          <div key={stage} className="pipeline__stage" style={{ "--i": i } as React.CSSProperties}>
            <i className="pipeline__node" />
            <span className="mono">{stage}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A tool definition being read line by line. */
function ToolContract() {
  const lines: Array<[string, string]> = [
    ["tool", "search_docs"],
    ["input", "{ query: string }"],
    ["output", "Doc[]"],
    ["scope", "read-only"],
  ];
  return (
    <div className="viz viz--contract" aria-hidden>
      <div className="contract mono">
        <i className="contract__scan" />
        {lines.map(([k, v], i) => (
          <div key={k} className="contract__line" style={{ "--i": i } as React.CSSProperties}>
            <span className="contract__key">{k}</span>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Frames landing comfortably under the 16.7ms budget line. */
function FrameBudget() {
  // Deterministic heights so server and client agree.
  const bars = Array.from({ length: 28 }, (_, i) => 28 + ((i * 37) % 41) + (i % 5) * 3);
  return (
    <div className="viz viz--frames" aria-hidden>
      <div className="frames">
        <span className="frames__budget mono">16.7ms</span>
        {bars.map((h, i) => (
          <i key={i} style={{ "--h": `${h}%`, "--i": i } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
