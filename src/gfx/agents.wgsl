// One step of an agent swarm. Each agent flocks with its neighbours
// (separation, alignment, cohesion), picks up nearby tasks and circles them
// while it works, and takes on the task's colour. State is two vec4s per
// agent: [2i] position.xy, velocity.xy (CSS px); [2i + 1] tint rgb, tint weight.
//
// Two small buffers report back to the CPU: how many agents are working each
// task this step, and the agent (if any) let out through the bottom edge.

struct Swarm {
  count: u32,
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
  // How many agents may leave through the bottom edge this step (0 or 1).
  exitBudget: u32,
  // Width, height of the world (px).
  world: vec2f,
  // Pointer x, y (px) and presence (0..1).
  pointer: vec4f,
}

// x, y (px), working radius (px), strength (0..1, 0 = inactive)
struct Tasks {
  at: array<vec4f, 8>,
  tint: array<vec4f, 8>,
}

struct Exits {
  // Agents that tried to leave; only the first `exitBudget` are recorded.
  count: atomic<u32>,
  // Per exit: x, -, velocity.xy; then tint rgb, weight.
  items: array<vec4f, 2>,
}

@group(0) @binding(0) var<uniform> swarm: Swarm;
@group(0) @binding(1) var<uniform> tasks: Tasks;
@group(0) @binding(2) var<storage, read> current: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> next: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> workers: array<atomic<u32>, 8>;
@group(0) @binding(5) var<storage, read_write> exits: Exits;

// Shortest offset from a to b on the wrapping world.
fn wrapped(a: vec2f, b: vec2f) -> vec2f {
  let d = b - a;
  return d - swarm.world * round(d / swarm.world);
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= swarm.count) { return; }
  let me = current[2u * i];
  var tint = current[2u * i + 1u];
  let p = me.xy;
  var v = me.zw;

  var separate = vec2f(0.0);
  var heading = vec2f(0.0);
  var centre = vec2f(0.0);
  var seen = 0.0;
  for (var j = 0u; j < swarm.count; j++) {
    if (j == i) { continue; }
    let other = current[2u * j];
    let d = wrapped(p, other.xy);
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
    let d = length(wrapped(p, t.xy));
    if (d < t.z * 9.0 && d < bestD) { bestD = d; best = i32(k); }
  }
  var working = 0.0;
  if (best >= 0) {
    let t = tasks.at[best];
    let d = wrapped(p, t.xy);
    let r = max(length(d), 1.0);
    let toward = d / r;
    let around = vec2f(-toward.y, toward.x);
    // Pulled onto an orbit at the task's working radius, moving round it.
    steer += (toward * (r - t.z) * 1.4 + around * swarm.maxSpeed * 1.2 - v) * t.w * 1.6;
    // Agents settle into an orbit about three task radii out, where the pull
    // balances their speed; anyone in that band is working the task.
    working = t.w * (1.0 - smoothstep(t.z * 3.2, t.z * 4.2, r));
    tint = vec4f(mix(tint.rgb, tasks.tint[best].rgb, min(1.0, working * swarm.dt * 4.0)), tint.w);
    if (r < t.z * 4.2) { atomicAdd(&workers[best], 1u); }
  }

  // The pointer draws curious agents in, without holding them.
  let toPointer = wrapped(p, swarm.pointer.xy);
  let pd = length(toPointer);
  steer += toPointer / max(pd, 1.0) * swarm.pointer.w * 60.0 * (1.0 - smoothstep(40.0, 220.0, pd));

  v += steer * swarm.dt;
  let speed = length(v);
  v = v / max(speed, 1e-3) * clamp(speed, swarm.minSpeed, swarm.maxSpeed);
  var np = p + v * swarm.dt;

  tint.w = max(working, tint.w - swarm.dt / swarm.fade);

  // Leaving through the bottom: if the gate is open, this agent carries on down
  // the page (the CPU picks it up) and a fresh one enters at the top.
  if (np.y >= swarm.world.y && swarm.exitBudget > 0u) {
    let slot = atomicAdd(&exits.count, 1u);
    if (slot < swarm.exitBudget) {
      exits.items[0] = vec4f(np.x, 0.0, v);
      exits.items[1] = tint;
      tint = vec4f(tint.rgb, 0.0);
    }
  }
  np -= swarm.world * floor(np / swarm.world);

  next[2u * i] = vec4f(np, v);
  next[2u * i + 1u] = tint;
}
