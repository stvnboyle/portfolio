// The request map: service nodes, the links between them, and requests that
// travel the links as bright heads with short trails. Everything is drawn in
// device pixels so lines and rings stay one pixel crisp at any DPR.

struct Trace {
  // width, height (device px), dpr, time
  frame: vec4f,
  // inset (device px), vertical (0/1), node count, edge count
  shape: vec4f,
  // pointer x, y (device px, negative when away), pulse count, -
  pointer: vec4f,
  // x, y (0..1 layout), lit (0..1), -
  nodes: array<vec4f, 8>,
  nodeTint: array<vec4f, 8>,
  // node a, node b, heat (0..1), -
  edges: array<vec4f, 12>,
  edgeTint: array<vec4f, 12>,
  // node from, node to, progress (0..1), strength
  pulses: array<vec4f, 16>,
  pulseTint: array<vec4f, 16>,
}

@group(0) @binding(0) var<uniform> trace: Trace;

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// A node's layout position, in device pixels.
fn place(i: u32) -> vec2f {
  let c = trace.nodes[i].xy;
  let v = select(c, vec2f(c.y, c.x), trace.shape.y > 0.5);
  let inset = trace.shape.x;
  return inset + v * (trace.frame.xy - 2.0 * inset);
}

// Distance from p to segment ab, and how far along ab (0..1) its closest point is.
fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let ab = b - a;
  let s = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
  return vec2f(length(p - a - ab * s), s);
}

// A line of the given width, antialiased over one pixel.
fn stroke(d: f32, width: f32) -> f32 {
  return 1.0 - smoothstep(width * 0.5 - 0.5, width * 0.5 + 0.5, d);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * trace.frame.xy;
  let dpr = trace.frame.z;

  var col = vec3f(0.043, 0.043, 0.051);

  // Faint dot grid behind everything.
  let cell = 24.0 * dpr;
  let g = (fract(p / cell) - 0.5) * cell;
  col += vec3f(0.06) * stroke(length(g), 1.6 * dpr);

  // Links: a dim hairline that warms up after traffic crosses it.
  for (var e = 0u; e < u32(trace.shape.w); e++) {
    let edge = trace.edges[e];
    let seg = segment(p, place(u32(edge.x)), place(u32(edge.y)));
    let line = stroke(seg.x, dpr);
    col = mix(col, vec3f(0.2, 0.21, 0.25), line * 0.9);
    col += trace.edgeTint[e].rgb * edge.z * (line * 0.55 + exp(-seg.x / (4.0 * dpr)) * 0.12);
  }

  // Requests: a bright head and a trail that fades behind it.
  for (var k = 0u; k < u32(trace.pointer.z); k++) {
    let pulse = trace.pulses[k];
    let tint = trace.pulseTint[k].rgb;
    let a = place(u32(pulse.x));
    let b = place(u32(pulse.y));
    let seg = segment(p, a, b);
    let len = max(length(b - a), 1.0);
    let trail = min(0.5, 150.0 * dpr / len);
    let behind = pulse.z - seg.y;
    let fade = select(0.0, pow(1.0 - behind / trail, 2.0), behind >= 0.0 && behind < trail);
    col += tint * pulse.w * fade * (stroke(seg.x, 1.6 * dpr) * 1.1 + exp(-seg.x / (5.0 * dpr)) * 0.2);

    let hd = length(p - mix(a, b, pulse.z));
    col += tint * pulse.w * (stroke(hd, 5.0 * dpr) * 1.3 + exp(-hd / (7.0 * dpr)) * 0.45);
  }

  // Nodes: a ring that fills with colour as a request arrives, and brightens under the pointer.
  let r = 7.0 * dpr;
  for (var i = 0u; i < u32(trace.shape.z); i++) {
    let q = place(i);
    let d = length(p - q);
    let lit = trace.nodes[i].z;
    let tint = trace.nodeTint[i].rgb;
    let hover = 1.0 - smoothstep(16.0 * dpr, 30.0 * dpr, length(trace.pointer.xy - q));

    col += tint * lit * exp(-max(d - r, 0.0) / (9.0 * dpr)) * 0.35;
    let inside = 1.0 - smoothstep(r - 0.5, r + 0.5, d);
    col = mix(col, vec3f(0.05, 0.05, 0.06) + tint * lit * 0.35, inside);
    let ring = stroke(abs(d - r), 1.4 * dpr);
    let ringColor = mix(vec3f(0.42, 0.44, 0.5) + hover * 0.35, tint * 1.25, lit);
    col = mix(col, ringColor, ring);
  }

  // Dither so the soft glows don't band.
  col += (hash(p + trace.frame.w) - 0.5) / 255.0;
  return vec4f(min(col, vec3f(1.0)), 1.0);
}
