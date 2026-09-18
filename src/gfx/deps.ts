import { compute, draw, effect, pingPongStorage, storage } from "vgpu";
import { perspectiveCamera } from "vgpu/scene";
import layoutShader from "./deps.wgsl";
import renderShader from "./deps-render.wgsl";
import skyShader from "./signal-sky.wgsl";
import { PALETTE } from "./packets";
import { onCopy, pointerIn, runScene, type StartScene } from "./scene";
import { CLEAR } from "./signal";

const SIM_HZ = 60;
/** Depth levels the install wave covers per second. */
const WAVE_SPEED = 1.5;
/** Seconds between waves when nobody is clicking. */
const WAVE_EVERY = 6.5;
/** Seconds for one full orbit of the camera. */
const ORBIT = 150;

type Graph = { count: number; edges: Array<[number, number]>; adjacency: number[][] };

/**
 * A package graph grown like a real one: each new package depends on an
 * existing one, favouring popular packages (preferential attachment), and
 * some pick up a second, shared dependency.
 */
function growGraph(count: number): Graph {
  const edges: Array<[number, number]> = [];
  const adjacency: number[][] = [[]];
  const weights = [1];
  let total = 1;
  const pick = () => {
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) if ((r -= weights[i]) <= 0) return i;
    return weights.length - 1;
  };
  const link = (a: number, b: number) => {
    edges.push([a, b]);
    adjacency[a].push(b);
    adjacency[b].push(a);
    weights[a] += 1;
    weights[b] += 1;
    total += 2;
  };
  for (let i = 1; i < count; i++) {
    const parent = pick();
    adjacency.push([]);
    weights.push(1);
    total += 1;
    link(i, parent);
    if (i > 8 && Math.random() < 0.12) {
      const shared = pick();
      if (shared !== i && shared !== parent) link(i, shared);
    }
  }
  return { count, edges, adjacency };
}

/** Breadth-first depth of every node from `source`. */
function depths(graph: Graph, source: number): { depth: Float32Array; max: number } {
  const depth = new Float32Array(graph.count).fill(-1);
  depth[source] = 0;
  const queue = [source];
  let max = 0;
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    for (const m of graph.adjacency[n]) {
      if (depth[m] >= 0) continue;
      depth[m] = depth[n] + 1;
      max = Math.max(max, depth[m]);
      queue.push(m);
    }
  }
  return { depth, max };
}

/**
 * A dependency graph laid out by a force simulation on the GPU. Install waves
 * resolve outwards through it by depth; hovering a package lights it and its
 * direct dependencies, and clicking starts an install from it.
 */
