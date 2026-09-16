import { clock, compute, draw, frameLoop, init, pingPongStorage, surface } from "vgpu";
import type { FrameLoopHandle, Gpu } from "vgpu";
import { perspectiveCamera } from "vgpu/scene";
import simulateShader from "./wave-simulate.wgsl";
import renderShader from "./wave-render.wgsl";
import {
  CAMERA,
  DAMPING,
  DEPTH,
  FOCUS,
  GRID_DESKTOP,
  GRID_MOBILE,
  MAX_DROPS,
  NEAR_Z,
  SIM_HZ,
  WAVE_C2,
  screenToCell,
  type Drop,
} from "./field";

const CLEAR: [number, number, number, number] = [0.039, 0.039, 0.043, 1];
/** How long the surface waits, untouched, before disturbing itself. */
const IDLE_DROP_MS = 4200;
const NO_DROP: [number, number, number, number] = [0, 0, 1, 0];

export type FieldStatus = { nodes: number; fps: number };

type Callbacks = {
  onLive(): void;
  onStatus(status: FieldStatus): void;
  onUnsupported(reason: string): void;
};

/**
 * Starts the wave field on `canvas`, taking pointer input from `hero`.
 * Returns a teardown function, safe to call before startup has finished.
 */
export function startWaveField(canvas: HTMLCanvasElement, hero: HTMLElement, callbacks: Callbacks): () => void {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      // The render pass reads heights from storage in the vertex stage.
      gpu = await init({ powerPreference: "high-performance", requiredLimits: { maxStorageBuffersInVertexStage: 1 } });
    } catch (error) {
      callbacks.onUnsupported((error as Error).message);
      return;
    }
    if (disposed) return gpu.dispose();

    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 768;
    const grid = small ? GRID_MOBILE : GRID_DESKTOP;
    const nodes = grid.gx * grid.gz;

    const canvasSurface = surface(gpu, canvas, { dpr: [1, 2] });
    const camera = perspectiveCamera({
      fov: CAMERA.fovDegrees,
      aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight),
      near: 0.1,
      far: 60,
      position: CAMERA.position,
      target: CAMERA.target,
    });

    const heights = pingPongStorage(gpu, nodes * 4);
    const step = compute(gpu, simulateShader, {
      label: "wave-step",
      set: {
        sim: { gx: grid.gx, gz: grid.gz, dropCount: 0, damping: DAMPING, c2: WAVE_C2, drops: [NO_DROP, NO_DROP, NO_DROP, NO_DROP] },
      },
    });

    const lens = () => {
      const p11 = 1 / Math.tan((CAMERA.fovDegrees * Math.PI) / 360);
      const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
      return [p11 / aspect, p11, grid.pointSize, 0] as [number, number, number, number];
    };
    let lensValues = lens();

    const field = draw(gpu, {
      shader: renderShader,
      label: "wave-field",
      instances: nodes,
      vertices: 6,
      blend: "premultiplied",
      set: {
        view: {
          viewProjection: camera.viewProjection,
          lens: lensValues,
          grid: [grid.gx, grid.gz, grid.width, DEPTH],
          shape: [NEAR_Z, 1, FOCUS, 0],
        },
        heights: heights.read,
      },
    });

    const onResize = () => {
      camera.set({ aspect: canvas.clientWidth / Math.max(1, canvas.clientHeight) });
      lensValues = lens();
      field.set({ view: { viewProjection: camera.viewProjection, lens: lensValues } });
    };
    canvasSurface.onResize(onResize);

    /* --- input ------------------------------------------------------------ */

    const drops: Drop[] = [];
    let lastWake = 0;
    let lastActivity = performance.now();
    let lastIdle = 0;

    const cellAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      return screenToCell(ndcX, ndcY, rect.width / rect.height, grid);
    };
    // Moving leaves a faint wake; pressing drops something heavier.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = performance.now();
      lastActivity = now;
      if (now - lastWake < 60) return;
      const cell = cellAt(e);
      if (!cell) return;
      lastWake = now;
      drops.push({ ...cell, radius: 2.6, amp: 0.028 });
    };
    const onDown = (e: PointerEvent) => {
      lastActivity = performance.now();
      const cell = cellAt(e);
      if (cell) drops.push({ ...cell, radius: 3.6, amp: 0.3 });
    };
    hero.addEventListener("pointermove", onMove, { passive: true });
    hero.addEventListener("pointerdown", onDown, { passive: true });

    let onScreen = true;
    const visibility = new IntersectionObserver(([entry]) => (onScreen = entry.isIntersecting));
    visibility.observe(hero);

    cleanups.push(() => {
      visibility.disconnect();
      hero.removeEventListener("pointermove", onMove);
      hero.removeEventListener("pointerdown", onDown);
    });

    /* --- loop ------------------------------------------------------------- */

    const time = clock(gpu);
    const speed = calm ? 0.25 : 1;
    let simTime = 0;
    let accumulator = 0;
    let frames = 0;
    let windowStart = performance.now();
    let live = false;

    loop = frameLoop(gpu, (frame) => {
      if (!onScreen) return;
      const dt = Math.min(time.deltaTime, 0.1) * speed;
      simTime += dt;
      const now = performance.now();

      if (!calm && now - lastActivity > IDLE_DROP_MS && now - lastIdle > IDLE_DROP_MS) {
        lastIdle = now;
        drops.push({
          x: grid.gx * (0.3 + Math.random() * 0.4),
          z: grid.gz * (0.06 + Math.random() * 0.26),
          radius: 3.4,
          amp: 0.2,
        });
      }

      // Fixed-rate simulation, independent of the display's refresh rate.
      accumulator += dt;
      for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
        accumulator -= 1 / SIM_HZ;
        const batch = drops.splice(0, MAX_DROPS);
        const packed = Array.from({ length: MAX_DROPS }, (_, i) =>
          batch[i] ? [batch[i].x, batch[i].z, batch[i].radius, batch[i].amp] : NO_DROP
        );
        step.set({ sim: { dropCount: batch.length, drops: packed }, current: heights.read, previous: heights.write });
        step.dispatch(Math.ceil(grid.gx / 16), Math.ceil(grid.gz / 16));
        heights.swap();
      }
      if (accumulator > 1 / SIM_HZ) accumulator = 0;

      lensValues[3] = simTime;
      field.set({ view: { lens: lensValues }, heights: heights.read });
      frame.pass({ target: canvasSurface, clear: CLEAR }, (pass) => pass.draw(field));

      if (!live) {
        live = true;
        callbacks.onLive();
      }
      frames++;
      if (now - windowStart >= 1000) {
        callbacks.onStatus({ nodes, fps: Math.round((frames * 1000) / (now - windowStart)) });
        frames = 0;
        windowStart = now;
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
