import { compute, draw, effect, pingPongStorage, storage } from "vgpu";
import swarmShader from "./agents.wgsl";
import renderShader from "./agents-render.wgsl";
import skyShader from "./signal-sky.wgsl";
import { PALETTE } from "./packets";
import { onCopy, pointerIn, runScene, type StartScene } from "./scene";
import { CLEAR } from "./signal";
import { MAX_STRAYS, StrayLayer } from "./strays";

type Rgb = [number, number, number];

/** Mirrors the task array lengths in agents.wgsl and agents-render.wgsl. */
const MAX_TASKS = 8;
const SIM_HZ = 60;
/** vec4s of state per agent: motion, tint, info. Mirrors agents.wgsl. */
const STRIDE = 3;
/** A task finishes in this many seconds with a full crew working it; slower with fewer. */
const WORK_SECONDS = 7;
const FULL_CREW = 24;
/** Tasks nobody picks up are dropped after this long. */
const ABANDON_AFTER = 30;
/** Share of a finished task's crew that carries its colour to the next task, and for how long. */
const HANDOFF_SHARE = 0.4;
const HANDOFF_SECONDS = 5;
/** How often the CPU reads back counts (faster while an exit is being watched for). */
const READBACK_MS = 200;
const READBACK_EXIT_MS = 80;
/** Bytes in the per-step counts: 8 task worker counts, alive, spawn ticket. */
const COUNTS_BYTES = 40;
/** Bytes in the Exits struct: an atomic count, padded to 16, then two vec4s. */
const EXITS_BYTES = 48;

