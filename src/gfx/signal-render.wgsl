// The grid as a perspective plane of instanced discs, lit by the glow field.
// Two passes share one layout: a wide, soft additive halo under bright nodes,
// then the crisp dots themselves.

struct View {
  viewProjection: mat4x4f,
  // p00, p11, disc radius, time
  lens: vec4f,
  // nodes x, nodes z, width, depth
  grid: vec4f,
  // near z, focus (0..1 of depth), lift per unit of glow, -
  shape: vec4f,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> glow: array<vec4f>;

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
  @location(3) softness: f32,
}

struct Node {
  world: vec3f,
  color: vec3f,
  energy: f32,
  fade: f32,
  defocus: f32,
}

fn node(ii: u32) -> Node {
  let gx = u32(view.grid.x);
  let fx = f32(ii % gx) / (view.grid.x - 1.0);
  let fz = f32(ii / gx) / (view.grid.y - 1.0);
  let x = (fx - 0.5) * view.grid.z;
  let z = view.shape.x - fz * view.grid.w;
  let t = view.lens.w;

  let g = glow[ii].rgb;
  // Soft shoulder, so overlapping packets stay pastel instead of clipping.
  let light = vec3f(1.0) - exp(-g * 1.1);
  let energy = clamp(dot(light, vec3f(0.3, 0.5, 0.2)) * 1.4, 0.0, 1.0);

  // A barely-there swell keeps the plane breathing; glow lifts nodes slightly.
  let swell = sin(x * 0.35 + t * 0.18) * 0.05 + sin(z * 0.5 - t * 0.14) * 0.04;

  var n: Node;
  n.world = vec3f(x, swell + energy * view.shape.z, z);
  n.color = vec3f(0.5, 0.52, 0.58) * 0.26 + light;
  n.energy = energy;
  n.fade = smoothstep(0.0, 0.07, fz)
    * (1.0 - smoothstep(0.38, 0.97, fz))
    * (1.0 - smoothstep(0.34, 0.5, abs(fx - 0.5)));
  n.defocus = abs(fz - view.shape.y);
  return n;
}

fn place(world: vec3f, corner: vec2f, radius: f32) -> vec4f {
  var clip = view.viewProjection * vec4f(world, 1.0);
  // Offsetting before the perspective divide keeps the discs world-sized.
  clip.x += corner.x * radius * view.lens.x;
  clip.y += corner.y * radius * view.lens.y;
  return clip;
}

fn cornerOf(vi: u32) -> vec2f {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );
  return corners[vi];
}

@vertex
fn vs_dots(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let n = node(ii);
  let corner = cornerOf(vi);
  let radius = view.lens.z * (1.0 + n.defocus * 1.6) * (1.0 + n.energy * 0.3);

  var out: Varyings;
  out.position = place(n.world, corner, radius);
  out.corner = corner;
  out.color = n.color;
  out.alpha = n.fade * (0.42 + 0.58 * n.energy) / (1.0 + n.defocus * 1.5);
  out.softness = clamp(n.defocus * 1.4, 0.0, 0.6);
  return out;
}

@vertex
fn vs_halo(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let n = node(ii);
  let corner = cornerOf(vi);
  // Dark nodes collapse to nothing, so the halo pass costs almost no fill.
  let radius = select(0.0, view.lens.z * 3.2 * (0.5 + n.energy), n.energy > 0.03);

  var out: Varyings;
  out.position = place(n.world, corner, radius);
  out.corner = corner;
  out.color = n.color;
  out.alpha = n.fade * n.energy * 0.12;
  out.softness = 0.0;
  return out;
}

@fragment
fn fs_dots(in: Varyings) -> @location(0) vec4f {
  let d = length(in.corner);
  if (d > 1.0) { discard; }
  let disc = smoothstep(1.0, 0.35 - in.softness * 0.35, d);
  let a = disc * in.alpha;
  return vec4f(in.color * a, a);
}

@fragment
fn fs_halo(in: Varyings) -> @location(0) vec4f {
  let d2 = dot(in.corner, in.corner);
  if (d2 > 1.0) { discard; }
  let a = exp(-d2 * 4.0) * in.alpha;
  return vec4f(in.color * a, 0.0);
}
