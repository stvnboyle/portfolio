"use client";

import { useState } from "react";
import { skillAxes } from "@/data/profile";

const CENTER = 130;
const RADIUS = 96;
const RINGS = [0.25, 0.5, 0.75, 1];
const SEGMENTS = 14;

function point(index: number, ratio: number): [number, number] {
  const angle = ((-90 + (360 / skillAxes.length) * index) * Math.PI) / 180;
  return [
    CENTER + Math.cos(angle) * RADIUS * ratio,
    CENTER + Math.sin(angle) * RADIUS * ratio,
  ];
}

function polygon(ratios: number[]): string {
  return ratios.map((r, i) => point(i, r).join(",")).join(" ");
}

export function SkillRadar() {
  const [active, setActive] = useState(0);
  const axis = skillAxes[active];
  const shape = polygon(skillAxes.map((a) => a.level / 100));

  return (
    <div className="radar" data-reveal>
      {/* ---------- chart ---------- */}
      <div className="radar__chart">
        <svg viewBox="0 0 260 260" role="img" aria-label="Skill radar across six areas">
          <defs>
            <radialGradient id="radar-fill" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.42" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.08" />
            </radialGradient>
            <linearGradient id="radar-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {/* rings */}
          {RINGS.map((r) => (
            <polygon
              key={r}
              className="radar__ring"
              points={polygon(skillAxes.map(() => r))}
            />
          ))}

          {/* spokes */}
          {skillAxes.map((a, i) => {
            const [x, y] = point(i, 1);
            return (
              <line
                key={a.key}
                className="radar__spoke"
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                data-active={i === active}
              />
            );
          })}

          {/* slow sweep, purely decorative */}
          <g className="radar__sweep" aria-hidden>
            <polygon points={`${CENTER},${CENTER} ${CENTER + RADIUS},${CENTER - 26} ${CENTER + RADIUS},${CENTER + 26}`} fill="url(#radar-sweep)" />
          </g>

          {/* the data */}
          <polygon className="radar__shape" points={shape} />

          {/* vertices */}
          {skillAxes.map((a, i) => {
            const [x, y] = point(i, a.level / 100);
            return (
              <circle
                key={a.key}
                className="radar__node"
                cx={x}
                cy={y}
                r={i === active ? 4.5 : 3}
                data-active={i === active}
              />
            );
          })}

          {/* axis labels */}
          {skillAxes.map((a, i) => {
            const [x, y] = point(i, 1.19);
            return (
              <text
                key={a.key}
                className="radar__label"
                x={x}
                y={y}
                data-active={i === active}
                textAnchor="middle"
                dominantBaseline="middle"
                onClick={() => setActive(i)}
              >
                {a.short}
              </text>
            );
          })}
        </svg>
      </div>

      {/* ---------- stat bars ---------- */}
      <div className="radar__stats">
        <div className="radar__statshead mono">
          <span>area</span>
          <span>level</span>
        </div>

        {skillAxes.map((a, i) => {
          const filled = Math.round((a.level / 100) * SEGMENTS);
          return (
            <button
              key={a.key}
              type="button"
              className="statrow mono"
              data-active={i === active}
              onClick={() => setActive(i)}
              aria-pressed={i === active}
            >
              <span className="statrow__label">{a.label}</span>
              <span className="statrow__bar" aria-hidden>
                {Array.from({ length: SEGMENTS }, (_, s) => (
                  <i key={s} data-on={s < filled} style={{ "--s": s } as React.CSSProperties} />
                ))}
              </span>
              <span className="statrow__value">{a.level}</span>
            </button>
          );
        })}

        <div className="radar__detail">
          <p className="radar__note">{axis.note}</p>
          <div className="skill__items">
            {axis.items.map((item) => (
              <span key={item} className="skill__item mono">
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
