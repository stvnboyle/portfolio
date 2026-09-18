import { clock, effect, frameLoop, init, surface } from "vgpu";
import type { FrameLoopHandle, Gpu } from "vgpu";
import traceShader from "./trace.wgsl";
import { PALETTE } from "./packets";
import {
  MAX_PULSES,
  MAX_TRACE_EDGES,
  MAX_TRACE_NODES,
  TRACE_EDGES,
  TRACE_NODES,
  TRACE_ROUTES,
  type TraceNodeId,
} from "./trace";

type Rgb = [number, number, number];

/** Layout inset, in CSS pixels. Mirrors `--trace-inset` in globals.css. */
export const TRACE_INSET = 40;
/** Below this aspect ratio the map runs top to bottom. */
const VERTICAL_BELOW = 1.2;
/** Travel speed, in panel heights per second. */
const SPEED = 0.9;

export type TraceStatus = { sent: number; inFlight: number; vertical: boolean };

type Callbacks = {
  onLive(): void;
  onStatus(status: TraceStatus): void;
  onUnsupported(reason: string): void;
};

type Pulse = { from: number; to: number; t: number; color: Rgb; rest: number[]; age: number };

const index = (id: TraceNodeId) => TRACE_NODES.findIndex((n) => n.id === id);
const padded = (rows: number[][], length: number) =>
  Array.from({ length }, (_, i) => rows[i] ?? [0, 0, 0, 0]);

/**
 * Starts the request map on `canvas`. Pointer input comes from `host`, and
 * hovering or focusing `trigger` sends a request through to the inbox.
 * Returns a teardown function, safe to call before startup has finished.
 */
