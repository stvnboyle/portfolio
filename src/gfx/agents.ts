import { compute, draw, effect, pingPongStorage, storage } from "vgpu";
import swarmShader from "./agents.wgsl";
import renderShader from "./agents-render.wgsl";
import skyShader from "./sky.wgsl";
import trailsShader from "./trails.wgsl";
import { PALETTE, type Rgb } from "./palette";
import { onCopy, pointerIn, runScene, type StartScene } from "./scene";
import { MAX_STRAYS, StrayLayer } from "./strays";
import { seeded } from "./random";
import { createIntro } from "./intro";
import { createFormation, MAX_FORMATION } from "./formation";
import { createPrint } from "./print";
import { createNetwork } from "./network";
import { loadSnapshot, saveSnapshot, type Snapshot } from "./snapshot";

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
/** Pheromone trail cells are this many CSS px square. */
const TRAIL_CELL = 2;
/** Trails fade to a third in about this many seconds once nobody's passing. */
const TRAIL_SECONDS = 5;
/** A finished task's trail starts clearing this long after it completes, and takes this long. */
const CLEAR_DELAY = 0.5;
const CLEAR_SECONDS = 1.5;
/** Fixed-point scale for trail deposits (they're summed with integer atomics). */
const TRAIL_SCALE = 4096;
/** Every fresh load plays out from the same seed, so the swarm goes the same way each time. */
const SEED = 20260918;
/**
 * How the name comes in: "network", four robots wire up the letters and charge
 * them with pulses (network.ts); "print", one robot prints it in layers like a
 * 3D printer (print.ts); "formation", the swarm assembles it and bursts away
 * (formation.ts); or "bolts", four robots shoot it in letter by letter (intro.ts).
 */
const INTRO = "network" as "network" | "print" | "formation" | "bolts";
/** How often the swarm's state is copied back, to carry it over to the next page load. */
const SNAPSHOT_MS = 1000;

/** How long a finished task's pulse takes to swell out and fade. */
const PULSE_SECONDS = 2.2;
/**
 * A first visit starts quiet: a small crew and one task, building up to the
 * full population and several open tasks over this many seconds.
 */
const WARMUP_SECONDS = 75;
/** A task finishes in this many seconds with a full crew working it; slower with fewer. */
const WORK_SECONDS = 8;
const FULL_CREW = 24;

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

const mixNumber = (a: number, b: number, t: number) => a + (b - a) * t;

type Handoff = { to: Task; until: number } | null;

