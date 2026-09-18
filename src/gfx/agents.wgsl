// One step of an agent swarm. Each agent flocks with its neighbours
// (separation, alignment, cohesion), picks up nearby tasks and circles them
// while it works, and takes on the task's colour. When a task finishes, some
// of its crew carry the colour over to the next task (a handoff).
//
// State is three vec4s per agent:
//   [3i]     position.xy, velocity.xy (CSS px)
//   [3i + 1] tint rgb, tint weight
//   [3i + 2] alive (0/1), last task worked (-1 = none), -, -
//
// Agents leave for good through the bottom edge; new ones arrive at the top
// when the CPU grants spawns. A per-step buffer reports back how many agents
// are alive and working each task, and one exit slot lets the CPU carry an
// agent on down the page.

struct Swarm {
  // Buffer capacity (live agents are flagged in state).
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
  // How many agents may be recorded leaving this step (0 or 1).
  exitBudget: u32,
  // How many dead slots may come back to life this step, and where (x, px).
  spawnBudget: u32,
  spawnX: f32,
  seed: f32,
  // Width, height of the world (px).
  world: vec2f,
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
  spawnTicket: atomic<u32>,
}

struct Exits {
  // Agents that tried to leave; only the first `exitBudget` are recorded.
  count: atomic<u32>,
  // x, -, velocity.xy; then tint rgb, weight.
  items: array<vec4f, 2>,
}

@group(0) @binding(0) var<uniform> swarm: Swarm;
@group(0) @binding(1) var<uniform> tasks: Tasks;
@group(0) @binding(2) var<storage, read> current: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> next: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> counts: Step;
@group(0) @binding(5) var<storage, read_write> exits: Exits;

fn hash(x: f32) -> f32 {
  return fract(sin(x * 12.9898 + swarm.seed * 78.233) * 43758.5453);
}

// Shortest horizontal-wrapping offset from a to b (the world wraps left/right only).
fn offset(a: vec2f, b: vec2f) -> vec2f {
  let d = b - a;
  return vec2f(d.x - swarm.world.x * round(d.x / swarm.world.x), d.y);
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= swarm.capacity) { return; }
  let me = current[3u * i];
  var tint = current[3u * i + 1u];
  var info = current[3u * i + 2u];

  // Dead slots stay dead unless a spawn is granted: then they arrive as part of
  // a squad dropping in from the top edge.
  if (info.x < 0.5) {
    if (swarm.spawnBudget > 0u && atomicAdd(&counts.spawnTicket, 1u) < swarm.spawnBudget) {
      let r = hash(f32(i));
      let x = swarm.spawnX + (r - 0.5) * 90.0;
      let angle = 1.5708 + (hash(f32(i) + 7.0) - 0.5) * 0.9;
      next[3u * i] = vec4f(x - swarm.world.x * floor(x / swarm.world.x), -4.0 - r * 30.0, cos(angle) * 45.0, sin(angle) * 45.0);
      next[3u * i + 1u] = vec4f(0.5, 0.52, 0.6, 0.0);
      next[3u * i + 2u] = vec4f(1.0, -1.0, 0.0, 0.0);
      atomicAdd(&counts.alive, 1u);
    } else {
      next[3u * i] = me;
      next[3u * i + 1u] = tint;
      next[3u * i + 2u] = info;
    }
    return;
  }

  let p = me.xy;
  var v = me.zw;

  var separate = vec2f(0.0);
  var heading = vec2f(0.0);
  var centre = vec2f(0.0);
  var seen = 0.0;
  for (var j = 0u; j < swarm.capacity; j++) {
    if (j == i || current[3u * j + 2u].x < 0.5) { continue; }
    let other = current[3u * j];
    let d = offset(p, other.xy);
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
    let d = length(offset(p, t.xy));
    if (d < t.z * 9.0 && d < bestD) { bestD = d; best = i32(k); }
  }
  var working = 0.0;
  if (best >= 0) {
    let t = tasks.at[best];
    let d = offset(p, t.xy);
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
      let d = offset(p, h.xy);
      steer += (normalize(d + vec2f(1e-3, 0.0)) * swarm.maxSpeed * 1.3 - v) * 3.0;
      handingOff = true;
    }
  }

  // The pointer draws curious agents in, without holding them.
  let toPointer = offset(p, swarm.pointer.xy);
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

  // The top edge turns agents back; left and right wrap.
  if (np.y < 0.0 && v.y < 0.0) { v.y = -v.y; }
  np.x -= swarm.world.x * floor(np.x / swarm.world.x);

  // The bottom edge is a way out. One leaver now and then is handed to the
  // CPU to carry on down the page; the rest simply go.
  if (np.y > swarm.world.y + 6.0) {
    if (swarm.exitBudget > 0u && atomicAdd(&exits.count, 1u) < swarm.exitBudget) {
      exits.items[0] = vec4f(np.x, 0.0, v);
      exits.items[1] = tint;
    }
    next[3u * i] = vec4f(np, v);
    next[3u * i + 1u] = tint;
    next[3u * i + 2u] = vec4f(0.0, -1.0, 0.0, 0.0);
    return;
  }

  atomicAdd(&counts.alive, 1u);
  next[3u * i] = vec4f(np, v);
  next[3u * i + 1u] = tint;
  next[3u * i + 2u] = info;
}
