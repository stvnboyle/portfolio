/**
 * The request map in the contact section: a small service topology that
 * requests travel through. Shared by the engine (positions, routes) and the
 * component (labels), so both agree on where every node sits.
 */

/** Node positions on a 0..1 layout, flowing left to right. Transposed on narrow screens. */
export const TRACE_NODES = [
  { id: "client", x: 0.0, y: 0.5 },
  { id: "edge", x: 0.2, y: 0.5 },
  { id: "api", x: 0.42, y: 0.5 },
  { id: "agent", x: 0.42, y: 0.0 },
  { id: "db", x: 0.66, y: 0.0 },
  { id: "queue", x: 0.66, y: 1.0 },
  { id: "worker", x: 0.84, y: 1.0 },
  { id: "inbox", x: 1.0, y: 0.5 },
] as const;

export type TraceNodeId = (typeof TRACE_NODES)[number]["id"];

export const TRACE_EDGES: Array<[TraceNodeId, TraceNodeId]> = [
  ["client", "edge"],
  ["edge", "api"],
  ["api", "agent"],
  ["api", "db"],
  ["agent", "db"],
  ["api", "queue"],
  ["queue", "worker"],
  ["worker", "db"],
  ["worker", "inbox"],
];

/** Paths a request can take, hop by hop. */
export const TRACE_ROUTES: Record<string, TraceNodeId[]> = {
  read: ["client", "edge", "api", "db", "api", "edge", "client"],
  write: ["client", "edge", "api", "queue", "worker", "db"],
  agent: ["client", "edge", "api", "agent", "db", "agent", "api", "edge", "client"],
  mail: ["client", "edge", "api", "queue", "worker", "inbox"],
};

/** Mirrors the array lengths in trace.wgsl. */
export const MAX_TRACE_NODES = 8;
export const MAX_TRACE_EDGES = 12;
export const MAX_PULSES = 16;
