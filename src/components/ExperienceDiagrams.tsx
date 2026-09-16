import type { ExperienceId } from "@/data/experiences";

/**
 * Animated diagrams for each experience. Plain markup and SVG driven by CSS
 * keyframes on one shared cycle, so they stay server-rendered and cheap.
 */
export function ExperienceDiagram({ id }: { id: ExperienceId }) {
  if (id === "dx") return <DevLoop />;
  if (id === "ax") return <AgentLoop />;
  return <Interface />;
}

/* --- DX: a change travelling from diff to preview ------------------------- */

function DevLoop() {
  const checks = ["typecheck", "lint", "test", "build"];
  return (
    <div className="diagram dx" aria-hidden>
      <div className="dx__diff mono">
        <p className="dx__file">src/db/schema.ts</p>
        <p>
          <span className="dx__ln">12</span> export const users = table(&#123;
        </p>
        <p className="dx__del">
          <span className="dx__ln">13</span>- name: text(),
        </p>
        <p className="dx__add">
          <span className="dx__ln">13</span>+ displayName: text(),
        </p>
        <p>
          <span className="dx__ln">14</span> &#125;);
        </p>
      </div>

      <div className="dx__flow">
        <i className="dx__wire" />
        <ul className="dx__checks mono">
          {checks.map((check, i) => (
            <li key={check} style={{ "--i": i } as React.CSSProperties}>
              <i className="dx__status" />
              {check}
            </li>
          ))}
        </ul>
      </div>

      <div className="dx__preview">
        <div className="dx__bar">
          <i />
          <i />
          <i />
          <span className="mono">preview</span>
        </div>
        <div className="dx__page">
          <b />
          <b />
          <b />
        </div>
        <span className="dx__ready mono">ready</span>
      </div>
    </div>
  );
}

/* --- AX: the agent loop around a tool contract ---------------------------- */

function AgentLoop() {
  const stages = ["context", "plan", "act", "verify"];
  const guards = ["read-only fs", "tests must pass", "human review"];
  // Nodes sit at 12, 3, 6 and 9 o'clock on the ring.
  const positions = [
    [120, 22],
    [218, 120],
    [120, 218],
    [22, 120],
  ];

  return (
    <div className="diagram ax" aria-hidden>
      <div className="ax__ring">
        <svg viewBox="0 0 240 240">
          <circle className="ax__track" cx="120" cy="120" r="98" />
          <circle className="ax__arc" cx="120" cy="120" r="98" pathLength="100" />
        </svg>
        {stages.map((stage, i) => (
          <span
            key={stage}
            className="ax__node mono"
            style={
              {
                "--i": i,
                left: `${(positions[i][0] / 240) * 100}%`,
                top: `${(positions[i][1] / 240) * 100}%`,
              } as React.CSSProperties
            }
          >
            {stage}
          </span>
        ))}
        <div className="ax__contract mono">
          <p>
            <span>tool</span> search_docs
          </p>
          <p>
            <span>in</span> &#123; query &#125;
          </p>
          <p>
            <span>out</span> Doc[]
          </p>
        </div>
      </div>

      <ul className="ax__guards mono">
        {guards.map((g, i) => (
          <li key={g} style={{ "--i": i } as React.CSSProperties}>
            {g}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* --- UX: a page resolving inside its budget -------------------------------- */

function Interface() {
  const vitals: Array<[string, string]> = [
    ["LCP", "< 2.5s"],
    ["INP", "< 200ms"],
    ["CLS", "< 0.1"],
  ];
  // Deterministic heights so server and client agree.
  const bars = Array.from({ length: 36 }, (_, i) => 30 + ((i * 37) % 41) + (i % 5) * 3);

  return (
    <div className="diagram ux" aria-hidden>
      <div className="ux__device">
        <div className="ux__bar">
          <i />
          <i />
          <i />
          <span className="mono">/checkout</span>
        </div>
        <div className="ux__screen">
          <div className="ux__skeleton">
            <b />
            <b />
            <b />
            <b />
          </div>
          <div className="ux__content">
            <b className="ux__hero" />
            <b />
            <b />
            <b className="ux__cta" />
          </div>
        </div>
      </div>

      <div className="ux__metrics">
        <div className="ux__frames">
          <span className="mono">16.7ms</span>
          {bars.map((h, i) => (
            <i key={i} style={{ "--h": `${h}%`, "--i": i } as React.CSSProperties} />
          ))}
        </div>
        <ul className="ux__vitals mono">
          {vitals.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              {v}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