type Task = {
  id: number;
  x: number;
  y: number;
  radius: number;
  color: Rgb;
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
 * tasks that appear across the hero, circle them while they work, and take on
 * the task's colour. A task only moves forward while agents are actually on
 * it — the GPU counts them each step — and when it's done part of its crew
 * carries the colour on to the next task. Agents leave through the bottom
 * edge and new squads drop in from the top, so the population ebbs and flows;
 * now and then a leaver wanders on down the page.
 */
export const startAgents: StartScene = (canvas, hero, callbacks) =>
  runScene(
    canvas,
    hero,
    callbacks,
    ({ gpu, surface: canvasSurface, small, calm, onCleanup }) => {
      const capacity = small ? 520 : 1400;
      // The population drifts around this, gently rising and falling over minutes.
      const baseline = small ? 380 : 1050;
      const size = () => [canvas.clientWidth, canvas.clientHeight] as const;

      const initial = new Float32Array(capacity * STRIDE * 4);
      for (let i = 0; i < capacity; i++) {
        const [w, h] = size();
        const angle = Math.random() * Math.PI * 2;
        const o = i * STRIDE * 4;
        initial.set([Math.random() * w, Math.random() * h, Math.cos(angle) * 40, Math.sin(angle) * 40], o);
        initial.set([0.5, 0.52, 0.6, 0], o + 4);
        initial.set([i < baseline ? 1 : 0, -1, 0, 0], o + 8);
      }
      const state = pingPongStorage(gpu, capacity * STRIDE * 16);
      state.read.write(initial);
      state.write.write(initial);

      // GPU → CPU feedback: per-step counts, and the agent (if any) let out.
      const counts = storage(gpu, COUNTS_BYTES);
      const noCounts = new Uint32Array(COUNTS_BYTES / 4);
      const exits = storage(gpu, EXITS_BYTES);
      exits.write(new Uint8Array(EXITS_BYTES));

      const pointer = { x: -1e4, y: -1e4, presence: 0, target: 0 };
      let exitBudget = 0;
      let spawn = { budget: 0, x: 0 };
      const swarmValues = () => ({
        capacity,
        tasks: MAX_TASKS,
        dt: 1 / SIM_HZ,
        near: 10,
        sight: 40,
        minSpeed: 24,
        maxSpeed: 58,
        fade: 2.5,
        exitBudget,
        spawnBudget: spawn.budget,
        spawnX: spawn.x,
        seed: Math.random() * 100,
        world: size(),
        pointer: [pointer.x, pointer.y, 0, pointer.presence],
      });

      let tasks: Array<Task | null> = Array.from({ length: MAX_TASKS }, () => null);
      const handoffs: Handoff[] = Array.from({ length: MAX_TASKS }, () => null);
      let elapsed = 0;

      const strength = (t: Task | null) => (!t || t.closed ? 0 : Math.min(1, t.age * 1.5));
      const taskValues = () => ({
        at: tasks.map((t) => (t ? [t.x, t.y, t.radius, strength(t)] : [0, 0, 1, 0])),
        tint: tasks.map((t) => (t ? [...t.color, 0] : [0, 0, 0, 0])),
        handoff: handoffs.map((h) => (h ? [h.to.x, h.to.y, 1, HANDOFF_SHARE] : [0, 0, 0, 0])),
      });

      const swarm = compute(gpu, swarmShader, {
        label: "agents-swarm",
        set: { swarm: swarmValues(), tasks: taskValues(), counts, exits },
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

      const view = (t: number) => ({ frame: [...size(), 7, t], copy: copyBox });
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
      const aspect = () => size()[0] / Math.max(1, size()[1]);
      const sky = effect(gpu, skyShader, { label: "agents-sky", set: { sky: { frame: [1.05, aspect(), 0, 0], tint: mood } } });

      /* --- tasks ---------------------------------------------------------- */

      // Labels live in the hero's overlay layer, next to each ring.
      const overlay = hero.querySelector<HTMLElement>(".hero__overlay");
      let colorIndex = Math.floor(Math.random() * PALETTE.length);
      let nextId = 1;
      let completed = 0;

      const labelText = (t: Task) =>
        t.closed === "done"
          ? `#${String(t.id).padStart(2, "0")} · done`
          : `#${String(t.id).padStart(2, "0")} · ${t.workers} ${t.workers === 1 ? "agent" : "agents"}`;

      const post = (x: number, y: number) => {
        let slot = tasks.findIndex((t) => t === null);
        if (slot < 0) {
          // Replace whichever task is furthest along.
          slot = tasks.reduce((best, t, i) => ((t?.progress ?? 0) > (tasks[best]?.progress ?? 0) ? i : best), 0);
          tasks[slot]?.label.remove();
        }
        colorIndex = (colorIndex + 1) % PALETTE.length;
        const color = PALETTE[colorIndex];
        const label = document.createElement("span");
        label.className = "task-label";
        // Near the right edge the label sits on the ring's left instead.
        if (x > size()[0] - 220) label.dataset.side = "left";
        label.style.cssText = `left:${x}px;top:${y}px;--tone:rgb(${color.map((c) => Math.round(c * 255)).join(" ")})`;
        overlay?.append(label);
        const task: Task = {
          id: nextId++,
          x,
          y,
          radius: 16 + Math.random() * 6,
          color,
          age: 0,
          progress: 0,
          workers: 0,
          closed: null,
          burst: 0,
          label,
        };
        label.textContent = labelText(task);
        tasks[slot] = task;
      };
      // Somewhere clear of the copy in the top left.
      const postRandom = () => {
        const [w, h] = size();
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
      let nextSquad = 3;

      /* --- strays --------------------------------------------------------- */

      const strays = new StrayLayer();
      let gateOpen = false;
      let gateCooldown = 5;
      let reading = false;
      let lastRead = 0;

      const readBack = () => {
        reading = true;
        const started = performance.now();
        const watching = gateOpen;
        void Promise.all([counts.read(), watching ? exits.read() : Promise.resolve(null)])
          .then(([c, e]) => {
            const values = new Uint32Array(c);
            tasks.forEach((t, i) => {
              if (t) t.workers = t.closed ? 0 : values[i];
            });
            alive = values[8];
            if (!e || !gateOpen) return;
            if (new Uint32Array(e, 0, 1)[0] < 1) return;
            const [x, , vx, vy, r, g, b, tint] = new Float32Array(e, 16, 8);
            // Pick it up where it will be by now, just past the hero's bottom edge.
            const late = (performance.now() - started) / 1000 + READBACK_EXIT_MS / 2000;
            const rect = canvas.getBoundingClientRect();
            strays.release(
              rect.left + window.scrollX + x + vx * late,
              rect.bottom + window.scrollY + 6 + Math.max(vy, 10) * late,
              vx,
              vy,
              [r, g, b],
              tint
            );
            gateOpen = false;
            exitBudget = 0;
            gateCooldown = 9 + Math.random() * 6;
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
            if (!calm && open < (small ? 2 : 3)) postRandom();
            nextPost = 2.5 + Math.random() * 2;
          }

          // Progress comes from agents actually on the task, as counted on the GPU.
          tasks = tasks.map((t, slot) => {
            if (!t) return null;
            t.age += dt;
            if (!t.closed) {
              t.progress = Math.min(1, t.progress + (dt * Math.min(t.workers, FULL_CREW)) / (FULL_CREW * WORK_SECONDS));
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

          // New squads drop in from the top while the population is below where it's drifting.
          nextSquad -= dt;
          const target = baseline * (1 + 0.12 * Math.sin(elapsed / 45));
          if (nextSquad <= 0) {
            nextSquad = 2.5 + Math.random() * 3;
            if (!calm && alive < target) {
              spawn = {
                budget: Math.min(capacity - alive, Math.round(10 + Math.random() * (small ? 10 : 24))),
                x: size()[0] * (0.1 + Math.random() * 0.8),
              };
            }
          }

          // Open the exit now and then, as long as the page isn't already busy.
          gateCooldown -= dt;
          if (!gateOpen && gateCooldown <= 0 && strays.count < MAX_STRAYS) {
            exits.write(new Uint8Array(EXITS_BYTES));
            gateOpen = true;
            exitBudget = 1;
          }

          pointer.presence += (pointer.target - pointer.presence) * (1 - Math.exp(-realDt * 6));
          accumulator += dt;
          for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
            accumulator -= 1 / SIM_HZ;
            counts.write(noCounts);
            swarm.set({ swarm: swarmValues(), tasks: taskValues(), current: state.read, next: state.write });
            swarm.dispatch(Math.ceil(capacity / 64));
            state.swap();
            // A squad arrives in a single step.
            spawn = { budget: 0, x: 0 };
          }
          if (accumulator > 1 / SIM_HZ) accumulator = 0;

          const now = performance.now();
          if (!reading && now - lastRead > (gateOpen ? READBACK_EXIT_MS : READBACK_MS)) {
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
                live.reduce((s, t) => s + t.color[0], 0) / live.length,
                live.reduce((s, t) => s + t.color[1], 0) / live.length,
                live.reduce((s, t) => s + t.color[2], 0) / live.length,
                Math.min(1, live.length / 5),
              ]
            : [0.35, 0.45, 0.95, 0];
          const k = Math.min(1, dt * 0.6);
          mood = mood.map((v, i) => v + (tone[i] - v) * k) as typeof mood;
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
