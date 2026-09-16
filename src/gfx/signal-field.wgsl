// One step of the glow field the packets paint into. Each node keeps an RGB
// glow that decays, bleeds a little into its neighbours, and picks up colour
// from any packet nearby. `current` is read; `next` is written, then swapped.

struct Field {
  gx: u32,
  gz: u32,
  count: u32,
  // Fraction of glow kept per step.
  decay: f32,
  // How much glow bleeds in from the four neighbours per step.
  bleed: f32,
  // Packet footprint radius, in nodes.
  radius: f32,
}

// Array length mirrors MAX_PACKETS in field.ts; vgpu needs a literal to lay it out.
struct Packets {
  // x, z (nodes), strength, -
  head: array<vec4f, 48>,
  // r, g, b, -
  tint: array<vec4f, 48>,
}

@group(0) @binding(0) var<uniform> field: Field;
@group(0) @binding(1) var<uniform> packets: Packets;
@group(0) @binding(2) var<storage, read> current: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> next: array<vec4f>;

@compute @workgroup_size(16, 16)
fn step(@builtin(global_invocation_id) id: vec3u) {
  if (id.x >= field.gx || id.y >= field.gz) { return; }

  let x = id.x;
  let z = id.y;
  let i = z * field.gx + x;
  let l = z * field.gx + max(x, 1u) - 1u;
  let r = z * field.gx + min(x + 1u, field.gx - 1u);
  let d = (max(z, 1u) - 1u) * field.gx + x;
  let u = min(z + 1u, field.gz - 1u) * field.gx + x;

  let neighbours = (current[l] + current[r] + current[d] + current[u]) * 0.25;
  var glow = mix(current[i], neighbours, field.bleed) * field.decay;

  let p = vec2f(f32(x), f32(z));
  let r2 = field.radius * field.radius;
  for (var k = 0u; k < field.count; k++) {
    let head = packets.head[k];
    let offset = p - head.xy;
    glow += vec4f(packets.tint[k].rgb, 1.0) * head.z * exp(-dot(offset, offset) / r2);
  }

  next[i] = min(glow, vec4f(6.0));
}
