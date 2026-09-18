// One step of an agent swarm. Each agent flocks with its neighbours
// (separation, alignment, cohesion), picks up nearby tasks and circles them
// while it works, and takes on the task's colour. When a task finishes, some
// of its crew carry the colour over to the next task (a handoff).
//
// State is three vec4s per agent:
//   [3i]     position.xy, velocity.xy (CSS px)
//   [3i + 1] tint rgb, tint weight
//   [3i + 2] life (0 empty, 1 in the hero, 2 leaving), last task worked (-1 = none), -, -
//
// The hero is the world; the canvas runs on below it (the apron) over the page.
// Agents drift off the sides for good. At the bottom, the CPU now and then lets
// one out: it leaves the flock and heads down over the page, and at the end of
// the apron it's handed to the CPU to wander on. Everyone else turns back.
// New squads drop in from the top or the sides when the CPU grants spawns.

struct Swarm {
  // Buffer capacity (occupied slots are flagged in state).
  capacity: u32,
  tasks: u32,
  dt: f32,
  // Neighbourhood radii (px): too close, and in view.
  near: f32,
  sight: f32,
  // Speed range (px/s).
  minSpeed: f32,
  maxSpeed: f32,
  // Seconds for a tint to fade once an agent is off task.
  fade: f32,
  // Leavers that may be handed to the CPU at the end of the apron.
  exitBudget: u32,
  // Empty slots that may be filled this step.
  spawnBudget: u32,
  seed: f32,
  // Width, height of the hero (px), and how far the canvas runs on below it.
  world: vec2f,
  apron: f32,
  // Where a squad arrives: x, y (px), side (0 top, 1 left, 2 right), -.
  spawnAt: vec4f,
  // Pointer x, y (px) and presence (0..1).
  pointer: vec4f,
}

// x, y (px), working radius (px), strength (0..1, 0 = inactive)
struct Tasks {
  at: array<vec4f, 8>,
  tint: array<vec4f, 8>,
  // Per finished task: where its crew hands off to (x, y), active (0/1), share of the crew.
  handoff: array<vec4f, 8>,
}

// Reset by the CPU every step.
struct Step {
  workers: array<atomic<u32>, 8>,
  alive: atomic<u32>,
  leaving: atomic<u32>,
  spawnTicket: atomic<u32>,
}

struct Exits {
  // Leavers that reached the end of the apron; only the first `exitBudget` are recorded.
  count: atomic<u32>,
  // Per exit: x, -, velocity.xy; then tint rgb, weight.
  items: array<vec4f, 4>,
}

@group(0) @binding(0) var<uniform> swarm: Swarm;
@group(0) @binding(1) var<uniform> tasks: Tasks;
@group(0) @binding(2) var<storage, read> current: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> next: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> counts: Step;
@group(0) @binding(5) var<storage, read_write> exits: Exits;
// A latch for letting one agent out of the bottom: the CPU opens it by writing
// 0, the first agent to reach the edge takes it, and it stays shut until reopened.
@group(0) @binding(6) var<storage, read_write> gate: atomic<u32>;

const EMPTY: f32 = 0.0;
const IN_HERO: f32 = 1.0;
const LEAVING: f32 = 2.0;

fn hash(x: f32) -> f32 {
  return fract(sin(x * 12.9898 + swarm.seed * 78.233) * 43758.5453);
}

fn write(i: u32, motion: vec4f, tint: vec4f, info: vec4f) {
  next[3u * i] = motion;
  next[3u * i + 1u] = tint;
  next[3u * i + 2u] = info;
}

// A squad member arriving from the granted edge, fanned out a little.
fn arrive(i: u32) {
  let r = hash(f32(i));
  let spread = (r - 0.5) * 90.0;
  let fan = (hash(f32(i) + 7.0) - 0.5) * 0.9;
  let back = 4.0 + r * 30.0;
  var p = vec2f(swarm.spawnAt.x + spread, -back);
  var angle = 1.5708 + fan;
  if (swarm.spawnAt.z > 1.5) {
    p = vec2f(swarm.world.x + back, swarm.spawnAt.y + spread);
    angle = 3.1416 + fan;
  } else if (swarm.spawnAt.z > 0.5) {
    p = vec2f(-back, swarm.spawnAt.y + spread);
    angle = fan;
  }
  write(i, vec4f(p, cos(angle) * 45.0, sin(angle) * 45.0), vec4f(0.5, 0.52, 0.6, 0.0), vec4f(IN_HERO, -1.0, 0.0, 0.0));
  atomicAdd(&counts.alive, 1u);
}

