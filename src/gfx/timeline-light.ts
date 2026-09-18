import { effect } from "vgpu";
import lightShader from "./timeline-light.wgsl";
import { runScene } from "./scene";

type Rgb = [number, number, number];

/** Mirrors the array lengths in timeline-light.wgsl. */
const MAX_LANES = 4;
const MAX_NODES = 16;
/** Light colours per lane, brighter and more saturated than the DOM lines. */
const LIGHT: Rgb[] = [
  [0.1, 0.92, 0.82], // work: cyan
  [0.35, 0.62, 1.0], // study: blue
  [1.0, 0.36, 0.66], // helloworld: pink
];
/** Where the reading line sits, as a fraction of the viewport height. */
const READING_LINE = 0.55;

const pad = (rows: number[][], length: number) => Array.from({ length }, (_, i) => rows[i] ?? [0, 0, 0, 0]);

/**
 * Runs a light down the timeline's lanes as the page scrolls. `host` wraps the
 * timeline; lane and node positions are measured from its DOM every frame, so
 * the light follows expanded details and resizes without any bookkeeping.
 */
export function startTimelineLight(canvas: HTMLCanvasElement, host: HTMLElement): () => void {
  return runScene(
    canvas,
    host,
    { onLive() {}, onStatus() {}, onUnsupported() {} },
    ({ gpu, surface: canvasSurface }) => {
      const measure = () => {
        const origin = canvas.getBoundingClientRect();
        const lanes: number[][] = [];
        const nodes: number[][] = [];
        for (const row of host.querySelectorAll<HTMLElement>(".commit")) {
          row.querySelectorAll<HTMLElement>(".graph__lane").forEach((lane, i) => {
            for (const line of lane.querySelectorAll(".graph__line")) {
              const r = line.getBoundingClientRect();
              const x = r.left + r.width / 2 - origin.left;
              const span = lanes[i] ?? [x, Infinity, -Infinity, 0];
              lanes[i] = [x, Math.min(span[1], r.top - origin.top), Math.max(span[2], r.bottom - origin.top), 0];
            }
            const node = lane.querySelector(".graph__node");
            if (node && nodes.length < MAX_NODES) {
              const r = node.getBoundingClientRect();
              nodes.push([r.left + r.width / 2 - origin.left, r.top + r.height / 2 - origin.top, i, 0]);
            }
          });
        }
        // Lane order matches LIGHT; a lane with no lines gets an empty span.
        const spans = Array.from({ length: Math.min(lanes.length, MAX_LANES) }, (_, i) => lanes[i] ?? [0, 0, -1, 0]);
        return { lanes: spans, nodes, origin };
      };

      const light = effect(gpu, lightShader, {
        label: "timeline-light",
        set: {
          light: {
            frame: [1, 1, 1, 0],
            head: [0, 0, 0, 0],
            lanes: pad([], MAX_LANES),
            laneTint: pad(LIGHT.map((c) => [...c, 0]), MAX_LANES),
            nodes: pad([], MAX_NODES),
          },
        },
      });

      let head = 0;
      let strength = 0;
      let first = true;
      let elapsed = 0;

      return {
        stats: () => [],
        tick(frame, dt, realDt) {
          elapsed += dt;
          const { lanes, nodes, origin } = measure();
          const target = window.innerHeight * READING_LINE - origin.top;
          // Ease after the scroll position so the light glides rather than jumps.
          head = first ? target : head + (target - head) * (1 - Math.exp(-realDt * 9));
          first = false;
          const top = Math.min(...lanes.map((l) => l[1]));
          const bottom = Math.max(...lanes.map((l) => l[2]));
          const within = head > top - 40 && head < bottom + 40 ? 1 : 0;
          strength += (within - strength) * (1 - Math.exp(-realDt * 4));

          light.set({
            light: {
              frame: [canvas.clientWidth, canvas.clientHeight, canvasSurface.size[1] / Math.max(1, canvas.clientHeight), elapsed],
              head: [head, strength, lanes.length, nodes.length],
              lanes: pad(lanes, MAX_LANES),
              nodes: pad(nodes, MAX_NODES),
            },
          });
          frame.pass({ target: canvasSurface, clear: [0, 0, 0, 0] }, (pass) => pass.draw(light));
        },
      };
    }
  );
}
