// The grid as a perspective plane of instanced discs, lit by the glow field.
// Two passes share one layout: a tight additive bloom under lit nodes, then
// the dots themselves, antialiased to the pixel so they stay crisp at any size.

struct View {
  viewProjection: mat4x4f,
  // p00, p11, disc radius, time
  lens: vec4f,
  // nodes x, nodes z, width, depth
  grid: vec4f,
  // near z, -, lift per unit of glow, viewport height (px)
  shape: vec4f,
  // Hover spotlight: x, z (nodes), strength, radius (nodes)
  cursor: vec4f,
  // rgb of the spotlight, -
  cursorTint: vec4f,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> glow: array<vec4f>;

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
}

struct Node {
  world: vec3f,
  color: vec3f,
  energy: f32,
  fade: f32,
}

fn node(ii: u32) -> Node {
  let gx = u32(view.grid.x);
  let fx = f32(ii % gx) / (view.grid.x - 1.0);
  let fz = f32(ii / gx) / (view.grid.y - 1.0);
  let x = (fx - 0.5) * view.grid.z;
  let z = view.shape.x - fz * view.grid.w;
  let t = view.lens.w;

  // Tone-map on the brightest channel only, so a strong packet stays its own
  // saturated colour instead of washing out towards white.
  // The pointer lights nodes directly, so hover answers on the same frame
  // instead of waiting for the field to build up.
  let dc = vec2f(f32(ii % gx), f32(ii / gx)) - view.cursor.xy;
  let spot = view.cursor.z * exp(-dot(dc, dc) / (view.cursor.w * view.cursor.w));
  let g = glow[ii].rgb + view.cursorTint.rgb * spot;
  let peak = max(max(g.r, g.g), g.b);
  let energy = 1.0 - exp(-peak * 1.6);
  let hue = g / max(peak, 1e-4);

  // A barely-there swell keeps the plane breathing; glow lifts nodes slightly.
  let swell = sin(x * 0.35 + t * 0.08) * 0.05 + sin(z * 0.5 - t * 0.06) * 0.04;

  var n: Node;
  n.world = vec3f(x, swell + energy * view.shape.z, z);
  // Faint residue stays grey: colour only shows where a packet really is.
  let lit = smoothstep(0.08, 0.55, energy);
  n.color = mix(vec3f(0.36, 0.38, 0.44), hue * 1.15, lit) + vec3f(lit * lit * 0.16);
  n.energy = energy;
  n.fade = smoothstep(0.0, 0.06, fz)
    * (1.0 - smoothstep(0.42, 0.96, fz))
    * (1.0 - smoothstep(0.36, 0.5, abs(fx - 0.5)));
  return n;
}

struct Placed {
  clip: vec4f,
  // 0..1: how much of the disc survives at its on-screen size.
  coverage: f32,
}

// Discs are world-sized, but clamped in screen pixels: near ones stop growing
// into blobs, and ones smaller than a pixel fade instead of shimmering.
fn place(world: vec3f, corner: vec2f, radius: f32, maxPixels: f32) -> Placed {
  var clip = view.viewProjection * vec4f(world, 1.0);
  let pixels = radius * view.lens.y / max(clip.w, 1e-4) * 0.5 * view.shape.w;
  let r = radius * min(1.0, maxPixels / max(pixels, 1e-4));
  clip.x += corner.x * r * view.lens.x;
  clip.y += corner.y * r * view.lens.y;

  var out: Placed;
  out.clip = clip;
  out.coverage = smoothstep(0.45, 1.1, pixels);
  return out;
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

  let placed = place(n.world, corner, view.lens.z * (1.0 + n.energy * 0.35), 3.0 + n.energy * 2.6);

  var out: Varyings;
  out.position = placed.clip;
  out.corner = corner;
  out.color = n.color;
  out.alpha = n.fade * placed.coverage * (0.55 + 0.45 * n.energy);
  return out;
}

@vertex
fn vs_bloom(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  let n = node(ii);
  let corner = cornerOf(vi);
  // Unlit nodes collapse to nothing, so the bloom pass costs almost no fill.
  let radius = select(0.0, view.lens.z * 2.6, n.energy > 0.08);

  let placed = place(n.world, corner, radius, 12.0);

  var out: Varyings;
  out.position = placed.clip;
  out.corner = corner;
  out.color = n.color;
  out.alpha = n.fade * placed.coverage * n.energy * 0.34;
  return out;
}

@fragment
fn fs_dots(in: Varyings) -> @location(0) vec4f {
  let d = length(in.corner);
  // One pixel of antialiasing, whatever size the disc lands at on screen.
  let aa = max(fwidth(d), 1e-3);
  let disc = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (disc <= 0.0) { discard; }
  let a = disc * in.alpha;
  return vec4f(in.color * a, a);
}

@fragment
fn fs_bloom(in: Varyings) -> @location(0) vec4f {
  let d2 = dot(in.corner, in.corner);
  if (d2 > 1.0) { discard; }
  let a = exp(-d2 * 5.0) * in.alpha;
  return vec4f(in.color * a, 0.0);
}
