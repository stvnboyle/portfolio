// Every grid node is an instanced camera-facing disc. Height is the simulated
// ripple plus a slow analytic swell; a normal from neighbouring nodes lights
// the surface, and ripple energy tints it with a soft pastel spectrum.

struct View {
  viewProjection: mat4x4f,
  // p00, p11, disc radius, time
  lens: vec4f,
  // nodes x, nodes z, width, depth
  grid: vec4f,
  // near z, height scale, focus (0..1 of depth), -
  shape: vec4f,
}

@group(0) @binding(0) var<uniform> view: View;
@group(0) @binding(1) var<storage, read> heights: array<f32>;

struct Varyings {
  @builtin(position) position: vec4f,
  @location(0) corner: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
  @location(3) softness: f32,
}

fn swell(x: f32, z: f32, t: f32) -> f32 {
  return sin(x * 0.38 + t * 0.26) * 0.15
    + sin(z * 0.55 - t * 0.19 + x * 0.16) * 0.11
    + sin((x - z) * 1.1 + t * 0.37) * 0.03;
}

fn nodeWorld(ix: i32, iz: i32) -> vec2f {
  let fx = f32(ix) / (view.grid.x - 1.0);
  let fz = f32(iz) / (view.grid.y - 1.0);
  return vec2f((fx - 0.5) * view.grid.z, view.shape.x - fz * view.grid.w);
}

fn simulated(ix: i32, iz: i32) -> f32 {
  let x = clamp(ix, 0, i32(view.grid.x) - 1);
  let z = clamp(iz, 0, i32(view.grid.y) - 1);
  return heights[u32(z) * u32(view.grid.x) + u32(x)] * view.shape.y;
}

fn surfaceHeight(ix: i32, iz: i32) -> f32 {
  let p = nodeWorld(ix, iz);
  return simulated(ix, iz) + swell(p.x, p.y, view.lens.w);
}

// Inigo Quilez's cosine palette, kept pale: a soft lavender-sky-mint-peach loop.
fn pastel(t: f32) -> vec3f {
  return vec3f(0.74, 0.72, 0.8) + vec3f(0.24, 0.24, 0.2) * cos(6.28318 * (vec3f(1.0) * t + vec3f(0.0, 0.33, 0.67)));
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> Varyings {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0)
  );

  let gx = u32(view.grid.x);
  let ix = i32(ii % gx);
  let iz = i32(ii / gx);
  let fx = f32(ix) / (view.grid.x - 1.0);
  let fz = f32(iz) / (view.grid.y - 1.0);
  let p = nodeWorld(ix, iz);
  let t = view.lens.w;

  let ripple = simulated(ix, iz);
  let h = ripple + swell(p.x, p.y, t);

  // Surface normal from central differences over neighbouring nodes.
  let sx = view.grid.z / (view.grid.x - 1.0);
  let sz = view.grid.w / (view.grid.y - 1.0);
  let dhdx = (surfaceHeight(ix + 1, iz) - surfaceHeight(ix - 1, iz)) / (2.0 * sx);
  let dhdz = (surfaceHeight(ix, iz - 1) - surfaceHeight(ix, iz + 1)) / (2.0 * sz);
  let normal = normalize(vec3f(-dhdx, 1.0, -dhdz));

  // Ripple energy: height plus slope of the simulated part only.
  let rx = simulated(ix + 1, iz) - simulated(ix - 1, iz);
  let rz = simulated(ix, iz + 1) - simulated(ix, iz - 1);
  let energy = clamp(abs(ripple) * 2.2 + length(vec2f(rx, rz)) * 4.0, 0.0, 1.0);

  // A soft key light from behind-left, with a gentle sheen towards the viewer.
  let key = normalize(vec3f(-0.35, 0.75, -0.55));
  let halfway = normalize(key + vec3f(0.0, 0.35, 1.0));
  let diffuse = max(dot(normal, key), 0.0);
  let sheen = pow(max(dot(normal, halfway), 0.0), 28.0);

  let tint = pastel(fx * 0.55 + fz * 0.8 + ripple * 2.0 + t * 0.012);
  let grey = vec3f(0.58, 0.6, 0.66);
  let splash = smoothstep(0.03, 0.8, energy);
  let base = mix(grey, tint, splash);
  let color = base * (0.2 + 0.4 * diffuse + 0.45 * splash) + vec3f(sheen * 0.3);

  // Depth of field: discs away from the focal band grow softer and fainter.
  let defocus = abs(fz - view.shape.z);
  let radius = view.lens.z * (1.0 + defocus * 1.6);

  var clip = view.viewProjection * vec4f(p.x, h, p.y, 1.0);
  let corner = corners[vi];
  // Offsetting before the perspective divide keeps the discs world-sized.
  clip.x += corner.x * radius * view.lens.x;
  clip.y += corner.y * radius * view.lens.y;

  let fade = smoothstep(0.0, 0.07, fz)
    * (1.0 - smoothstep(0.38, 0.97, fz))
    * (1.0 - smoothstep(0.34, 0.5, abs(fx - 0.5)));

  var out: Varyings;
  out.position = clip;
  out.corner = corner;
  out.color = color;
  out.alpha = fade * (0.5 + 0.3 * splash) / (1.0 + defocus * 1.5);
  out.softness = clamp(defocus * 1.4, 0.0, 0.6);
  return out;
}

@fragment
fn fs_main(in: Varyings) -> @location(0) vec4f {
  let d = length(in.corner);
  if (d > 1.0) { discard; }
  let disc = smoothstep(1.0, 0.35 - in.softness * 0.35, d);
  let a = disc * in.alpha;
  return vec4f(in.color * a, a);
}
