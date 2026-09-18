import { compute, draw, effect, pingPongStorage, storage } from "vgpu";
import swarmShader from "./agents.wgsl";
import renderShader from "./agents-render.wgsl";
import skyShader from "./sky.wgsl";
import { PALETTE } from "./palette";
import { onCopy, pointerIn, runScene, type StartScene } from "./scene";
import { MAX_STRAYS, StrayLayer } from "./strays";

/** Mirrors the task array lengths in agents.wgsl and agents-render.wgsl. */
const MAX_TASKS = 8;
const SIM_HZ = 60;
/** vec4s of state per agent: motion, tint, info. Mirrors agents.wgsl. */
const STRIDE = 3;
/** Tasks nobody picks up are dropped after this long. */
const ABANDON_AFTER = 30;
/** Share of a finished task's crew that carries its colour to the next task, and for how long. */
const HANDOFF_SHARE = 0.4;
const HANDOFF_SECONDS = 5;
/** How often the CPU reads back counts and exits. */
const READBACK_MS = 120;
/** Bytes in the per-step counts: 8 task worker counts, alive, leaving, spawn ticket, padding. */
const COUNTS_BYTES = 48;
/** Bytes in the Exits struct: an atomic count, padded to 16, then four vec4s (two exits). */
const EXITS_BYTES = 80;
const MAX_EXITS = 2;

/**
 * Kinds of work. Each has its own colour, how long it takes a full crew, how
 * big a crew counts as full, and how often it turns up.
 */
const TASK_TYPES = [
  { kind: "feature", color: PALETTE[0], seconds: 14, crew: 36, radius: 22, weight: 3 },
  { kind: "bug", color: PALETTE[2], seconds: 6, crew: 18, radius: 16, weight: 3 },
  { kind: "refactor", color: PALETTE[1], seconds: 10, crew: 28, radius: 19, weight: 2 },
  { kind: "review", color: PALETTE[3], seconds: 4, crew: 10, radius: 14, weight: 2 },
  { kind: "tests", color: PALETTE[5], seconds: 7, crew: 16, radius: 15, weight: 2 },
  { kind: "incident", color: PALETTE[4], seconds: 5, crew: 44, radius: 21, weight: 1 },
] as const;

type TaskType = (typeof TASK_TYPES)[number];

function pickType(): TaskType {
  let r = Math.random() * TASK_TYPES.reduce((sum, t) => sum + t.weight, 0);
  for (const type of TASK_TYPES) if ((r -= type.weight) <= 0) return type;
  return TASK_TYPES[0];
}

type Task = {
  id: number;
  type: TaskType;
  x: number;
  y: number;
  age: number;
  progress: number;
  workers: number;
  /** Set once finished (or dropped); drives the fade-out ring. */
  closed: "done" | "dropped" | null;
  burst: number;
  label: HTMLElement;
};

type Handoff = { to: Task; until: number } | null;

/**
 * A swarm of agents on the GPU. They flock with their neighbours, pick up
 * tasks — features, bugs, reviews and so on, each taking its own time — circle
 * them while they work, and take on the task's colour. A task only moves
 * forward while agents are actually on it (the GPU counts them each step), and
 * when it's done part of its crew carries the colour on to the next task.
 *
 * Agents drift off the sides for good and new squads arrive from the edges, so
 * the population ebbs and flows. Now and then one is let out of the bottom: it
 * heads down over the page on the same canvas, then a 2D layer carries it on.
 */