export const startDeps: StartScene = (canvas, hero, callbacks) =>
  runScene(
    canvas,
    hero,
    callbacks,
    ({ gpu, surface: canvasSurface, small, calm, onCleanup }) => {
      const graph = growGraph(small ? 420 : 900);
      const { count } = graph;

      // Start each package next to its dependency so the layout unfolds rather than explodes.
      const initial = new Float32Array(count * 8);
      for (let i = 0; i < count; i++) {
        const parent = graph.adjacency[i].find((n) => n < i);
        const base = parent === undefined ? [0, 0, 0] : Array.from(initial.subarray(parent * 8, parent * 8 + 3));
        const jitter = () => (Math.random() - 0.5) * 0.5;
        initial.set([base[0] + jitter(), base[1] + jitter(), base[2] + jitter(), 1], i * 8);
      }
      const state = pingPongStorage(gpu, count * 32);
      state.read.write(initial);
      state.write.write(initial);

      const offsets = new Uint32Array(count + 1);
      const flat: number[] = [];
      graph.adjacency.forEach((list, i) => {
        offsets[i] = flat.length;
        flat.push(...list);
      });
      offsets[count] = flat.length;
      const offsetsBuffer = storage(gpu, offsets.byteLength, "read");
      offsetsBuffer.write(offsets);
      const neighbours = storage(gpu, flat.length * 4, "read");
      neighbours.write(new Uint32Array(flat));
      const edgeBuffer = storage(gpu, graph.edges.length * 8, "read");
      edgeBuffer.write(new Uint32Array(graph.edges.flat()));

      const info = new Float32Array(count * 4);
      const infoBuffer = storage(gpu, info.byteLength, "read");
      let highlighted: number[] = [];
      let maxDepth = 0;
      const writeInfo = (source: number) => {
        const d = depths(graph, source);
        maxDepth = d.max;
        for (let i = 0; i < count; i++) info.set([d.depth[i], graph.adjacency[i].length, 0, 0], i * 4);
        for (const h of highlighted) info[h * 4 + 2] = 1;
        infoBuffer.write(info);
      };
      writeInfo(0);

      const layout = compute(gpu, layoutShader, {
        label: "deps-layout",
        set: {
          layout_: {
            count,
            dt: 1 / SIM_HZ,
            repel: small ? 0.004 : 0.0022,
            stiffness: 5,
            rest: 0.22,
            centre: 0.5,
            damping: 0.9,
            maxSpeed: 1.2,
          },
          offsets: offsetsBuffer,
          neighbours,
        },
      });

      /* --- camera and draws ----------------------------------------------- */

      const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
      const radius = small ? 7.5 : 6.5;
      const lookAt: [number, number, number] = small ? [0, 1.1, 0] : [0, 0.2, 0];
      const camera = perspectiveCamera({ fov: 45, aspect: aspect(), near: 0.1, far: 60, position: [0, 1.4, radius], target: lookAt });
      // On wide screens the graph sits to the right of the copy.
      const shift = () => (small ? 0 : 0.3);

      let wave = { front: -2, hue: 0 };
      const view = (t: number) => ({
        viewProjection: camera.viewProjection,
        frame: [canvas.clientWidth, canvas.clientHeight, shift(), t],
        wave: [wave.front, 0.45, 0, 0],
        tint: [...PALETTE[wave.hue], 0],
      });
      const bindings = { state: state.read, info: infoBuffer, edges: edgeBuffer };
      const make = (label: string, vertex: string, fragment: string, instances: number, additive = false) =>
        draw(gpu, {
          shader: renderShader,
          label,
          entry: { vertex, fragment },
          instances,
          vertices: 6,
          blend: additive ? { color: { src: "one", dst: "one" }, alpha: { src: "zero", dst: "one" } } : "premultiplied",
          set: { view: view(0), ...bindings },
        });
      const edges = make("deps-edges", "vs_edges", "fs_line", graph.edges.length);
      const bloom = make("deps-bloom", "vs_bloom", "fs_bloom", count, true);
      const nodes = make("deps-nodes", "vs_nodes", "fs_disc", count);

      let mood: [number, number, number, number] = [0.35, 0.45, 0.95, 0];
      const sky = effect(gpu, skyShader, { label: "deps-sky", set: { sky: { frame: [0.78, aspect(), 0, 0], tint: mood } } });

      canvasSurface.onResize(() => camera.set({ aspect: aspect() }));

      /* --- picking -------------------------------------------------------- */

      // A recent copy of the node positions, read back a couple of times a second.
      let positions: Float32Array | null = null;
      let reading = false;
      let lastRead = 0;
      const screenOf = (i: number): [number, number] | null => {
        if (!positions) return null;
        const m = camera.viewProjection;
        const [x, y, z] = [positions[i * 8], positions[i * 8 + 1], positions[i * 8 + 2]];
        const w = m[3] * x + m[7] * y + m[11] * z + m[15];
        if (w <= 0) return null;
        const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w + shift();
        const cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
        return [(cx * 0.5 + 0.5) * canvas.clientWidth, (0.5 - cy * 0.5) * canvas.clientHeight];
      };
      const nearest = (p: [number, number], within: number) => {
        let best = -1;
        let bestD = within * within;
        for (let i = 0; i < count; i++) {
          const s = screenOf(i);
          if (!s) continue;
          const d = (s[0] - p[0]) ** 2 + (s[1] - p[1]) ** 2;
          if (d < bestD) {
            bestD = d;
            best = i;
          }
        }
        return best;
      };

      let hovered = -1;
      const setHover = (i: number) => {
        if (i === hovered) return;
        hovered = i;
        for (const h of highlighted) info[h * 4 + 2] = 0;
        highlighted = i < 0 ? [] : [i, ...graph.adjacency[i]];
        for (const h of highlighted) info[h * 4 + 2] = 1;
        infoBuffer.write(info);
      };

      let sinceWave = 0;
      const startWave = (source: number) => {
        wave = { front: -1, hue: (wave.hue + 1) % PALETTE.length };
        writeInfo(source);
        sinceWave = 0;
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "touch") return;
        setHover(nearest(pointerIn(canvas, e), 22));
      };
      const onLeave = () => setHover(-1);
      const onDown = (e: PointerEvent) => {
        if (onCopy(e)) return;
        const i = nearest(pointerIn(canvas, e), 60);
        startWave(i >= 0 ? i : Math.floor(Math.random() * count));
      };
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener("pointerleave", onLeave, { passive: true });
      hero.addEventListener("pointerdown", onDown, { passive: true });
      onCleanup(() => {
        hero.removeEventListener("pointermove", onMove);
        hero.removeEventListener("pointerleave", onLeave);
        hero.removeEventListener("pointerdown", onDown);
      });

      /* --- loop ----------------------------------------------------------- */

      let elapsed = 0;
      let accumulator = 0;
      startWave(0);

      return {
        stats: () => [
          ["packages", count.toLocaleString("en-GB")],
          ["deps", graph.edges.length.toLocaleString("en-GB")],
          ["depth", wave.front <= maxDepth ? `${Math.max(0, Math.floor(wave.front))}/${maxDepth}` : `${maxDepth}`],
        ],
        tick(frame, dt) {
          elapsed += dt;

          accumulator += dt;
          for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
            accumulator -= 1 / SIM_HZ;
            layout.set({ current: state.read, next: state.write });
            layout.dispatch(Math.ceil(count / 64));
            state.swap();
          }
          if (accumulator > 1 / SIM_HZ) accumulator = 0;

          const now = performance.now();
          if (!reading && now - lastRead > 400) {
            reading = true;
            lastRead = now;
            void state.read
              .read()
              .then((buffer) => (positions = new Float32Array(buffer)))
              .catch(() => undefined)
              .finally(() => (reading = false));
          }

          wave.front += dt * WAVE_SPEED;
          sinceWave += dt;
          if (!calm && sinceWave > WAVE_EVERY) startWave(Math.floor(Math.random() * count));

          const angle = (elapsed / ORBIT) * Math.PI * 2;
          camera.set({ position: [Math.sin(angle) * radius, 1.4, Math.cos(angle) * radius] }).lookAt(lookAt);

          const values = view(elapsed);
          const bound = { view: values, state: state.read };
          edges.set(bound);
          bloom.set(bound);
          nodes.set(bound);

          const c = PALETTE[wave.hue];
          const busy = wave.front <= maxDepth ? 0.4 : 0.12;
          const k = Math.min(1, dt * 0.8);
          const target = [c[0], c[1], c[2], busy];
          mood = mood.map((v, i) => v + (target[i] - v) * k) as typeof mood;
          sky.set({ sky: { frame: [0.78, aspect(), elapsed, 0], tint: mood } });

          frame.pass({ target: canvasSurface, clear: CLEAR }, (pass) => {
            pass.draw(sky);
            pass.draw(edges);
            pass.draw(bloom);
            pass.draw(nodes);
          });
        },
      };
    },
    { maxStorageBuffersInVertexStage: 3 }
  );
