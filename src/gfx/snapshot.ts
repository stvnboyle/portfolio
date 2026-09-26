import type { Rgb } from "./palette";

const KEY = "swarm-snapshot";
/** A snapshot older than this is stale: the visitor has been away, so the swarm starts fresh. */
const MAX_AGE_MS = 30 * 60_000;

export type SavedTask = {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: Rgb;
  age: number;
  progress: number;
  closed: "done" | "dropped" | null;
  burst: number;
};

/** The swarm as it was when the page was left: GPU agent state plus the CPU's schedule and tasks. */
export type Snapshot = {
  savedAt: number;
  capacity: number;
  world: [number, number];
  elapsed: number;
  steps: number;
  simTime: number;
  nextId: number;
  colorIndex: number;
  completed: number;
  alive: number;
  nextSquad: number;
  nextLeave: number;
  nextPost: number;
  mood: [number, number, number, number];
  tasks: Array<SavedTask | null>;
  state: Float32Array<ArrayBuffer>;
};

const toBase64 = (data: Float32Array) => {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

const fromBase64 = (text: string) => {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Float32Array(bytes.buffer);
};

/** Saved for this tab only (sessionStorage), so a new visit still gets the quiet warm-up. */
export function saveSnapshot(snapshot: Snapshot) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...snapshot, state: toBase64(snapshot.state) }));
  } catch {
    // Storage full or blocked: the next load just starts fresh.
  }
}

export function loadSnapshot(capacity: number): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<Snapshot, "state"> & { state: string };
    if (parsed.capacity !== capacity || Date.now() - parsed.savedAt > MAX_AGE_MS) return null;
    const state = fromBase64(parsed.state);
    return state.length === capacity * 12 ? { ...parsed, state } : null;
  } catch {
    return null;
  }
}