export const startAgents: StartScene = (canvas, hero, callbacks) =>
  runScene(
    canvas,
    hero,
    callbacks,
    ({ gpu, surface: canvasSurface, small, calm, onCleanup }) => {
      const capacity = small ? 760 : 2400;
      // The population drifts around this, gently rising and falling over minutes.
      const baseline = small ? 540 : 1650;
      // The hero is the world; the canvas runs on below it over the page.
      const world = () => [hero.clientWidth, hero.clientHeight] as const;
      const canvasSize = () => [canvas.clientWidth, canvas.clientHeight] as const;
      const apron = () => Math.max(0, canvas.clientHeight - hero.clientHeight);

      const initial = new Float32Array(capacity * STRIDE * 4);
      for (let i = 0; i < capacity; i++) {
        const [w, h] = world();
        const angle = Math.random() * Math.PI * 2;
        const o = i * STRIDE * 4;
        initial.set([Math.random() * w, Math.random() * h, Math.cos(angle) * 40, Math.sin(angle) * 40], o);
        initial.set([0.5, 0.52, 0.6, 0], o + 4);
        initial.set([i < baseline ? 1 : 0, -1, 0, 0], o + 8);
      }
      const state = pingPongStorage(gpu, capacity * STRIDE * 16);
      state.read.write(initial);
      state.write.write(initial);

      // GPU → CPU feedback: per-step counts, and leavers reaching the end of the canvas.
      const counts = storage(gpu, COUNTS_BYTES);
      const noCounts = new Uint32Array(COUNTS_BYTES / 4);
      const exits = storage(gpu, EXITS_BYTES);
      const noExits = new Uint8Array(EXITS_BYTES);
      exits.write(noExits);
      // Starts shut (non-zero); writing 0 lets the next agent at the bottom edge out.
      const gate = storage(gpu, 4);
      gate.write(new Uint32Array([1]));

      const pointer = { x: -1e4, y: -1e4, presence: 0, target: 0 };
      let exitBudget = MAX_EXITS;
      let spawn = { budget: 0, at: [0, 0, 0, 0] };
      const swarmValues = () => ({
        capacity,
        tasks: MAX_TASKS,
        dt: 1 / SIM_HZ,
        near: 10,
        sight: 38,
        minSpeed: 24,
        maxSpeed: 58,
        fade: 2.5,
        exitBudget,
        spawnBudget: spawn.budget,
        seed: Math.random() * 100,
        world: world(),
        apron: apron(),
        spawnAt: spawn.at,
        pointer: [pointer.x, pointer.y, 0, pointer.presence],
      });

      let tasks: Array<Task | null> = Array.from({ length: MAX_TASKS }, () => null);
      const handoffs: Handoff[] = Array.from({ length: MAX_TASKS }, () => null);
      let elapsed = 0;

      const strength = (t: Task | null) => (!t || t.closed ? 0 : Math.min(1, t.age * 1.5));
      const taskValues = () => ({
        at: tasks.map((t) => (t ? [t.x, t.y, t.type.radius, strength(t)] : [0, 0, 1, 0])),
        tint: tasks.map((t) => (t ? [...t.type.color, 0] : [0, 0, 0, 0])),
        handoff: handoffs.map((h) => (h ? [h.to.x, h.to.y, 1, HANDOFF_SHARE] : [0, 0, 0, 0])),
      });

      const swarm = compute(gpu, swarmShader, {
        label: "agents-swarm",
        set: { swarm: swarmValues(), tasks: taskValues(), counts, exits, gate },
      });

      // The copy's box in canvas pixels, so idle agents can dim over it.
      let copyBox = [0, 0, 0, 0];
      const measureCopy = () => {
        const origin = canvas.getBoundingClientRect();
        const boxes = [...hero.querySelectorAll(".hero__inner > *")].map((el) => el.getBoundingClientRect());
        if (!boxes.length) return;
        copyBox = [
          Math.min(...boxes.map((b) => b.left)) - origin.left,
          Math.min(...boxes.map((b) => b.top)) - origin.top,
          Math.max(...boxes.map((b) => b.right)) - origin.left,
          Math.max(...boxes.map((b) => b.bottom)) - origin.top,
        ];
      };
      measureCopy();
      canvasSurface.onResize(measureCopy);

      const view = (t: number) => ({ frame: [...canvasSize(), 7, t], copy: copyBox });
      const renderTasks = () => {
        const { at, tint } = taskValues();
        return {
          at,
          tint,
          // Dropped tasks just fade; only finished ones ring out.
          progress: tasks.map((t) => (t ? [t.progress, t.closed === "dropped" ? 0 : t.burst, 0, 0] : [0, 0, 0, 0])),
        };
      };
      const agents = draw(gpu, {
        shader: renderShader,
        label: "agents",
        entry: { vertex: "vs_agents", fragment: "fs_agents" },
        instances: capacity,
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
      const skyFrame = (t: number) => {
        const [w, h] = world();
        return [1.05, w / Math.max(1, h), t, h / Math.max(1, canvasSize()[1])];
      };
      const sky = effect(gpu, skyShader, { label: "agents-sky", set: { sky: { frame: skyFrame(0), tint: mood } } });

      /* --- tasks ---------------------------------------------------------- */

      // Labels live in the hero's overlay layer, next to each ring.
      const overlay = hero.querySelector<HTMLElement>(".hero__overlay");
      let nextId = 1;
      let completed = 0;

      const labelText = (t: Task) => {
        const name = `#${String(t.id).padStart(2, "0")} ${t.type.kind}`;
        if (t.closed === "done") return `${name} · done`;
        return `${name} · ${t.workers} ${t.workers === 1 ? "agent" : "agents"}`;
      };

      const post = (x: number, y: number) => {
        let slot = tasks.findIndex((t) => t === null);
        if (slot < 0) {
          // Replace whichever task is furthest along.
          slot = tasks.reduce((best, t, i) => ((t?.progress ?? 0) > (tasks[best]?.progress ?? 0) ? i : best), 0);
          tasks[slot]?.label.remove();
        }
        const type = pickType();
        const label = document.createElement("span");
        label.className = "task-label";
        // Near the right edge the label sits on the ring's left instead.
        if (x > world()[0] - 240) label.dataset.side = "left";
        label.style.cssText = `left:${x}px;top:${y}px;--tone:rgb(${type.color.map((c) => Math.round(c * 255)).join(" ")})`;
        overlay?.append(label);
        const task: Task = { id: nextId++, type, x, y, age: 0, progress: 0, workers: 0, closed: null, burst: 0, label };
        label.textContent = labelText(task);
        tasks[slot] = task;
      };
      // Somewhere clear of the copy in the top left.
      const postRandom = () => {
        const [w, h] = world();
        for (let tries = 0; tries < 12; tries++) {
          const x = w * (0.1 + Math.random() * 0.8);
          const y = h * (small ? 0.55 + Math.random() * 0.25 : 0.2 + Math.random() * 0.58);
          if (!small && x < w * 0.55 && y < h * 0.6) continue;
          return post(x, y);
        }
      };
      // A finished task sends part of its crew on to the nearest open task.
      const handOff = (slot: number, from: Task) => {
        const open = tasks.filter((t): t is Task => Boolean(t && !t.closed && t !== from));
        if (!open.length) return;
        const distance = (t: Task) => Math.hypot(t.x - from.x, t.y - from.y);
        const to = open.reduce((a, b) => (distance(a) < distance(b) ? a : b));
        handoffs[slot] = { to, until: elapsed + HANDOFF_SECONDS };
      };

      /* --- population ----------------------------------------------------- */

      let alive = baseline;
      let leaving = 0;
      let nextSquad = 2;
      let nextLeave = 4;

      /* --- strays --------------------------------------------------------- */

      const strays = new StrayLayer();
      let reading = false;
      let lastRead = 0;

      const readBack = () => {
        reading = true;
        const started = performance.now();
        void Promise.all([counts.read(), exits.read()])
          .then(([c, e]) => {
            const values = new Uint32Array(c);
            tasks.forEach((t, i) => {
              if (t) t.workers = t.closed ? 0 : values[i];
            });
            alive = values[8];
            leaving = values[9];

            const exited = Math.min(new Uint32Array(e, 0, 1)[0], MAX_EXITS);
            if (!exited) return;
            exits.write(noExits);
      // Starts shut (non-zero); writing 0 lets the next agent at the bottom edge out.
      const gate = storage(gpu, 4);
      gate.write(new Uint32Array([1]));
            // Carry each leaver on from the bottom of the canvas, where it will be by now.
            const late = (performance.now() - started) / 1000 + READBACK_MS / 2000;
            const rect = canvas.getBoundingClientRect();
            const items = new Float32Array(e, 16, 16);
            for (let k = 0; k < exited; k++) {
              const [x, , vx, vy, r, g, b, tint] = items.subarray(k * 8, k * 8 + 8);
              strays.release(
                rect.left + window.scrollX + x + vx * late,
                rect.bottom + window.scrollY + Math.max(vy, 10) * late,
                vx,
                vy,
                [r, g, b],
                tint
              );
            }
          })
          .catch(() => undefined)
          .finally(() => (reading = false));
      };

      /* --- input ---------------------------------------------------------- */

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
        for (const t of tasks) t?.label.remove();
        strays.dispose();
      });

      postRandom();
      postRandom();

      /* --- loop ----------------------------------------------------------- */

      let accumulator = 0;
      let nextPost = 1.5;
      let sinceMeasure = 0;

      return {
        stats: () => [
          ["agents", alive.toLocaleString("en-GB")],
          ["working", tasks.reduce((sum, t) => sum + (t?.workers ?? 0), 0).toLocaleString("en-GB")],
          ["done", completed.toLocaleString("en-GB")],
        ],
        tick(frame, dt, realDt) {
          elapsed += dt;
          sinceMeasure += realDt;
          if (sinceMeasure > 1) {
            sinceMeasure = 0;
            measureCopy();
          }

          nextPost -= dt;
          if (nextPost <= 0) {
            const open = tasks.filter((t) => t && !t.closed).length;
            if (!calm && open < (small ? 2 : 4)) postRandom();
            nextPost = 2 + Math.random() * 2;
          }

          // Progress comes from agents actually on the task, as counted on the GPU.
          tasks = tasks.map((t, slot) => {
            if (!t) return null;
            t.age += dt;
            if (!t.closed) {
              const { crew, seconds } = t.type;
              t.progress = Math.min(1, t.progress + (dt * Math.min(t.workers, crew)) / (crew * seconds));
              if (t.progress >= 1) {
                t.closed = "done";
                completed++;
                handOff(slot, t);
              } else if (t.age > ABANDON_AFTER && t.progress < 0.05) {
                t.closed = "dropped";
              }
            } else {
              t.burst += dt / 1.4;
            }
            t.label.textContent = labelText(t);
            t.label.style.opacity = String(Math.min(1, t.age * 1.5) * (1 - Math.min(1, t.burst * 1.5)));
            if (t.burst < 1) return t;
            t.label.remove();
            return null;
          });
          // Handoffs end on time, or when the task they were heading for closes.
          handoffs.forEach((h, i) => {
            if (h && (elapsed > h.until || h.to.closed)) handoffs[i] = null;
          });

          // New squads arrive from the top or the sides while the population is below target.
          nextSquad -= dt;
          const target = baseline * (1 + 0.12 * Math.sin(elapsed / 45));
          if (nextSquad <= 0) {
            nextSquad = 1.5 + Math.random() * 2.5;
            if (!calm && alive < target) {
              const [w, h] = world();
              const side = Math.random() < 0.5 ? 0 : Math.random() < 0.5 ? 1 : 2;
              spawn = {
                budget: Math.min(capacity - alive - leaving, Math.round(14 + Math.random() * 18 + (target - alive) * 0.15)),
                at: [w * (0.1 + Math.random() * 0.8), h * (0.15 + Math.random() * 0.6), side, 0],
              };
            }
          }

          // Now and then let one out of the bottom, if the page has room for another stray.
          nextLeave -= dt;
          if (nextLeave <= 0 && strays.count + leaving < MAX_STRAYS) {
            gate.write(new Uint32Array([0]));
            nextLeave = 3 + Math.random() * 3;
          }
          exitBudget = strays.count < MAX_STRAYS ? MAX_EXITS : 0;

          pointer.presence += (pointer.target - pointer.presence) * (1 - Math.exp(-realDt * 6));
          accumulator += dt;
          for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
            accumulator -= 1 / SIM_HZ;
            counts.write(noCounts);
            swarm.set({ swarm: swarmValues(), tasks: taskValues(), current: state.read, next: state.write });
            swarm.dispatch(Math.ceil(capacity / 64));
            state.swap();
            // A squad arrives in a single step.
            spawn = { budget: 0, at: spawn.at };
          }
          if (accumulator > 1 / SIM_HZ) accumulator = 0;

          const now = performance.now();
          if (!reading && now - lastRead > READBACK_MS) {
            lastRead = now;
            readBack();
          }

          const bound = { view: view(elapsed), agents: state.read, tasks: renderTasks() };
          agents.set(bound);
          rings.set(bound);

          // The sky takes on the colours of the open tasks.
          const live = tasks.filter((t): t is Task => Boolean(t && !t.closed));
          const tone: [number, number, number, number] = live.length
            ? [
                live.reduce((s, t) => s + t.type.color[0], 0) / live.length,
                live.reduce((s, t) => s + t.type.color[1], 0) / live.length,
                live.reduce((s, t) => s + t.type.color[2], 0) / live.length,
                Math.min(1, live.length / 5),
              ]
            : [0.35, 0.45, 0.95, 0];
          const k = Math.min(1, dt * 0.6);
          mood = mood.map((v, i) => v + (tone[i] - v) * k) as typeof mood;
          sky.set({ sky: { frame: skyFrame(elapsed), tint: mood } });

          frame.pass({ target: canvasSurface, clear: [0, 0, 0, 0] }, (pass) => {
            pass.draw(sky);
            pass.draw(rings);
            pass.draw(agents);
          });
        },
      };
    },
    { maxStorageBuffersInVertexStage: 1 }
  );
