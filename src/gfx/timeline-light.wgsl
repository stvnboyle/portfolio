// A light that runs down the timeline's branch lanes as the page scrolls, like
// a commit history being replayed: a bright head at the reading line, a trail
// behind it, and commit nodes that light up once it has passed them. Drawn in
// CSS pixels over the DOM graph, on a transparent canvas.

struct Light {
  // width, height (CSS px), device pixel ratio, time
  frame: vec4f,
  // head y (CSS px), strength (0..1), lane count, node count
  head: vec4f,
  // x, top, bottom (CSS px), -
  lanes: array<vec4f, 4>,
  laneTint: array<vec4f, 4>,
  // x, y (CSS px), lane index, -
  nodes: array<vec4f, 16>,
}

@group(0) @binding(0) var<uniform> light: Light;

fn stroke(d: f32, width: f32, px: f32) -> f32 {
  return 1.0 - smoothstep(width * 0.5 - px * 0.5, width * 0.5 + px * 0.5, d);
}

@fragment
fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = uv * light.frame.xy;
  let px = 1.0 / light.frame.z;
  let hy = light.head.x;
  let on = light.head.y;
  var col = vec3f(0.0);

  for (var i = 0u; i < u32(light.head.z); i++) {
    let lane = light.lanes[i];
    let tint = light.laneTint[i].rgb;
    let d = abs(p.x - lane.x);
    let inside = step(lane.y, p.y) * step(p.y, lane.z);

    // Trail: bright at the head, fading back up the lane; a short lead below it.
    let behind = hy - p.y;
    let trail = select(exp(behind / 24.0), exp(-behind / 280.0), behind >= 0.0);
    col += tint * inside * trail * on * (stroke(d, 2.0, px) * 1.1 + exp(-d / 5.0) * 0.3);

    // Head: a point of light where the reading line crosses the lane.
    let y = clamp(hy, lane.y, lane.z);
    let reach = 1.0 - smoothstep(0.0, 60.0, abs(hy - y));
    let hd = length(p - vec2f(lane.x, y));
    col += tint * on * reach * (stroke(hd, 6.0, px) * 1.2 + exp(-hd / 10.0) * 0.55);
  }

  // Commits the light has passed keep a halo, brightest just after it passes.
  for (var k = 0u; k < u32(light.head.w); k++) {
    let node = light.nodes[k];
    let tint = light.laneTint[u32(node.z)].rgb;
    let passed = hy - node.y;
    let lit = smoothstep(0.0, 18.0, passed) * (0.3 + 0.7 * exp(-max(passed, 0.0) / 240.0)) * on;
    let d = length(p - node.xy);
    col += tint * lit * (stroke(abs(d - 5.5), 2.0, px) + exp(-max(d - 5.5, 0.0) / 7.0) * 0.45);
  }

  let a = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
  return vec4f(min(col, vec3f(1.0)), a);
}
