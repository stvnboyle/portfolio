// One step of a force-directed layout for a package dependency graph: every
// node pushes every other away, dependencies pull together like springs, and a
// weak pull keeps the graph centred. State is two vec4s per node —
// [2i] position (xyz), [2i + 1] velocity (xyz).

struct Layout {
  count: u32,
  dt: f32,
  // Repulsion strength, spring stiffness, spring rest length, centring pull.
  repel: f32,
  stiffness: f32,
  rest: f32,
  centre: f32,
  // Velocity kept per step, and top speed.
  damping: f32,
  maxSpeed: f32,
}

@group(0) @binding(0) var<uniform> layout_: Layout;
@group(0) @binding(1) var<storage, read> current: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> next: array<vec4f>;
// CSR adjacency: node i's neighbours are neighbours[offsets[i] .. offsets[i + 1]].
@group(0) @binding(3) var<storage, read> offsets: array<u32>;
@group(0) @binding(4) var<storage, read> neighbours: array<u32>;

@compute @workgroup_size(64)
fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= layout_.count) { return; }
  let p = current[2u * i].xyz;
  var v = current[2u * i + 1u].xyz;

  var force = -p * layout_.centre;
  for (var j = 0u; j < layout_.count; j++) {
    let d = p - current[2u * j].xyz;
    let r2 = dot(d, d) + 0.01;
    force += d * (layout_.repel / (r2 * sqrt(r2)));
  }
  for (var e = offsets[i]; e < offsets[i + 1u]; e++) {
    let d = current[2u * neighbours[e]].xyz - p;
    let r = length(d) + 1e-4;
    force += d / r * (r - layout_.rest) * layout_.stiffness;
  }

  v = (v + force * layout_.dt) * layout_.damping;
  let speed = length(v);
  if (speed > layout_.maxSpeed) { v *= layout_.maxSpeed / speed; }

  next[2u * i] = vec4f(p + v * layout_.dt, 1.0);
  next[2u * i + 1u] = vec4f(v, 0.0);
}
