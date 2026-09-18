import { compute, draw, effect, pingPongStorage } from "vgpu";
import swarmShader from "./agents.wgsl";
import renderShader from "./agents-render.wgsl";
import skyShader from "./signal-sky.wgsl";
import { PALETTE } from "./packets";
import { onCopy, pointerIn, runScene, type StartScene } from "./scene";
import { CLEAR } from "./signal";

type Rgb = [number, number, number];

/** Mirrors the task array lengths in agents.wgsl and agents-render.wgsl. */
const MAX_TASKS = 8;
const SIM_HZ = 60;

type Task = { x: number; y: number; radius: number; life: number; age: number; color: Rgb; burst: number; done: boolean };

/**
 * A swarm of agents on the GPU. They flock with their neighbours, pick up
 * tasks that appear across the hero, circle them while they work, and take on
 * the task's colour; finished tasks ring out and release them. The pointer
 * draws curious agents in, and clicking posts a task.
 */
export const startAgents: StartScene = (canvas, hero, callbacks) =>
  runScene(
    canvas,
    hero,
    callbacks,
    ({ gpu, surface: canvasSurface, small, calm, onCleanup }) => {
      const count = small ? 600 : 1536;
      const size = () => [canvas.clientWidth, canvas.clientHeight] as const;

      const initial = new Float32Array(count * 8);
      for (let i = 0; i < count; i++) {
        const [w, h] = size();
        const angle = Math.random() * Math.PI * 2;
        initial.set([Math.random() * w, Math.random() * h, Math.cos(angle) * 40, Math.sin(angle) * 40], i * 8);
        initial.set([0.5, 0.52, 0.6, 0], i * 8 + 4);
      }
      const state = pingPongStorage(gpu, count * 32);
      state.read.write(initial);
      state.write.write(initial);

      const pointer = { x: -1e4, y: -1e4, presence: 0, target: 0 };
      const swarmValues = () => ({
        count,
        tasks: MAX_TASKS,
        dt: 1 / SIM_HZ,
        near: 9,
        sight: 34,
        minSpeed: 24,
        maxSpeed: 58,
        fade: 2.5,
        world: size(),
        pointer: [pointer.x, pointer.y, 0, pointer.presence],
      });

      let tasks: Array<Task | null> = Array.from({ length: MAX_TASKS }, () => null);
      const strength = (t: Task | null) =>
        !t || t.done ? 0 : Math.min(1, t.age * 1.5) * Math.min(1, (t.life - t.age) * 2);
      const taskValues = () => ({
        at: tasks.map((t) => (t ? [t.x, t.y, t.radius, strength(t)] : [0, 0, 1, 0])),
        tint: tasks.map((t) => (t ? [...t.color, 0] : [0, 0, 0, 0])),
      });

      const swarm = compute(gpu, swarmShader, {
        label: "agents-swarm",
        set: { swarm: swarmValues(), tasks: taskValues() },
      });

      const view = (t: number) => ({ frame: [...size(), 7, t] });
      const renderTasks = () => ({
        ...taskValues(),
        progress: tasks.map((t) => (t ? [Math.min(1, t.age / t.life), t.burst, 0, 0] : [0, 0, 0, 0])),
      });
      const agents = draw(gpu, {
        shader: renderShader,
        label: "agents",
        entry: { vertex: "vs_agents", fragment: "fs_agents" },
        instances: count,
        vertices: 6,
        blend: "premultiplied",
        set: { view: view(0), agents: state.read, tasks: renderTasks() },
      });
      const rings = draw(gpu, {
        shader: renderShader,
        label: "agent-tasks",
        entry: { vertex: "vs_tasks", fragment: "fs_tasks" },
        instances: MAX_TASKS,
        vertices: 6,
        blend: "premultiplied",
        set: { view: view(0), agents: state.read, tasks: renderTasks() },
      });

      let mood: [number, number, number, number] = [0.35, 0.45, 0.95, 0];
      const aspect = () => size()[0] / Math.max(1, size()[1]);
      const sky = effect(gpu, skyShader, { label: "agents-sky", set: { sky: { frame: [1.05, aspect(), 0, 0], tint: mood } } });

      /* --- tasks ---------------------------------------------------------- */

      let colorIndex = Math.floor(Math.random() * PALETTE.length);
      let completed = 0;
      const post = (x: number, y: number) => {
        let slot = tasks.findIndex((t) => t === null);
        if (slot < 0) {
          // Replace whichever task is furthest along.
          slot = tasks.reduce((best, t, i) => (t && t.age / t.life > (tasks[best]?.age ?? 0) / (tasks[best]?.life ?? 1) ? i : best), 0);
        }
        colorIndex = (colorIndex + 1) % PALETTE.length;
        tasks[slot] = {
          x,
          y,
          radius: 16 + Math.random() * 8,
          life: 7 + Math.random() * 4,
          age: 0,
          color: PALETTE[colorIndex],
          burst: 0,
          done: false,
        };
      };
      // Somewhere clear of the copy in the top left.
      const postRandom = () => {
        const [w, h] = size();
        for (let tries = 0; tries < 12; tries++) {
          const x = w * (0.08 + Math.random() * 0.84);
          const y = h * (small ? 0.55 + Math.random() * 0.3 : 0.2 + Math.random() * 0.62);
          if (!small && x < w * 0.55 && y < h * 0.6) continue;
          return post(x, y);
        }
      };

      const onMove = (e: PointerEvent) => {
        if (e.pointerType === "touch") return;
        [pointer.x, pointer.y] = pointerIn(canvas, e);
        pointer.target = 1;
      };
      const onLeave = () => (pointer.target = 0);
      const onDown = (e: PointerEvent) => {
        if (onCopy(e)) return;
        const [x, y] = pointerIn(canvas, e);
        post(x, y);
      };
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener("pointerleave", onLeave, { passive: true });
      hero.addEventListener("pointerdown", onDown, { passive: true });
      onCleanup(() => {
        hero.removeEventListener("pointermove", onMove);
        hero.removeEventListener("pointerleave", onLeave);
        hero.removeEventListener("pointerdown", onDown);
      });

      postRandom();
      postRandom();

      /* --- loop ----------------------------------------------------------- */

      let elapsed = 0;
      let accumulator = 0;
      let nextPost = 1.5;

      return {
        stats: () => [
          ["agents", count.toLocaleString("en-GB")],
          ["tasks", `${tasks.filter((t) => t && !t.done).length} open`],
          ["done", completed.toLocaleString("en-GB")],
        ],
        tick(frame, dt, realDt) {
          elapsed += dt;

          nextPost -= dt;
          const open = tasks.filter((t) => t && !t.done).length;
          if (nextPost <= 0) {
            if (!calm && open < (small ? 2 : 4)) postRandom();
            nextPost = 2 + Math.random() * 2;
          }
          tasks = tasks.map((t) => {
            if (!t) return null;
            t.age += dt;
            if (!t.done && t.age >= t.life) {
              t.done = true;
              completed++;
            }
            if (t.done) t.burst += dt / 1.4;
            return t.burst >= 1 ? null : t;
          });

          pointer.presence += (pointer.target - pointer.presence) * (1 - Math.exp(-realDt * 6));
          swarm.set({ swarm: swarmValues(), tasks: taskValues() });
          accumulator += dt;
          for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
            accumulator -= 1 / SIM_HZ;
            swarm.set({ current: state.read, next: state.write });
            swarm.dispatch(Math.ceil(count / 64));
            state.swap();
          }
          if (accumulator > 1 / SIM_HZ) accumulator = 0;

          const bound = { view: view(elapsed), agents: state.read, tasks: renderTasks() };
          agents.set(bound);
          rings.set(bound);

          // The sky takes on the colours of the open tasks.
          const live = tasks.filter((t): t is Task => Boolean(t && !t.done));
          const target: [number, number, number, number] = live.length
            ? [
                live.reduce((s, t) => s + t.color[0], 0) / live.length,
                live.reduce((s, t) => s + t.color[1], 0) / live.length,
                live.reduce((s, t) => s + t.color[2], 0) / live.length,
                Math.min(1, live.length / 5),
              ]
            : [0.35, 0.45, 0.95, 0];
          const k = Math.min(1, dt * 0.6);
          mood = mood.map((v, i) => v + (target[i] - v) * k) as typeof mood;
          sky.set({ sky: { frame: [1.05, aspect(), elapsed, 0], tint: mood } });

          frame.pass({ target: canvasSurface, clear: CLEAR }, (pass) => {
            pass.draw(sky);
            pass.draw(rings);
            pass.draw(agents);
          });
        },
      };
    },
    { maxStorageBuffersInVertexStage: 1 }
  );
