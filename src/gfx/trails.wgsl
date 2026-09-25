// Pheromone trails: a grid over the hero where each agent leaves a faint mark
// in its colour every step (agents.wgsl deposits into `deposit`). Each step
// here the marks are added in, softened a touch into the neighbouring cells,
// and faded, so busy routes and task orbits build up glowing paths that
// evaporate once the swarm moves on. When a task finishes, the trail its crew
// left around it fades out quickly rather than lingering. sky.wgsl draws them.

struct Trail {
  // Grid width, height (cells), fade per step, deposit fixed-point scale.
  grid: vec4f,
  // Per finished task: centre x, y and reach (cells), and how far its
  // clear-up has got (0..1; 0 = none).
  sweeps: array<vec4f, 8>,
}

@group(0) @binding(0) var<uniform> trail: Trail;
// Fixed-point rgb per cell (3 u32s), added by agents with atomics and cleared here.
@group(0) @binding(1) var<storage, read_write> deposit: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read> current: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> next: array<vec4f>;

// How much of each cell bleeds into its four neighbours per step: just enough
// to take the jaggies off, so trails stay thin lines rather than haze.
const SOFTEN: f32 = 0.004;
// Ceiling per channel, so crowded orbits don't blow out.
const MOST: f32 = 2.5;

fn at(x: i32, y: i32) -> vec3f {
  let w = i32(trail.grid.x);
  let h = i32(trail.grid.y);
  return current[u32(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1))].rgb;
}

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let w = u32(trail.grid.x);
  let cells = w * u32(trail.grid.y);
  let i = id.x;
  if (i >= cells) { return; }
  let x = i32(i % w);
  let y = i32(i / w);

  let here = at(x, y);
  let around = at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
  var v = here * (1.0 - 4.0 * SOFTEN) + around * SOFTEN;

  let laid = vec3f(
    f32(atomicExchange(&deposit[i * 3u], 0u)),
    f32(atomicExchange(&deposit[i * 3u + 1u], 0u)),
    f32(atomicExchange(&deposit[i * 3u + 2u], 0u))
  ) / trail.grid.w;
  v = min(v * trail.grid.z + laid, vec3f(MOST));

  // Finished tasks: their area fades quickly, softening out towards the edge.
  let cell = vec2f(f32(x), f32(y));
  for (var k = 0; k < 8; k++) {
    let s = trail.sweeps[k];
    if (s.w <= 0.0) { continue; }
    let d = length(cell - s.xy) / s.z;
    v *= mix(0.94, 1.0, smoothstep(0.75, 1.0, d));
  }
  next[i] = vec4f(v, 0.0);
}