export function startTrace(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
  trigger: HTMLElement | null,
  callbacks: Callbacks
): () => void {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      gpu = await init({ powerPreference: "low-power" });
    } catch (error) {
      callbacks.onUnsupported((error as Error).message);
      return;
    }
    if (disposed) return gpu.dispose();

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvasSurface = surface(gpu, canvas, { dpr: [1, 2] });
    const dpr = () => canvasSurface.size[1] / Math.max(1, canvas.clientHeight);
    const vertical = () => canvas.clientWidth / Math.max(1, canvas.clientHeight) < VERTICAL_BELOW;

    const edges = TRACE_EDGES.map(([a, b]) => ({ a: index(a), b: index(b), heat: 0, color: PALETTE[0] }));
    const lit = TRACE_NODES.map(() => ({ value: 0, color: PALETTE[0] }));
    let pulses: Pulse[] = [];
    let sent = 0;
    let colorIndex = 0;
    let pointer: [number, number] = [-1e4, -1e4];

    const edgeBetween = (a: number, b: number) => edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));

    const send = (route: TraceNodeId[], color?: Rgb) => {
      if (pulses.length >= MAX_PULSES) return;
      colorIndex = (colorIndex + 1) % PALETTE.length;
      const [first, second, ...rest] = route.map(index);
      pulses.push({ from: first, to: second, t: 0, color: color ?? PALETTE[colorIndex], rest, age: 0 });
      lit[first] = { value: 1, color: color ?? PALETTE[colorIndex] };
      sent++;
    };

    const ambient = ["read", "read", "write", "agent"] as const;
    const sendAmbient = () => send(TRACE_ROUTES[ambient[Math.floor(Math.random() * ambient.length)]]);

    /* --- input ------------------------------------------------------------ */

    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer = [(e.clientX - rect.left) * dpr(), (e.clientY - rect.top) * dpr()];
    };
    const onLeave = () => (pointer = [-1e4, -1e4]);
    const onDown = () => sendAmbient();
    let lastMail = 0;
    // Magenta, so a message stands out from background traffic.
    const onMail = () => {
      const now = performance.now();
      if (now - lastMail < 900) return;
      lastMail = now;
      send(TRACE_ROUTES.mail, PALETTE[2]);
    };
    host.addEventListener("pointermove", onMove, { passive: true });
    host.addEventListener("pointerleave", onLeave, { passive: true });
    canvas.addEventListener("pointerdown", onDown, { passive: true });
    trigger?.addEventListener("pointerenter", onMail);
    trigger?.addEventListener("focus", onMail);

    let onScreen = false;
    const visibility = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    visibility.observe(canvas);

    cleanups.push(() => {
      visibility.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
      trigger?.removeEventListener("pointerenter", onMail);
      trigger?.removeEventListener("focus", onMail);
    });

    /* --- render ----------------------------------------------------------- */

    const uniforms = (elapsed: number) => ({
      frame: [canvasSurface.size[0], canvasSurface.size[1], dpr(), elapsed],
      shape: [TRACE_INSET * dpr(), vertical() ? 1 : 0, TRACE_NODES.length, edges.length],
      pointer: [pointer[0], pointer[1], pulses.length, 0],
      nodes: padded(
        TRACE_NODES.map((n, i) => [n.x, n.y, lit[i].value, 0]),
        MAX_TRACE_NODES
      ),
      nodeTint: padded(
        lit.map((l) => [...l.color, 0]),
        MAX_TRACE_NODES
      ),
      edges: padded(
        edges.map((e) => [e.a, e.b, e.heat, 0]),
        MAX_TRACE_EDGES
      ),
      edgeTint: padded(
        edges.map((e) => [...e.color, 0]),
        MAX_TRACE_EDGES
      ),
      pulses: padded(
        pulses.map((p) => [p.from, p.to, p.t, Math.min(1, p.age * 5)]),
        MAX_PULSES
      ),
      pulseTint: padded(
        pulses.map((p) => [...p.color, 0]),
        MAX_PULSES
      ),
    });

    const map = effect(gpu, traceShader, { label: "trace", set: { trace: uniforms(0) } });

    const time = clock(gpu);
    const speed = calm ? 0.35 : 1;
    let elapsed = 0;
    let nextAmbient = 0.4;
    let live = false;
    let lastStatus = "";

    // Length of a hop in panel heights, so speed reads the same on any layout.
    const hopLength = (a: number, b: number) => {
      const w = canvas.clientWidth - 2 * TRACE_INSET;
      const h = canvas.clientHeight - 2 * TRACE_INSET;
      const na = TRACE_NODES[a];
      const nb = TRACE_NODES[b];
      const [dx, dy] = vertical() ? [(na.y - nb.y) * w, (na.x - nb.x) * h] : [(na.x - nb.x) * w, (na.y - nb.y) * h];
      return Math.max(0.05, Math.hypot(dx, dy) / Math.max(1, canvas.clientHeight));
    };

    loop = frameLoop(gpu, (frame) => {
      if (!onScreen) return;
      const dt = Math.min(time.deltaTime, 0.1) * speed;
      elapsed += dt;

      nextAmbient -= dt;
      if (nextAmbient <= 0) {
        sendAmbient();
        nextAmbient = 1.1 + Math.random() * 1.4;
      }

      const next: Pulse[] = [];
      for (const p of pulses) {
        p.age += dt;
        p.t += (dt * SPEED) / hopLength(p.from, p.to);
        const edge = edgeBetween(p.from, p.to);
        if (edge) {
          edge.heat = Math.max(edge.heat, 0.8);
          edge.color = p.color;
        }
        if (p.t < 1) {
          next.push(p);
          continue;
        }
        // Arrived: light the node and carry on to the next hop, if there is one.
        lit[p.to] = { value: 1, color: p.color };
        const [to, ...rest] = p.rest;
        if (to !== undefined) next.push({ ...p, from: p.to, to, t: p.t - 1, rest });
      }
      pulses = next;
      for (const e of edges) e.heat *= Math.exp(-dt * 1.6);
      for (const l of lit) l.value *= Math.exp(-dt * 2.2);

      map.set({ trace: uniforms(elapsed) });
      frame.pass({ target: canvasSurface }, (pass) => pass.draw(map));

      if (!live) {
        live = true;
        callbacks.onLive();
      }
      const status: TraceStatus = { sent, inFlight: pulses.length, vertical: vertical() };
      const key = JSON.stringify(status);
      if (key !== lastStatus) {
        lastStatus = key;
        callbacks.onStatus(status);
      }
    });
  })().catch((error: Error) => callbacks.onUnsupported(error.message));

  return () => {
    disposed = true;
    loop?.stop();
    for (const fn of cleanups) fn();
    gpu?.dispose();
  };
}