// Off the flock and down over the page, with a gentle side-to-side wander.
fn leave(i: u32, me: vec4f, tint: vec4f, info: vec4f) {
  var v = me.zw;
  let wander = sin(me.y * 0.02 + f32(i)) * 14.0;
  v += (vec2f(wander, 40.0) - v) * min(1.0, swarm.dt * 1.5);
  let p = me.xy + v * swarm.dt;
  let faded = vec4f(tint.rgb, max(0.0, tint.w - swarm.dt / 20.0));

  if (p.y > swarm.world.y + swarm.apron) {
    // End of the canvas: hand it to the CPU to carry on down the page.
    let slot = atomicAdd(&exits.count, 1u);
    if (slot < swarm.exitBudget) {
      exits.items[2u * slot] = vec4f(p.x, 0.0, v);
      exits.items[2u * slot + 1u] = faded;
    }
    write(i, vec4f(p, v), faded, vec4f(EMPTY, -1.0, 0.0, 0.0));
    return;
  }
  atomicAdd(&counts.leaving, 1u);
  write(i, vec4f(p, v), faded, info);
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= swarm.capacity) { return; }
  let me = current[3u * i];
  var tint = current[3u * i + 1u];
  var info = current[3u * i + 2u];

  if (info.x < 0.5) {
    if (swarm.spawnBudget > 0u && atomicAdd(&counts.spawnTicket, 1u) < swarm.spawnBudget) {
      arrive(i);
    } else {
      write(i, me, tint, info);
    }
    return;
  }
  if (info.x > 1.5) {
    leave(i, me, tint, info);
    return;
  }

  let p = me.xy;
  var v = me.zw;

  var separate = vec2f(0.0);
  var heading = vec2f(0.0);
  var centre = vec2f(0.0);
  var seen = 0.0;
  for (var j = 0u; j < swarm.capacity; j++) {
    if (j == i) { continue; }
    let life = current[3u * j + 2u].x;
    if (life < 0.5 || life > 1.5) { continue; }
    let other = current[3u * j];
    let d = other.xy - p;
    let r2 = dot(d, d);
    if (r2 < swarm.sight * swarm.sight) {
      heading += other.zw;
      centre += d;
      seen += 1.0;
      if (r2 < swarm.near * swarm.near) { separate -= d / max(r2, 1.0); }
    }
  }

  var steer = separate * 160.0;
  if (seen > 0.0) {
    steer += (heading / seen - v) * 0.6 + (centre / seen) * 0.35;
  }

  // Tasks: head for the nearest one in range, then circle it while working.
  var best = -1;
  var bestD = 1e9;
  for (var k = 0u; k < swarm.tasks; k++) {
    let t = tasks.at[k];
    if (t.w <= 0.0) { continue; }
    let d = length(t.xy - p);
    if (d < t.z * 9.0 && d < bestD) { bestD = d; best = i32(k); }
  }
  var working = 0.0;
  if (best >= 0) {
    let t = tasks.at[best];
    let d = t.xy - p;
    let r = max(length(d), 1.0);
    let toward = d / r;
    let around = vec2f(-toward.y, toward.x);
    // Pulled onto an orbit at the task's working radius, moving round it.
    steer += (toward * (r - t.z) * 1.4 + around * swarm.maxSpeed * 1.2 - v) * t.w * 1.6;
    // Agents settle into an orbit about three task radii out, where the pull
    // balances their speed; anyone in that band is working the task.
    working = t.w * (1.0 - smoothstep(t.z * 3.2, t.z * 4.2, r));
    tint = vec4f(mix(tint.rgb, tasks.tint[best].rgb, min(1.0, working * swarm.dt * 4.0)), tint.w);
    if (r < t.z * 4.2) {
      atomicAdd(&counts.workers[best], 1u);
      info.y = f32(best);
    }
  }

  // Handoff: part of a finished task's crew carries its colour to the next task.
  var handingOff = false;
  if (best < 0 && info.y >= 0.0) {
    let h = tasks.handoff[u32(info.y)];
    if (h.z > 0.5 && hash(f32(i) * 1.37) < h.w) {
      steer += (normalize(h.xy - p + vec2f(1e-3, 0.0)) * swarm.maxSpeed * 1.3 - v) * 3.0;
      handingOff = true;
    }
  }

  // While the gate is shut, a soft band above the bottom edge turns agents back
  // before they reach it; when it's open, the next one heading down goes through.
  if (atomicLoad(&gate) != 0u) {
    steer.y -= smoothstep(swarm.world.y - 80.0, swarm.world.y, p.y) * 70.0;
  }

  // The pointer draws curious agents in, without holding them.
  let toPointer = swarm.pointer.xy - p;
  let pd = length(toPointer);
  steer += toPointer / max(pd, 1.0) * swarm.pointer.w * 60.0 * (1.0 - smoothstep(40.0, 220.0, pd));

  v += steer * swarm.dt;
  let speed = length(v);
  let top = select(swarm.maxSpeed, swarm.maxSpeed * 1.4, handingOff);
  v = v / max(speed, 1e-3) * clamp(speed, swarm.minSpeed, top);
  var np = p + v * swarm.dt;

  // Carriers keep their colour until they arrive; others forget the task as it fades.
  if (!handingOff) { tint.w = max(working, tint.w - swarm.dt / swarm.fade); }
  if (tint.w < 0.05) { info.y = -1.0; }

  // Off the sides: gone for good.
  if (np.x < -12.0 || np.x > swarm.world.x + 12.0) {
    write(i, vec4f(np, v), tint, vec4f(EMPTY, -1.0, 0.0, 0.0));
    return;
  }
  // The top turns agents back.
  if (np.y < 0.0 && v.y < 0.0) { v.y = -v.y; }
  // The bottom: when the gate's open the agent carries on over the page; otherwise it turns back.
  if (np.y > swarm.world.y - 2.0 && v.y > 0.0) {
    if (atomicAdd(&gate, 1u) == 0u) {
      info.x = LEAVING;
      atomicAdd(&counts.leaving, 1u);
      write(i, vec4f(np, v), tint, info);
      return;
    }
    v.y = -v.y;
  }

  atomicAdd(&counts.alive, 1u);
  write(i, vec4f(np, v), tint, info);
}
