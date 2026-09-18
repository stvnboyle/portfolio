import { compute, draw, effect, storage } from "vgpu";
import sortShader from "./sort.wgsl";
import barsShader from "./sort-render.wgsl";
import skyShader from "./signal-sky.wgsl";
import { PALETTE } from "./packets";
import { onCopy, pointerIn, runScene, type StartScene } from "./scene";
import { CLEAR } from "./signal";

/** Seconds between bitonic passes, so each one can be followed by eye. */
const PASS_INTERVAL = 0.2;
/** How long a finished sort holds before it's shuffled again. */
const HOLD = 2.6;
/** Keys a click shuffles around the pointer. */
const CLICK_BLOCK = 32;

type Pass = { j: number; k: number };

/** Every compare-exchange pass of a bitonic sort over n (a power of two) keys. */
function bitonicPasses(n: number): Pass[] {
  const passes: Pass[] = [];
  for (let k = 2; k <= n; k *= 2) for (let j = k / 2; j >= 1; j /= 2) passes.push({ j, k });
  return passes;
}

/**
 * A bitonic sort — the GPU's native sorting network — run one pass at a time
 * so it can be watched. Keys that move flash the pass's colour; a finished
 * sort holds, then gets shuffled and sorted again. Clicking shuffles the keys
 * under the pointer.
 */
export const startSort: StartScene = (canvas, hero, callbacks) =>
  runScene(
    canvas,
    hero,
    callbacks,
    ({ gpu, surface: canvasSurface, small, onCleanup }) => {
      const n = small ? 128 : 512;
      const passes = bitonicPasses(n);
      const stages = Math.log2(n);

      // Start from a random permutation at zero height, so the bars grow in.
      const initial = new Float32Array(n * 4);
      const order = Array.from({ length: n }, (_, i) => (i + 1) / n).sort(() => Math.random() - 0.5);
      order.forEach((v, i) => initial.set([v, 0, 0, 0], i * 4));
      const keys = storage(gpu, n * 16);
      keys.write(initial);

      const kernel = (entry: string) =>
        compute(gpu, sortShader, {
          label: `sort-${entry}`,
          entry,
          set: { sort: { n, j: 1, k: 2, lo: 0, hi: n, seed: 0, hue: 0, ease: 0.1, fade: 0.95 }, keys },
        });
      const bitonic = kernel("bitonic");
      const shuffle = kernel("shuffle");
      const relax = kernel("relax");
      const groups = Math.ceil(n / 64);

      const px = () => canvasSurface.size;
      const dpr = () => px()[1] / Math.max(1, canvas.clientHeight);
      const area = () => {
        const [w, h] = px();
        const inset = small ? 16 * dpr() : Math.max(24 * dpr(), w * 0.04);
        return [inset, w - inset, h * 0.8, h * (small ? 0.26 : 0.3)];
      };
      const pointer = { x: -1e4, strength: 0, target: 0 };
      const uniforms = (t: number) => ({
        frame: [px()[0], px()[1], n, t],
        area: area(),
        pointer: [pointer.x, pointer.strength, 0, 0],
        palette: PALETTE.map((c) => [...c, 0]),
      });
      const barsDraw = (entry: "bars" | "reflect") =>
        draw(gpu, {
          shader: barsShader,
          label: `sort-${entry}`,
          entry: { vertex: `vs_${entry}`, fragment: `fs_${entry}` },
          instances: n,
          vertices: 6,
          blend: "premultiplied",
          set: { bars: uniforms(0), keys },
        });
      const bars = barsDraw("bars");
      const reflection = barsDraw("reflect");

      let mood: [number, number, number, number] = [0.35, 0.45, 0.95, 0];
      const sky = effect(gpu, skyShader, { label: "sort-sky", set: { sky: { frame: [0.8, 1, 0, 0], tint: mood } } });

      /* --- state ---------------------------------------------------------- */

      let phase: "sorting" | "holding" = "sorting";
      let next = 0;
      let timer = 0.8;
      let hue = 0;
      let compares = 0;

      const runShuffle = (lo: number, hi: number) => {
        // Several rounds of random pair swaps at shrinking strides mix the block well.
        for (let j = (hi - lo) / 2; j >= 1; j /= 2) {
          shuffle.set({ sort: { lo, hi, j, seed: Math.random() * 1000, hue } });
          shuffle.dispatch(Math.ceil((hi - lo) / 64));
        }
      };
      const restart = () => {
        phase = "sorting";
        next = 0;
        timer = 0.5;
        hue = (hue + 1) % PALETTE.length;
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "touch") return;
        pointer.x = pointerIn(canvas, e)[0] * dpr();
        pointer.target = 1;
      };
      const onLeave = () => (pointer.target = 0);
      const onDown = (e: PointerEvent) => {
        if (onCopy(e)) return;
        const [l, r] = area();
        const index = Math.floor(((pointerIn(canvas, e)[0] * dpr() - l) / (r - l)) * n);
        if (index < 0 || index >= n) return;
        const block = Math.min(CLICK_BLOCK, n);
        const lo = Math.floor(index / block) * block;
        hue = (hue + 1) % PALETTE.length;
        runShuffle(lo, lo + block);
        restart();
      };
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener("pointerleave", onLeave, { passive: true });
      hero.addEventListener("pointerdown", onDown, { passive: true });
      onCleanup(() => {
        hero.removeEventListener("pointermove", onMove);
        hero.removeEventListener("pointerleave", onLeave);
        hero.removeEventListener("pointerdown", onDown);
      });

      let elapsed = 0;

      return {
        stats: () => {
          const pass = passes[Math.min(next, passes.length - 1)];
          return [
            ["keys", n.toLocaleString("en-GB")],
            ["stage", phase === "sorting" ? `${Math.log2(pass.k)}/${stages}` : "sorted"],
            ["compares", compares.toLocaleString("en-GB")],
          ];
        },
        tick(frame, dt, realDt) {
          elapsed += dt;
          timer -= dt;

          if (timer <= 0 && phase === "sorting") {
            const { j, k } = passes[next];
            bitonic.set({ sort: { j, k, hue } });
            bitonic.dispatch(groups);
            compares += n / 2;
            next++;
            timer = PASS_INTERVAL;
            if (next >= passes.length) {
              phase = "holding";
              timer = HOLD;
            }
          } else if (timer <= 0 && phase === "holding") {
            hue = (hue + 1) % PALETTE.length;
            runShuffle(0, n);
            restart();
          }

          relax.set({ sort: { ease: 1 - Math.exp(-dt * 7), fade: Math.exp(-dt * 6) } });
          relax.dispatch(groups);

          pointer.strength += (pointer.target - pointer.strength) * (1 - Math.exp(-realDt * 10));
          const values = uniforms(elapsed);
          bars.set({ bars: values });
          reflection.set({ bars: values });

          // The sky leans towards the colour of the current pass.
          const c = PALETTE[hue];
          const target = [c[0], c[1], c[2], phase === "sorting" ? 0.45 : 0.15];
          const k = Math.min(1, dt * 0.8);
          mood = mood.map((v, i) => v + (target[i] - v) * k) as typeof mood;
          const [, h] = px();
          sky.set({ sky: { frame: [area()[2] / h, px()[0] / h, elapsed, 0], tint: mood } });

          frame.pass({ target: canvasSurface, clear: CLEAR }, (pass) => {
            pass.draw(sky);
            pass.draw(reflection);
            pass.draw(bars);
          });
        },
      };
    },
    { maxStorageBuffersInVertexStage: 1 }
  );
