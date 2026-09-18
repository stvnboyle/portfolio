"use client";

import { useEffect, useRef, useState } from "react";
import { startTrace, type TraceStatus } from "@/gfx/trace-engine";
import { TRACE_NODES } from "@/gfx/trace";

type MapState = { kind: "starting" } | { kind: "live"; status: TraceStatus | null } | { kind: "unsupported" };

/** A live request map; hovering the `$ mail` command below routes a request to the inbox. */
export function TraceMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<MapState>({ kind: "starting" });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    return startTrace(canvas, host, document.querySelector<HTMLElement>(".footer__command"), {
      onLive: () => setState({ kind: "live", status: null }),
      onStatus: (status) => setState({ kind: "live", status }),
      onUnsupported: (reason) => {
        console.info(`[trace] falling back to a static map: ${reason}`);
        setState({ kind: "unsupported" });
      },
    });
  }, []);

  const status = state.kind === "live" ? state.status : null;

  return (
    <div className="trace" data-reveal>
      <div className="trace__stage" ref={hostRef} data-field={state.kind}>
        <canvas ref={canvasRef} className="trace__canvas" aria-hidden />
        {TRACE_NODES.map((n) => (
          <span
            key={n.id}
            className="trace__label"
            data-edge={n.y === 1 ? "end" : undefined}
            style={{ "--x": n.x, "--y": n.y } as React.CSSProperties}
            aria-hidden
          >
            {n.id}
          </span>
        ))}
      </div>
      <p className="trace__meta" aria-hidden>
        <span>{"// request path · click to send one"}</span>
        <span>
          {state.kind === "unsupported"
            ? "static preview"
            : `sent ${status?.sent ?? 0} · in flight ${status?.inFlight ?? 0}`}
        </span>
      </p>
    </div>
  );
}
