// The dependency graph: hairline edges and crisp discs for packages. An
// install wave runs outwards through the graph by dependency depth, lighting
// each package in the wave's colour as it resolves.

struct View {
  viewProjection: mat4x4f,
  // viewport width, height (CSS px), screen x offset (NDC), time
  frame: vec4f,
  // wave front (depth levels), wave width, -, -
  wave: vec4f,
  // rgb of the wave, -
  tint: vec4f,
}

@group(0) @binding(0) var<uniform> view: View;
// Two vec4s per node: position, velocity.
@group(0) @binding(1) var<storage, read> state: array<vec4f>;
// Per node: depth from the wave's source, degree, highlight (0..1), -
@group(0) @binding(2) var<storage, read> info: array<vec4f>;
// Per edge: node a, node b.
@group(0) @binding(3) var<storage, read> edges: array<vec2u>;

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
}

fn cornerOf(vi: u32) -> vec2f {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );
  return corners[vi];
}

fn project(i: u32) -> vec4f {
  var clip = view.viewProjection * vec4f(state[2u * i].xyz, 1.0);
  clip.x += view.frame.z * clip.w;
  return clip;
}

// How lit a node is: a bright flash as the wave passes, a faint residue after,
// and full brightness while hovered or next to the hovered node.
fn lit(i: u32) -> f32 {
  let m = info[i];
  let behind = view.wave.x - m.x;
  let flash = exp(-behind * behind / (view.wave.y * view.wave.y));
  let residue = select(0.0, 0.1 * exp(-behind * 0.5), behind > 0.0);
  return max(max(flash, residue), m.z);
}

fn grey() -> vec3f {
  return vec3f(0.4, 0.42, 0.5);
}

@vertex
fn vs_nodes(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let corner = cornerOf(vi);
  let clip = project(ii);
  let glow = lit(ii);
  let degree = info[ii].y;

  // Hubs are bigger; radius in CSS pixels, shrinking a little with distance.
  let pixels = (1.6 + log2(1.0 + degree) * 0.9) * (1.0 + glow * 0.5) * clamp(6.0 / clip.w, 0.6, 1.4);
  var out: Varyings;
  out.position = clip + vec4f(corner * pixels / view.frame.xy * 2.0 * clip.w, 0.0, 0.0);
  out.local = corner;
  out.color = mix(grey(), view.tint.rgb * 1.2 + vec3f(0.08), smoothstep(0.05, 0.6, glow));
  out.alpha = clamp(0.55 + glow, 0.0, 1.0) * clamp(1.4 - clip.w * 0.06, 0.35, 1.0);
  return out;
}

@vertex
fn vs_bloom(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let corner = cornerOf(vi);
  let clip = project(ii);
  let glow = lit(ii);
  let pixels = select(0.0, 14.0, glow > 0.1);

  var out: Varyings;
  out.position = clip + vec4f(corner * pixels / view.frame.xy * 2.0 * clip.w, 0.0, 0.0);
  out.local = corner;
  out.color = view.tint.rgb;
  out.alpha = glow * 0.3;
  return out;
}

@vertex
fn vs_edges(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let corner = cornerOf(vi);
  let e = edges[ii];
  let a = project(e.x);
  let b = project(e.y);
  let glow = min(lit(e.x), lit(e.y));

  // A screen-space quad along the edge, a couple of pixels wide for antialiasing.
  let sa = a.xy / a.w * view.frame.xy;
  let sb = b.xy / b.w * view.frame.xy;
  let along = normalize(sb - sa + vec2f(1e-4, 0.0));
  let across = vec2f(-along.y, along.x);
  let t = corner.x * 0.5 + 0.5;
  let end = mix(a, b, t);
  let offset = across * corner.y * 1.5 / view.frame.xy * 2.0 * end.w;

  var out: Varyings;
  out.position = end + vec4f(offset, 0.0, 0.0);
  out.local = vec2f(0.0, corner.y * 1.5);
  out.color = mix(grey(), view.tint.rgb, smoothstep(0.05, 0.5, glow));
  out.alpha = 0.13 + glow * 0.5;
  return out;
}

@fragment
fn fs_disc(in: Varyings) -> @location(0) vec4f {
  let d = length(in.local);
  let aa = max(fwidth(d), 1e-3);
  let disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (disc <= 0.0) { discard; }
  let a = disc * in.alpha;
  return vec4f(in.color * a, a);
}

@fragment
fn fs_bloom(in: Varyings) -> @location(0) vec4f {
  let d2 = dot(in.local, in.local);
  if (d2 > 1.0) { discard; }
  let a = exp(-d2 * 5.0) * in.alpha;
  return vec4f(in.color * a, 0.0);
}

@fragment
fn fs_line(in: Varyings) -> @location(0) vec4f {
  // `local.y` is the distance from the centre line in pixels: a one-pixel core.
  let a = (1.0 - smoothstep(0.25, 1.1, abs(in.local.y))) * in.alpha;
  return vec4f(in.color * a, a);
}
