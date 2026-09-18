import { compute, draw, effect, pingPongStorage } from "vgpu";
import { perspectiveCamera } from "vgpu/scene";
import fieldShader from "./signal-field.wgsl";
import renderShader from "./signal-render.wgsl";
import skyShader from "./signal-sky.wgsl";
import {
  CAMERA,
  CURSOR,
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
import { onCopy, runScene, vec4s, type StartScene } from "./scene";

export const CLEAR: [number, number, number, number] = [0.039, 0.039, 0.043, 1];
/** Height a fully lit node rises by, in world units. */
const LIFT = 0.045;

/**
 * The signal field: packets travel a perspective grid of nodes like signals
 * through a mesh, painting a glow field that decays and bleeds between nodes.
 */
export const startSignalField: StartScene = (canvas, hero, callbacks) =>
  runScene(
    canvas,
    hero,
    callbacks,
    ({ gpu, surface: canvasSurface, calm, small, onCleanup }) => {
      const grid = small ? GRID_MOBILE : GRID_DESKTOP;
      const nodes = grid.gx * grid.gz;

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

      // The hover spotlight eases after the pointer; `target` is null off the plane.
      const cursor = { x: 0, z: 0, strength: 0, target: null as { x: number; z: number } | null };
      const cursorUniforms = () => ({
        cursor: [cursor.x, cursor.z, cursor.strength * CURSOR.strength, CURSOR.radius],
        cursorTint: [...packets.currentColor, 0],
      });

      const view = () => ({
        viewProjection: camera.viewProjection,
        lens: lensValues,
        grid: [grid.gx, grid.gz, grid.width, DEPTH],
        shape: [NEAR_Z, 0, LIFT, canvasSurface.size[1]],
        ...cursorUniforms(),
      });
      // Where the far edge of the plane meets the sky, in top-origin UV.
      const horizon = () => {
        const m = camera.viewProjection;
        const far = [0, 0, NEAR_Z - DEPTH * 0.9];
        const y = m[1] * far[0] + m[5] * far[1] + m[9] * far[2] + m[13];
        const w = m[3] * far[0] + m[7] * far[1] + m[11] * far[2] + m[15];
        return 0.5 - 0.5 * (y / w);
      };
      let elapsed = 0;
      let mood = packets.mood();
      const sky = effect(gpu, skyShader, {
        label: "signal-sky",
        set: { sky: { frame: [horizon(), aspect(), 0, 0], tint: mood } },
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
        sky.set({ sky: { frame: [horizon(), aspect(), elapsed, 0] } });
      });

      /* --- input ---------------------------------------------------------- */

      let lastTrail = 0;
      let trailFrom: { x: number; z: number } | null = null;
      let lastActivity = performance.now();
      let lastIdleEmit = 0;
      let lastIdleBurst = 0;

      const cellAt = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        return screenToCell(ndcX, ndcY, rect.width / rect.height, grid);
      };
      // The pointer carries a spotlight, and moving it lets out packets that head
      // the way it's going. Pressing sends a burst.
      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "touch") return;
        const now = performance.now();
        lastActivity = now;
        const cell = cellAt(e);
        if (!cell) {
          cursor.target = null;
          return;
        }
        if (!cursor.target && cursor.strength < 0.01) {
          cursor.x = cell.x;
          cursor.z = cell.z;
        }
        cursor.target = cell;

        trailFrom ??= cell;
        const dx = cell.x - trailFrom.x;
        const dz = cell.z - trailFrom.z;
        if (now - lastTrail < 140 || Math.hypot(dx, dz) < 1.5) return;
        lastTrail = now;
        trailFrom = cell;
        const axis: [number, number] = Math.abs(dx) > Math.abs(dz) ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
        packets.emit(cell.x, cell.z, axis);
      };
      const onLeave = () => {
        cursor.target = null;
        trailFrom = null;
      };
      const onDown = (e: PointerEvent) => {
        lastActivity = performance.now();
        if (onCopy(e)) return;
        const cell = cellAt(e);
        if (cell) packets.burst(cell.x, cell.z);
      };
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener("pointerleave", onLeave, { passive: true });
      hero.addEventListener("pointerdown", onDown, { passive: true });
      onCleanup(() => {
        hero.removeEventListener("pointermove", onMove);
        hero.removeEventListener("pointerleave", onLeave);
        hero.removeEventListener("pointerdown", onDown);
      });

      // Something to look at before anyone touches it.
      packets.burst(grid.gx * 0.42, grid.gz * 0.16);
      packets.burst(grid.gx * 0.64, grid.gz * 0.28);

      /* --- loop ----------------------------------------------------------- */

      let accumulator = 0;

      return {
        stats: () => [
          ["nodes", nodes.toLocaleString("en-GB")],
          ["packets", String(packets.count)],
        ],
        tick(frame, dt, realDt) {
          elapsed += dt;
          const now = performance.now();

          // Left alone, the mesh keeps a light, steady flow of its own.
          const idle = now - lastActivity > 2500;
          if (!calm && idle && now - lastIdleEmit > 1400) {
            lastIdleEmit = now;
            packets.emit(grid.gx * (0.2 + Math.random() * 0.6), grid.gz * (0.05 + Math.random() * 0.4));
          }
          if (!calm && idle && now - lastIdleBurst > 5500) {
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

          // Follow the pointer on the display's clock, not the sim's, so hover stays snappy.
          if (cursor.target) {
            const follow = 1 - Math.exp(-realDt * CURSOR.follow);
            cursor.x += (cursor.target.x - cursor.x) * follow;
            cursor.z += (cursor.target.z - cursor.z) * follow;
          }
          const fade = cursor.target ? 1 - Math.exp(-realDt * 14) : 1 - Math.exp(-realDt * 4);
          cursor.strength += ((cursor.target ? 1 : 0) - cursor.strength) * fade;

          lensValues[3] = elapsed;
          bloom.set({ view: { lens: lensValues, ...cursorUniforms() }, glow: glow.read });
          dots.set({ view: { lens: lensValues, ...cursorUniforms() }, glow: glow.read });
          // Ease the sky's tint towards the packets, so it shifts rather than flickers.
          const target = packets.mood();
          const k = Math.min(1, dt * 0.8);
          mood = mood.map((v, i) => v + (target[i] - v) * k) as typeof mood;
          sky.set({ sky: { frame: [horizon(), aspect(), elapsed, 0], tint: mood } });

          frame.pass({ target: canvasSurface, clear: CLEAR }, (pass) => {
            pass.draw(sky);
            pass.draw(bloom);
            pass.draw(dots);
          });
        },
      };
    },
    // Both render passes read the glow field from storage in the vertex stage.
    { maxStorageBuffersInVertexStage: 1 }
  );
