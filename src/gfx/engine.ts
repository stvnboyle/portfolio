import { clock, compute, draw, frameLoop, init, pingPongStorage, surface } from "vgpu";
import type { FrameLoopHandle, Gpu } from "vgpu";
import { perspectiveCamera } from "vgpu/scene";
import fieldShader from "./signal-field.wgsl";
import renderShader from "./signal-render.wgsl";
import {
  CAMERA,
  DEPTH,
  GLOW_BLEED,
  GLOW_DECAY,
  GRID_DESKTOP,
  GRID_MOBILE,
  MAX_PACKETS,
  NEAR_Z,
  PACKET_RADIUS,
  SIM_HZ,
  screenToCell,
} from "./field";
import { PacketSystem } from "./packets";

const CLEAR: [number, number, number, number] = [0.039, 0.039, 0.043, 1];
/** Height a fully lit node rises by, in world units. */
const LIFT = 0.045;

export type FieldStatus = { nodes: number; packets: number; fps: number };

type Callbacks = {
  onLive(): void;
  onStatus(status: FieldStatus): void;
  onUnsupported(reason: string): void;
};

/** Splits a flat Float32Array into the vec4 tuples a uniform array expects. */
function vec4s(data: Float32Array): number[][] {
  return Array.from({ length: data.length / 4 }, (_, i) => Array.from(data.subarray(i * 4, i * 4 + 4)));
}

/**
 * Starts the signal field on `canvas`, taking pointer input from `hero`.
 * Returns a teardown function, safe to call before startup has finished.
 */
export function startSignalField(canvas: HTMLCanvasElement, hero: HTMLElement, callbacks: Callbacks): () => void {
  let disposed = false;
  let gpu: Gpu | undefined;
  let loop: FrameLoopHandle | undefined;
  const cleanups: Array<() => void> = [];

  void (async () => {
    try {
      // Both render passes read the glow field from storage in the vertex stage.
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
    const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const camera = perspectiveCamera({
      fov: CAMERA.fovDegrees,
      aspect: aspect(),
      near: 0.1,
      far: 60,
      position: CAMERA.position,
      target: CAMERA.target,
    });
    const lens = (): [number, number, number, number] => {
      const p11 = 1 / Math.tan((CAMERA.fovDegrees * Math.PI) / 360);
      return [p11 / aspect(), p11, grid.pointSize, 0];
    };
    let lensValues = lens();

    const packets = new PacketSystem(grid);
    const glow = pingPongStorage(gpu, nodes * 16);
    const field = compute(gpu, fieldShader, {
      label: "signal-field",
      set: {
        field: {
          gx: grid.gx,
          gz: grid.gz,
          count: MAX_PACKETS,
          decay: GLOW_DECAY,
          bleed: GLOW_BLEED,
          radius: PACKET_RADIUS,
        },
        packets: { head: vec4s(packets.head), tint: vec4s(packets.tint) },
      },
    });

    const view = () => ({
      viewProjection: camera.viewProjection,
      lens: lensValues,
      grid: [grid.gx, grid.gz, grid.width, DEPTH],
      shape: [NEAR_Z, 0, LIFT, canvasSurface.size[1]],
    });
    const bloom = draw(gpu, {
      shader: renderShader,
      label: "signal-bloom",
      entry: { vertex: "vs_bloom", fragment: "fs_bloom" },
      instances: nodes,
      vertices: 6,
      blend: { color: { src: "one", dst: "one" }, alpha: { src: "zero", dst: "one" } },
      set: { view: view(), glow: glow.read },
    });
    const dots = draw(gpu, {
      shader: renderShader,
      label: "signal-dots",
      entry: { vertex: "vs_dots", fragment: "fs_dots" },
      instances: nodes,
      vertices: 6,
      blend: "premultiplied",
      set: { view: view(), glow: glow.read },
    });

    canvasSurface.onResize(() => {
      camera.set({ aspect: aspect() });
      lensValues = lens();
      bloom.set({ view: view() });
      dots.set({ view: view() });
    });

    /* --- input ------------------------------------------------------------ */

    let lastTrail = 0;
    let lastActivity = performance.now();
    let lastIdleEmit = 0;
    let lastIdleBurst = 0;

    const cellAt = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      return screenToCell(ndcX, ndcY, rect.width / rect.height, grid);
    };
    // Moving the pointer lets out a packet now and then; pressing sends a burst.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const now = performance.now();
      lastActivity = now;
      if (now - lastTrail < 220) return;
      const cell = cellAt(e);
      if (!cell) return;
      lastTrail = now;
      packets.emit(cell.x, cell.z);
    };
    const onDown = (e: PointerEvent) => {
      lastActivity = performance.now();
      const cell = cellAt(e);
      if (cell) packets.burst(cell.x, cell.z);
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

    // Something to look at before anyone touches it.
    packets.burst(grid.gx * 0.42, grid.gz * 0.16);
    packets.burst(grid.gx * 0.64, grid.gz * 0.28);

    /* --- loop ------------------------------------------------------------- */

    const time = clock(gpu);
    const speed = calm ? 0.3 : 1;
    let elapsed = 0;
    let accumulator = 0;
    let frames = 0;
    let windowStart = performance.now();
    let live = false;

    loop = frameLoop(gpu, (frame) => {
      if (!onScreen) return;
      const dt = Math.min(time.deltaTime, 0.1) * speed;
      elapsed += dt;
      const now = performance.now();

      // Left alone, the mesh keeps a light, steady flow of its own.
      const idle = now - lastActivity > 2500;
      if (!calm && idle && now - lastIdleEmit > 700) {
        lastIdleEmit = now;
        packets.emit(grid.gx * (0.2 + Math.random() * 0.6), grid.gz * (0.05 + Math.random() * 0.4));
      }
      if (!calm && idle && now - lastIdleBurst > 3800) {
        lastIdleBurst = now;
        packets.burst(grid.gx * (0.3 + Math.random() * 0.4), grid.gz * (0.08 + Math.random() * 0.3));
      }

      // Fixed-rate simulation, independent of the display's refresh rate.
      accumulator += dt;
      for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
        accumulator -= 1 / SIM_HZ;
        packets.step(1 / SIM_HZ);
        field.set({
          field: { count: packets.count },
          packets: { head: vec4s(packets.head), tint: vec4s(packets.tint) },
          current: glow.read,
          next: glow.write,
        });
        field.dispatch(Math.ceil(grid.gx / 16), Math.ceil(grid.gz / 16));
        glow.swap();
      }
      if (accumulator > 1 / SIM_HZ) accumulator = 0;

      lensValues[3] = elapsed;
      bloom.set({ view: { lens: lensValues }, glow: glow.read });
      dots.set({ view: { lens: lensValues }, glow: glow.read });
      frame.pass({ target: canvasSurface, clear: CLEAR }, (pass) => {
        pass.draw(bloom);
        pass.draw(dots);
      });

      if (!live) {
        live = true;
        callbacks.onLive();
      }
      frames++;
      if (now - windowStart >= 1000) {
        callbacks.onStatus({ nodes, packets: packets.count, fps: Math.round((frames * 1000) / (now - windowStart)) });
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