/**
 * A swarm of agents on the GPU. They flock with their neighbours, pick up
 * tasks that appear across the hero, circle them while they work, and take on the task's colour. A task only moves
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
      // The swarm carries on from where it was on the last page load in this tab, if it can.
      const saved = loadSnapshot(capacity);
      const random = seeded(saved ? SEED + saved.steps : SEED);
      // The population builds up to this, then gently rises and falls around it over minutes.
      const baseline = small ? 300 : 900;
      const opening = small ? 60 : 140;
      // The hero is the world; the canvas runs on below it over the page.
      const world = () => [hero.clientWidth, hero.clientHeight] as const;
      const canvasSize = () => [canvas.clientWidth, canvas.clientHeight] as const;
      const apron = () => Math.max(0, canvas.clientHeight - hero.clientHeight);

      const initial = saved?.state ?? new Float32Array(capacity * STRIDE * 4);
      for (let i = 0; i < capacity && !saved; i++) {
        const [w, h] = world();
        const angle = random() * Math.PI * 2;
        const o = i * STRIDE * 4;
        initial.set([random() * w, random() * h, Math.cos(angle) * 40, Math.sin(angle) * 40], o);
        initial.set([0.5, 0.52, 0.6, 0], o + 4);
        initial.set([i < opening ? 1 : 0, -1, 0, 0], o + 8);
      }
      if (saved) {
        const [w, h] = world();
        const [sx, sy] = [w / saved.world[0], h / saved.world[1]];
        for (let o = 0; o < initial.length; o += STRIDE * 4) {
          initial[o] *= sx;
          initial[o + 1] *= sy;
          // Anyone caught mid-intro is let go; the intro plays afresh.
          if (initial[o + 10] !== 0) initial.set([0, -1, 0, 0], o + 8);
        }
      }

      // Robots are 20px tall (17px on phones).
      const robot = small ? 17 : 20;
      // The name's entrance (see INTRO). The scripted ones (network, print, bolts)
      // share the intro crew and beams; the formation drives swarm agents directly.
      const intro =
        INTRO === "network"
          ? createNetwork(hero, canvas, !calm, robot)
          : INTRO === "print"
            ? createPrint(hero, canvas, !calm, robot)
            : createIntro(hero, canvas, !calm && INTRO === "bolts", robot);
      const formation = createFormation(hero, canvas, !calm && INTRO === "formation", initial, robot);
      // No intro playing (reduced motion, a late start): show the name as it is.
      if (hero.dataset.intro !== "etching") hero.dataset.intro = "done";
      const targets = storage(gpu, MAX_FORMATION * 32);
      targets.write(formation.targets);

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

      // Pheromone trails: a grid over the hero, sized once; it stretches with the hero on resize.
      const [trailW, trailH] = world().map((v) => Math.max(1, Math.ceil(v / TRAIL_CELL)));
      const trailCells = trailW * trailH;
      const deposit = storage(gpu, trailCells * 12);
      deposit.write(new Uint32Array(trailCells * 3));
      const trail = pingPongStorage(gpu, trailCells * 16);
      trail.read.write(new Float32Array(trailCells * 4));
      trail.write.write(new Float32Array(trailCells * 4));
      const trailGrid = [trailW, trailH, Math.exp(-1 / (SIM_HZ * TRAIL_SECONDS)), TRAIL_SCALE];
      // Where each finished task's trail is clearing, in trail cells (see trails.wgsl).
      const sweeps = () => {
        const [w, h] = world();
        return tasks.map((t) => {
          const progress = t?.closed ? (t.burst * PULSE_SECONDS - CLEAR_DELAY) / CLEAR_SECONDS : 0;
          if (!t || progress <= 0 || progress > 1) return [0, 0, 1, 0];
          return [(t.x / w) * trailW, (t.y / h) * trailH, (t.radius * 6.5 * trailW) / w, progress];
        });
      };
      const trails = compute(gpu, trailsShader, {
        label: "agents-trails",
        // (No tasks exist yet, so nothing to clear.)
        set: {
          trail: { grid: trailGrid, sweeps: Array.from({ length: MAX_TASKS }, () => [0, 0, 1, 0]) },
          deposit,
          current: trail.read,
          next: trail.write,
        },
      });

      const pointer = { x: -1e4, y: -1e4, presence: 0, target: 0 };
      let exitBudget = MAX_EXITS;
      let spawn = { budget: 0, at: [0, 0, 0, 0] };
      const swarmValues = () => ({
        capacity,
        tasks: MAX_TASKS,
        dt: 1 / SIM_HZ,
        near: 15,
        sight: 46,
        minSpeed: 34,
        maxSpeed: 70,
        fade: 2.5,
        exitBudget,
        spawnBudget: spawn.budget,
        seed: (steps % 997) + 0.5,
        world: world(),
        apron: apron(),
        spawnAt: spawn.at,
        pointer: [pointer.x, pointer.y, 0, pointer.presence],
        introCount: intro.count,
        introAt: intro.at,
        introTint: intro.tint,
        trailGrid: [trailW, trailH, TRAIL_SCALE, 0],
        form: formation.form(),
        formCentre: formation.centre(),
      });

      let tasks: Array<Task | null> = Array.from({ length: MAX_TASKS }, () => null);
      const handoffs: Handoff[] = Array.from({ length: MAX_TASKS }, () => null);
      let elapsed = 0;
      // Simulation steps taken so far; also seeds the shader's per-step randomness.
      let steps = 0;
      let simTime = 0;

      const strength = (t: Task | null) => (!t || t.closed ? 0 : Math.min(1, t.age * 1.5));
      const taskValues = () => ({
        at: tasks.map((t) => (t ? [t.x, t.y, t.radius, strength(t)] : [0, 0, 1, 0])),
        tint: tasks.map((t) => (t ? [...t.color, 0] : [0, 0, 0, 0])),
        handoff: handoffs.map((h) => (h ? [h.to.x, h.to.y, 1, HANDOFF_SHARE] : [0, 0, 0, 0])),
      });

      const swarm = compute(gpu, swarmShader, {
        label: "agents-swarm",
        set: { swarm: swarmValues(), tasks: taskValues(), counts, exits, gate, deposit, targets },
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

      const view = (t: number) => ({ frame: [...canvasSize(), robot, t], copy: copyBox });
      // How far a finished task's pulse swells, in task radii; less on phones, where it would fill the screen.
      const pulseReach = small ? 6.5 : 11;
      const renderTasks = () => {
        const { at, tint } = taskValues();
        return {
          at,
          tint,
          // Dropped tasks just fade; only finished ones ring out.
          progress: tasks.map((t) => (t ? [t.progress, t.closed === "dropped" ? 0 : t.burst, pulseReach, 0] : [0, 0, 0, 0])),
        };
      };
      const beamValues = () => ({ line: intro.beams, tint: intro.beamTint });
      const agents = draw(gpu, {
        shader: renderShader,
        label: "agents",
        entry: { vertex: "vs_agents", fragment: "fs_agents" },
        instances: capacity,
        vertices: 6,
        blend: "premultiplied",
        set: { view: view(0), agents: state.read, tasks: renderTasks(), beams: beamValues() },
      });
      const lasers = draw(gpu, {
        shader: renderShader,
        label: "agent-intro-lasers",
        entry: { vertex: "vs_beams", fragment: "fs_beams" },
        instances: 8,
        vertices: 6,
        blend: "premultiplied",
        set: { view: view(0), agents: state.read, tasks: renderTasks(), beams: beamValues() },
      });
      const rings = draw(gpu, {
        shader: renderShader,
        label: "agent-tasks",
        entry: { vertex: "vs_tasks", fragment: "fs_tasks" },
        instances: MAX_TASKS,
        vertices: 6,
        blend: "premultiplied",
        set: { view: view(0), agents: state.read, tasks: renderTasks(), beams: beamValues() },
      });

      let mood: [number, number, number, number] = [0.35, 0.45, 0.95, 0];
      const skyFrame = (t: number) => {
        const [w, h] = world();
        return [1.05, w / Math.max(1, h), t, h / Math.max(1, canvasSize()[1])];
      };
      const trailView = () => ({ view: [...world(), trailW, trailH] });
      const sky = effect(gpu, skyShader, {
        label: "agents-sky",
        set: { sky: { frame: skyFrame(0), tint: mood }, trails: trailView(), trail: trail.read },
      });

      /* --- tasks ---------------------------------------------------------- */

      // Labels live in the hero's overlay layer, next to each ring.
      const overlay = hero.querySelector<HTMLElement>(".hero__overlay");
      let nextId = 1;
      let colorIndex = 0;
      let completed = 0;

      const labelText = (t: Task) => {
        const name = `#${String(t.id).padStart(2, "0")}`;
        return t.closed === "done" ? `${name} · done` : name;
      };

      const place = (slot: number, fields: Omit<Task, "label">) => {
        const { x, y, radius, color } = fields;
        const label = document.createElement("span");
        label.className = "task-label";
        // The label sits on whichever side of the ring has more room.
        if (x > world()[0] / 2) label.dataset.side = "left";
        const tone = `rgb(${color.map((c) => Math.round(c * 255)).join(" ")})`;
        // Clear of the orbit the crew settles into, about four radii out.
        label.style.cssText = `left:${x}px;top:${y}px;--tone:${tone};--clear:${Math.round(radius * 4.3)}px`;
        overlay?.append(label);
        const task: Task = { ...fields, label };
        label.textContent = labelText(task);
        tasks[slot] = task;
      };
      const post = (x: number, y: number) => {
        let slot = tasks.findIndex((t) => t === null);
        if (slot < 0) {
          // Replace whichever task is furthest along.
          slot = tasks.reduce((best, t, i) => ((t?.progress ?? 0) > (tasks[best]?.progress ?? 0) ? i : best), 0);
          tasks[slot]?.label.remove();
        }
        colorIndex = (colorIndex + 1) % PALETTE.length;
        const color = PALETTE[colorIndex];
        const radius = small ? 17 + random() * 5 : 20 + random() * 7;
        place(slot, { id: nextId++, x, y, radius, color, age: 0, progress: 0, workers: 0, closed: null, burst: 0 });
      };
      // Somewhere clear of the copy in the top left.
      const postRandom = () => {
        const [w, h] = world();
        for (let tries = 0; tries < 24; tries++) {
          const x = w * (0.1 + random() * 0.8);
          const y = h * (small ? 0.55 + random() * 0.25 : 0.2 + random() * 0.58);
          if (!small && x < w * 0.55 && y < h * 0.6) continue;
          // Keep clear of other open tasks, so rings and labels don't overlap.
          if (tasks.some((t) => t && !t.closed && Math.hypot(t.x - x, t.y - y) < (small ? 150 : 280))) continue;
          return post(x, y);
        }
      };
      // A finished task sends part of its crew on to the nearest open task.
      const handOff = (slot: number, from: Task) => {
        const open = tasks.filter((t): t is Task => Boolean(t && !t.closed && t !== from));
        if (!open.length) return;
        const distance = (t: Task) => Math.hypot(t.x - from.x, t.y - from.y);
        const to = open.reduce((a, b) => (distance(a) < distance(b) ? a : b));
        handoffs[slot] = { to, until: simTime + HANDOFF_SECONDS };
      };

      /* --- population ----------------------------------------------------- */

      let alive = opening;
      let leaving = 0;
      let nextSquad = 2;
      let nextLeave = 4;

      /* --- strays --------------------------------------------------------- */

      const strays = new StrayLayer(seeded(SEED + 1));
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
            // Carry each leaver on from where it will be by now, near the bottom of the canvas.
            const late = (performance.now() - started) / 1000 + READBACK_MS / 2000;
            const rect = canvas.getBoundingClientRect();
            const items = new Float32Array(e, 16, 16);
            for (let k = 0; k < exited; k++) {
              const [x, y, vx, vy, r, g, b, tint] = items.subarray(k * 8, k * 8 + 8);
              strays.release(
                rect.left + window.scrollX + x + vx * late,
                rect.top + window.scrollY + y + vy * late,
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
      // A click, not a pointerdown: on touch screens a swipe to scroll starts with a pointerdown too.
      const onClick = (e: MouseEvent) => {
        if (onCopy(e)) return;
        const [x, y] = pointerIn(canvas, e);
        post(x, y);
      };
      hero.addEventListener("pointermove", onMove, { passive: true });
      hero.addEventListener("pointerleave", onLeave, { passive: true });
      hero.addEventListener("click", onClick);
      onCleanup(() => {
        hero.removeEventListener("pointermove", onMove);
        hero.removeEventListener("pointerleave", onLeave);
        hero.removeEventListener("click", onClick);
        for (const t of tasks) t?.label.remove();
        strays.dispose();
      });


      /* --- loop ----------------------------------------------------------- */

      let accumulator = 0;
      let nextPost = 3;

      /* --- carrying on from the last page load ------------------------------ */

      if (saved) {
        const [sx, sy] = [world()[0] / saved.world[0], world()[1] / saved.world[1]];
        ({ elapsed, steps, simTime, nextId, colorIndex, completed, alive, nextSquad, nextLeave, nextPost } = saved);
        mood = saved.mood;
        saved.tasks.forEach((t, slot) => t && place(slot, { ...t, x: t.x * sx, y: t.y * sy, workers: 0 }));
      }

      // Copied back now and then; the latest copy is saved as the page goes.
      let latest: Snapshot | null = null;
      let lastSnapshot = 0;
      const takeSnapshot = () => {
        const meta = {
          savedAt: 0,
          capacity,
          world: [...world()] as [number, number],
          elapsed,
          steps,
          simTime,
          nextId,
          colorIndex,
          completed,
          alive,
          nextSquad,
          nextLeave,
          nextPost,
          mood,
          tasks: tasks.map((t) => (t ? { ...t, label: undefined } : null)),
        };
        void state.read
          .read()
          .then((buffer) => (latest = { ...meta, state: new Float32Array(buffer) }))
          .catch(() => undefined);
      };
      const onHide = () => {
        if (latest) saveSnapshot({ ...latest, savedAt: Date.now() });
      };
      window.addEventListener("pagehide", onHide);
      onCleanup(() => window.removeEventListener("pagehide", onHide));
      // 0 → 1 over the warm-up, easing in and out.
      const warmth = () => {
        const k = Math.min(1, simTime / WARMUP_SECONDS);
        return k * k * (3 - 2 * k);
      };

      /** One fixed step: schedule tasks, squads and exits, then advance the swarm on the GPU. */
      const simulate = (h: number) => {
        steps++;
        simTime += h;

        nextPost -= h;
        if (nextPost <= 0) {
          const open = tasks.filter((t) => t && !t.closed).length;
          // One task at a time to begin with, then more as the swarm warms up.
          const most = 1 + Math.round(warmth() * (small ? 2 : 4));
          if (!calm && open < most) postRandom();
          nextPost = 1.5 + random() * 1.5;
        }

        // Progress comes from agents actually on the task, as counted on the GPU.
        tasks = tasks.map((t, slot) => {
          if (!t) return null;
          t.age += h;
          if (!t.closed) {
            t.progress = Math.min(1, t.progress + (h * Math.min(t.workers, FULL_CREW)) / (FULL_CREW * WORK_SECONDS));
            if (t.progress >= 1) {
              t.closed = "done";
              completed++;
              handOff(slot, t);
            } else if (t.age > ABANDON_AFTER && t.progress < 0.05) {
              t.closed = "dropped";
            }
          } else {
            t.burst += h / PULSE_SECONDS;
          }
          if (t.burst < 1) return t;
          t.label.remove();
          return null;
        });
        // Handoffs end on time, or when the task they were heading for closes.
        handoffs.forEach((ho, i) => {
          if (ho && (simTime > ho.until || ho.to.closed)) handoffs[i] = null;
        });

        // New squads arrive from the top or the sides while the population is below target.
        nextSquad -= h;
        const target = mixNumber(opening, baseline, warmth()) * (1 + 0.12 * Math.sin(simTime / 45));
        if (nextSquad <= 0) {
          nextSquad = 1.5 + random() * 2.5;
          if (!calm && alive < target) {
            const [w, wh] = world();
            const side = random() < 0.5 ? 0 : random() < 0.5 ? 1 : 2;
            spawn = {
              budget: Math.min(capacity - alive - leaving, Math.round(14 + random() * 18 + (target - alive) * 0.15)),
              at: [w * (0.1 + random() * 0.8), wh * (0.15 + random() * 0.6), side, 0],
            };
          }
        }

        // Now and then let one out of the bottom, if the page has room for another stray.
        nextLeave -= h;
        if (nextLeave <= 0 && strays.count + leaving < MAX_STRAYS) {
          gate.write(new Uint32Array([0]));
          nextLeave = 0.8 + random() * 1.2;
        }
        exitBudget = strays.count < MAX_STRAYS ? MAX_EXITS : 0;

        counts.write(noCounts);
        swarm.set({ swarm: swarmValues(), tasks: taskValues(), current: state.read, next: state.write });
        swarm.dispatch(Math.ceil(capacity / 64));
        state.swap();
        // Then fold this step's marks into the trails, softened and faded.
        trails.set({ trail: { grid: trailGrid, sweeps: sweeps() }, current: trail.read, next: trail.write });
        trails.dispatch(Math.ceil(trailCells / 64));
        trail.swap();
        // A squad arrives in a single step.
        spawn = { budget: 0, at: spawn.at };
      };
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

          pointer.presence += (pointer.target - pointer.presence) * (1 - Math.exp(-realDt * 6));
          intro.update(realDt);
          formation.update(realDt);
          // Everything that decides where the swarm goes runs on the fixed simulation
          // clock, so a fresh load with the same seed plays out the same way.
          accumulator += dt;
          for (let n = 0; accumulator >= 1 / SIM_HZ && n < 2; n++) {
            accumulator -= 1 / SIM_HZ;
            simulate(1 / SIM_HZ);
          }
          if (accumulator > 1 / SIM_HZ) accumulator = 0;

          const now = performance.now();
          if (now - lastSnapshot > SNAPSHOT_MS) {
            lastSnapshot = now;
            takeSnapshot();
          }
          if (!reading && now - lastRead > READBACK_MS) {
            lastRead = now;
            readBack();
          }

          for (const t of tasks) {
            if (!t) continue;
            t.label.textContent = labelText(t);
            t.label.style.opacity = String(Math.min(1, t.age * 1.5) * (1 - Math.min(1, t.burst * 1.5)));
          }

          const bound = { view: view(elapsed), agents: state.read, tasks: renderTasks(), beams: beamValues() };
          agents.set(bound);
          rings.set(bound);
          lasers.set(bound);

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
          sky.set({ sky: { frame: skyFrame(elapsed), tint: mood }, trails: trailView(), trail: trail.read });

          frame.pass({ target: canvasSurface, clear: [0, 0, 0, 0] }, (pass) => {
            pass.draw(sky);
            pass.draw(rings);
            pass.draw(lasers);
            pass.draw(agents);
          });
        },
      };
    },
    { maxStorageBuffersInVertexStage: 1 }
  );
