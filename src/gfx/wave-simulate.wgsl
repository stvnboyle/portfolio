// One explicit step of the damped 2D wave equation, ∂²h/∂t² = c²∇²h.
// `current` holds the latest heights; `previous` holds the step before and is
// overwritten in place with the next state, then the pair is swapped.

struct Sim {
  gx: u32,
  gz: u32,
  dropCount: u32,
  damping: f32,
  c2: f32,
  // x, z (cells), radius (cells), amplitude
  drops: array<vec4f, 4>,
}

@group(0) @binding(0) var<uniform> sim: Sim;
@group(0) @binding(1) var<storage, read> current: array<f32>;
@group(0) @binding(2) var<storage, read_write> previous: array<f32>;

@compute @workgroup_size(16, 16)
fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= sim.gx || id.y >= sim.gz) { return; }

  let x = id.x;
  let z = id.y;
  let i = z * sim.gx + x;
  // Clamped neighbours make the edges reflect.
  let l = z * sim.gx + max(x, 1u) - 1u;
  let r = z * sim.gx + min(x + 1u, sim.gx - 1u);
  let d = (max(z, 1u) - 1u) * sim.gx + x;
  let u = min(z + 1u, sim.gz - 1u) * sim.gx + x;

  let laplacian = current[l] + current[r] + current[d] + current[u] - 4.0 * current[i];
  var next = (2.0 * current[i] - previous[i] + sim.c2 * laplacian) * sim.damping;

  for (var k = 0u; k < sim.dropCount; k++) {
    let drop = sim.drops[k];
    let dx = f32(x) - drop.x;
    let dz = f32(z) - drop.y;
    next += drop.w * exp(-(dx * dx + dz * dz) / (drop.z * drop.z));
  }

  previous[i] = next;
}
