import { SHAPE_ID, type ShapeName } from "./shapes";
import type { Theme } from "./theme";
import {
  cameraBasis,
  clamp,
  damp,
  lookAt,
  multiply,
  perspectiveGL,
  type Vec3,
} from "./math";
import type { Backend, BackendOptions } from "./types";

/* ===========================================================================
   GLSL ES 3.00 — a direct port of the WGSL field so both backends agree
   =========================================================================== */

const COMMON_GLSL = /* glsl */ `
const float PI = 3.14159265359;
const float TAU = 6.28318530718;

float hash11(float p) {
  float x = fract(p * 0.1031);
  x *= x + 33.33;
  x *= x + x;
  return fract(x);
}

float hash31(vec3 p) {
  vec3 p3 = fract(p * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float noise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), u.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), u.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), u.x), u.y),
    u.z);
}

vec3 potential(vec3 p) {
  return vec3(
    noise3(p),
    noise3(p + vec3(31.41, 17.73, 8.31)),
    noise3(p + vec3(-9.22, 43.17, 21.64))
  );
}

vec3 curlNoise(vec3 p) {
  float e = 0.32;
  vec3 p0 = potential(p);
  vec3 px = potential(p + vec3(e, 0.0, 0.0));
  vec3 py = potential(p + vec3(0.0, e, 0.0));
  vec3 pz = potential(p + vec3(0.0, 0.0, e));
  return vec3(
    (py.z - p0.z) - (pz.y - p0.y),
    (pz.x - p0.x) - (px.z - p0.z),
    (px.y - p0.y) - (py.x - p0.x)
  ) / e;
}

vec3 shapeTarget(int id, float fi, float n, float t) {
  float r1 = hash11(fi * 1.71 + 0.37);
  float r2 = hash11(fi * 3.13 + 11.79);
  float r3 = hash11(fi * 5.97 + 27.41);

  if (id == 1) {                                   // triangle
    vec3 a = vec3( 0.0,  1.46, 0.0);
    vec3 b = vec3(-1.68, -1.18, 0.0);
    vec3 c = vec3( 1.68, -1.18, 0.0);
    float jitter = (hash11(fi * 7.31) - 0.5) * 0.085;
    if (r3 < 0.97) {
      float e = floor(r1 * 3.0);
      vec3 p = mix(c, a, r2);
      if (e < 1.0) p = mix(a, b, r2);
      else if (e < 2.0) p = mix(b, c, r2);
      return p + vec3(0.0, 0.0, jitter);
    }
    float u = r1;
    float v = r2;
    if (u + v > 1.0) { u = 1.0 - u; v = 1.0 - v; }
    return a + u * (b - a) + v * (c - a) + vec3(0.0, 0.0, jitter * 0.7);
  }
  if (id == 2) {                                   // fibonacci sphere
    float k = fi + 0.5;
    float phi = acos(1.0 - 2.0 * k / n);
    float theta = PI * (1.0 + sqrt(5.0)) * k;
    return vec3(cos(theta) * sin(phi), sin(theta) * sin(phi), cos(phi)) * 1.68;
  }
  if (id == 3) {                                   // torus
    float u = r1 * TAU;
    float v = r2 * TAU;
    return vec3((1.35 + 0.52 * cos(v)) * cos(u), 0.52 * sin(v), (1.35 + 0.52 * cos(v)) * sin(u));
  }
  if (id == 4) {                                   // wave grid
    float gx = (r1 - 0.5) * 5.4;
    float gz = (r2 - 0.5) * 5.4;
    float y = sin(gx * 1.55 + t * 0.9) * cos(gz * 1.55 - t * 0.68) * 0.46;
    return vec3(gx, y - 0.15, gz);
  }
  if (id == 5) {                                   // double helix
    float y = (r2 - 0.5) * 3.5;
    float ang = r2 * 5.0 * TAU + t * 0.25;
    vec3 s1 = vec3(cos(ang) * 0.88, y, sin(ang) * 0.88);
    vec3 s2 = vec3(cos(ang + PI) * 0.88, y, sin(ang + PI) * 0.88);
    if (r3 < 0.16) return mix(s1, s2, r1);
    return r1 < 0.5 ? s1 : s2;
  }
  if (id == 6) {                                   // spiral galaxy
    float arm = floor(r1 * 3.0);
    float rad = pow(r2, 0.55) * 2.45;
    float scatter = (hash11(fi * 9.13) - 0.5) * (0.3 + rad * 0.34);
    float ang = rad * 1.85 + arm * (TAU / 3.0) + t * 0.06 + scatter;
    float y = (hash11(fi * 13.77) - 0.5) * 0.4 * exp(-rad * 0.55);
    return vec3(cos(ang) * rad, y, sin(ang) * rad);
  }
  float th = r1 * TAU;                             // open field
  float ph = acos(2.0 * r2 - 1.0);
  float rad = 1.3 + r3 * 1.7;
  return vec3(rad * sin(ph) * cos(th) * 1.55, rad * sin(ph) * sin(th) * 0.82, rad * cos(ph));
}
`;

/** Physics step. Runs as a vertex shader with rasterisation discarded; the
 *  new position and velocity are captured by transform feedback. */
const UPDATE_VS = /* glsl */ `#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aVel;
in float aSeed;

out vec3 vPos;
out vec3 vVel;

uniform float uDt;
uniform float uTime;
uniform int   uShape;
uniform float uMorph;
uniform float uTurbulence;
uniform float uAttract;
uniform float uDamping;
uniform vec3  uPointer;
uniform float uPointerActive;
uniform vec3  uBurst;
uniform float uBurstAmount;
uniform float uCount;

${COMMON_GLSL}

void main() {
  float fi = float(gl_VertexID);
  float dt = min(uDt, 0.033);

  vec3 target = shapeTarget(uShape, fi, uCount, uTime);
  vec3 force = (target - aPos) * (uAttract * (1.0 + uMorph * 3.0));

  force += curlNoise(aPos * 0.42 + vec3(0.0, 0.0, uTime * 0.085)) * uTurbulence;

  if (uPointerActive > 0.001) {
    vec3 d = aPos - uPointer;
    float dist2 = dot(d, d) + 0.09;
    force += (d / sqrt(dist2)) * min(uPointerActive * 3.6 / dist2, 30.0);
  }

  if (uBurstAmount > 0.001) {
    vec3 d = aPos - uBurst;
    float dist2 = dot(d, d) + 0.22;
    force += (d / sqrt(dist2)) * (uBurstAmount * 30.0 / dist2);
  }

  vec3 vel = (aVel + force * dt) * exp(-uDamping * dt);
  vec3 pos = aPos + vel * dt;

  float far = length(pos);
  if (far > 6.5) {
    pos *= 6.5 / far;
    vel *= 0.35;
  }

  vPos = pos;
  vVel = vel;
  gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

const UPDATE_FS = /* glsl */ `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() { fragColor = vec4(0.0); }
`;

const RENDER_VS = /* glsl */ `#version 300 es
precision highp float;

in vec3 aPos;
in vec3 aVel;

uniform mat4  uViewProj;
uniform float uPointScale;   // pixels per world unit at the focal plane
uniform float uPointSize;
uniform float uNdcOffsetX;
uniform float uNdcOffsetY;
uniform vec3  uColorA;
uniform vec3  uColorB;

out vec3  vTint;
out float vEnergy;

void main() {
  float energy = clamp(length(aVel) * 0.4, 0.0, 1.0);
  vec4 clip = uViewProj * vec4(aPos, 1.0);
  clip.x += uNdcOffsetX * clip.w;
  clip.y += uNdcOffsetY * clip.w;
  gl_Position = clip;
  // Perspective-correct sizing: sprites shrink with distance like real geometry.
  gl_PointSize = max(1.0, uPointSize * (0.55 + energy * 0.9) * uPointScale / max(clip.w, 0.001));
  vTint = mix(uColorA, uColorB, clamp(energy * 1.45, 0.0, 1.0));
  vEnergy = energy;
}
`;

const RENDER_FS = /* glsl */ `#version 300 es
precision mediump float;

in vec3  vTint;
in float vEnergy;

uniform float uIntensity;
uniform float uFade;

out vec4 fragColor;

void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (d > 1.0) discard;
  float halo = pow(1.0 - d, 2.4);
  float core = pow(1.0 - d, 14.0) * 0.85;
  float a = (halo + core) * uIntensity * uFade;
  fragColor = vec4(vTint * a, a);
}
`;

/* ===========================================================================
   Renderer
   =========================================================================== */

const FOV = (50 * Math.PI) / 180;
const CAM_DIST = 5.75;

/** Both of these match the WebGPU backend so the two look identical. */
function ndcOffsetFor(aspect: number): number {
  if (aspect < 1.05) return 0;
  return Math.min(0.36, (aspect - 1.05) * 0.5);
}

function camDistFor(aspect: number): number {
  const needed = 1.95 / (Math.tan(FOV / 2) * Math.max(aspect, 0.3));
  return clamp(needed, CAM_DIST, 9.8);
}

function ndcOffsetYFor(aspect: number): number {
  return aspect < 1.05 ? 0.2 : 0;
}

export function createWebGL2Backend(
  canvas: HTMLCanvasElement,
  opts: BackendOptions
): Backend {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: "high-performance",
    desynchronized: true,
  });
  if (!gl) throw new Error("webgl2 unavailable");

  const updateProgram = link(gl, UPDATE_VS, UPDATE_FS, ["vPos", "vVel"]);
  const renderProgram = link(gl, RENDER_VS, RENDER_FS);

  let count = opts.count;

  // Ping-pong state: read from index `src`, write to `1 - src`.
  let posBuffers: WebGLBuffer[] = [];
  let velBuffers: WebGLBuffer[] = [];
  let seedBuffer: WebGLBuffer = gl.createBuffer()!;
  let updateVAOs: WebGLVertexArrayObject[] = [];
  let renderVAOs: WebGLVertexArrayObject[] = [];
  let src = 0;

  const uUpdate = uniformMap(gl, updateProgram, [
    "uDt", "uTime", "uShape", "uMorph", "uTurbulence", "uAttract", "uDamping",
    "uPointer", "uPointerActive", "uBurst", "uBurstAmount", "uCount",
  ]);
  const uRender = uniformMap(gl, renderProgram, [
    "uViewProj", "uPointScale", "uPointSize", "uNdcOffsetX", "uNdcOffsetY",
    "uColorA", "uColorB", "uIntensity", "uFade",
  ]);

  const aUpdate = {
    pos: gl.getAttribLocation(updateProgram, "aPos"),
    vel: gl.getAttribLocation(updateProgram, "aVel"),
    seed: gl.getAttribLocation(updateProgram, "aSeed"),
  };
  const aRender = {
    pos: gl.getAttribLocation(renderProgram, "aPos"),
    vel: gl.getAttribLocation(renderProgram, "aVel"),
  };

  function allocate(n: number) {
    for (const b of [...posBuffers, ...velBuffers]) gl!.deleteBuffer(b);
    for (const v of [...updateVAOs, ...renderVAOs]) gl!.deleteVertexArray(v);

    const { positions, seeds } = seedParticles(n);
    const zeros = new Float32Array(n * 3);

    posBuffers = [makeBuffer(gl!, positions), makeBuffer(gl!, positions)];
    velBuffers = [makeBuffer(gl!, zeros), makeBuffer(gl!, zeros)];
    gl!.bindBuffer(gl!.ARRAY_BUFFER, seedBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, seeds, gl!.STATIC_DRAW);

    updateVAOs = [0, 1].map((i) => {
      const vao = gl!.createVertexArray()!;
      gl!.bindVertexArray(vao);
      bindAttrib(gl!, posBuffers[i], aUpdate.pos, 3);
      bindAttrib(gl!, velBuffers[i], aUpdate.vel, 3);
      bindAttrib(gl!, seedBuffer, aUpdate.seed, 1);
      return vao;
    });
    renderVAOs = [0, 1].map((i) => {
      const vao = gl!.createVertexArray()!;
      gl!.bindVertexArray(vao);
      bindAttrib(gl!, posBuffers[i], aRender.pos, 3);
      bindAttrib(gl!, velBuffers[i], aRender.vel, 3);
      return vao;
    });
    gl!.bindVertexArray(null);
    src = 0;
  }
  allocate(count);

  const transformFeedback = gl.createTransformFeedback()!;

  const state = {
    shape: SHAPE_ID[opts.shape],
    theme: opts.theme,
    morph: 1,
    turbulence: opts.turbulence,
    pointer: [0, 0, 0] as Vec3,
    pointerActive: 0,
    burst: [0, 0, 0] as Vec3,
    burstAmount: 0,
    fade: 0,
    yaw: 0,
    pitch: 0,
    targetYaw: 0,
    targetPitch: 0,
    paused: false,
    visible: true,
  };

  let width = 1;
  let height = 1;
  let dpr = 1;
  let raf = 0;
  let last = performance.now();
  let elapsed = 0;
  let destroyed = false;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr);
    width = Math.max(1, Math.round(rect.width * dpr));
    height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = width;
    canvas.height = height;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE); // additive

  function currentEye(dist = camDistFor(width / height)): Vec3 {
    return [
      Math.sin(state.yaw) * Math.cos(state.pitch) * dist,
      Math.sin(state.pitch) * dist,
      Math.cos(state.yaw) * Math.cos(state.pitch) * dist,
    ];
  }

  function frame(now: number) {
    if (destroyed) return;
    raf = requestAnimationFrame(frame);

    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (state.paused || !state.visible || width < 2) return;
    elapsed += dt;

    state.morph = damp(state.morph, 0, 2.6, dt);
    state.burstAmount = damp(state.burstAmount, 0, 3.4, dt);
    state.fade = damp(state.fade, 1, 1.6, dt);

    const isField = state.shape === 0;

    // ---- physics step via transform feedback --------------------------------
    gl!.useProgram(updateProgram);
    gl!.uniform1f(uUpdate.uDt, dt);
    gl!.uniform1f(uUpdate.uTime, elapsed);
    gl!.uniform1i(uUpdate.uShape, state.shape);
    gl!.uniform1f(uUpdate.uMorph, state.morph);
    gl!.uniform1f(uUpdate.uTurbulence, state.turbulence * (isField ? 1.5 : 1));
    gl!.uniform1f(uUpdate.uAttract, isField ? 0.22 : 3.8);
    gl!.uniform1f(uUpdate.uDamping, isField ? 0.85 : 2.1);
    gl!.uniform3fv(uUpdate.uPointer, state.pointer);
    gl!.uniform1f(uUpdate.uPointerActive, state.pointerActive);
    gl!.uniform3fv(uUpdate.uBurst, state.burst);
    gl!.uniform1f(uUpdate.uBurstAmount, state.burstAmount);
    gl!.uniform1f(uUpdate.uCount, count);

    const dst = 1 - src;
    gl!.bindVertexArray(updateVAOs[src]);
    gl!.bindTransformFeedback(gl!.TRANSFORM_FEEDBACK, transformFeedback);
    gl!.bindBufferBase(gl!.TRANSFORM_FEEDBACK_BUFFER, 0, posBuffers[dst]);
    gl!.bindBufferBase(gl!.TRANSFORM_FEEDBACK_BUFFER, 1, velBuffers[dst]);
    gl!.enable(gl!.RASTERIZER_DISCARD);
    gl!.beginTransformFeedback(gl!.POINTS);
    gl!.drawArrays(gl!.POINTS, 0, count);
    gl!.endTransformFeedback();
    gl!.disable(gl!.RASTERIZER_DISCARD);
    gl!.bindBufferBase(gl!.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl!.bindBufferBase(gl!.TRANSFORM_FEEDBACK_BUFFER, 1, null);
    gl!.bindTransformFeedback(gl!.TRANSFORM_FEEDBACK, null);

    // ---- camera -------------------------------------------------------------
    state.yaw = damp(state.yaw, state.targetYaw + Math.sin(elapsed * 0.12) * 0.06, 2.2, dt);
    state.pitch = damp(state.pitch, state.targetPitch + Math.sin(elapsed * 0.09) * 0.03, 2.2, dt);

    const aspect = width / height;
    const dist = camDistFor(aspect);
    const eye = currentEye(dist);
    const viewProj = multiply(
      perspectiveGL(FOV, aspect, 0.1, 100),
      lookAt(eye, [0, 0, 0], [0, 1, 0])
    );

    // ---- draw ---------------------------------------------------------------
    gl!.viewport(0, 0, width, height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    gl!.useProgram(renderProgram);
    gl!.uniformMatrix4fv(uRender.uViewProj, false, viewProj);
    gl!.uniform1f(uRender.uPointScale, height / (2 * Math.tan(FOV / 2)));
    gl!.uniform1f(uRender.uPointSize, opts.pointSize * (dist / CAM_DIST));
    gl!.uniform1f(uRender.uNdcOffsetX, ndcOffsetFor(aspect));
    gl!.uniform1f(uRender.uNdcOffsetY, ndcOffsetYFor(aspect));
    gl!.uniform3fv(uRender.uColorA, state.theme.colorA);
    gl!.uniform3fv(uRender.uColorB, state.theme.colorB);
    gl!.uniform1f(uRender.uIntensity, opts.intensity);
    gl!.uniform1f(uRender.uFade, state.fade);

    gl!.bindVertexArray(renderVAOs[dst]);
    gl!.drawArrays(gl!.POINTS, 0, count);
    gl!.bindVertexArray(null);

    src = dst;
  }

  raf = requestAnimationFrame(frame);

  const vis = () => {
    state.visible = document.visibilityState === "visible";
    last = performance.now();
  };
  document.addEventListener("visibilitychange", vis);

  return {
    kind: "webgl2",
    adapterLabel: describeGL(gl),
    get count() {
      return count;
    },
    setShape(shape: ShapeName) {
      state.shape = SHAPE_ID[shape];
      state.morph = 1;
    },
    setTheme(theme: Theme) {
      state.theme = theme;
    },
    setTurbulence(v: number) {
      state.turbulence = v;
    },
    setPaused(p: boolean) {
      state.paused = p;
      last = performance.now();
    },
    setPointer(world: Vec3 | null) {
      if (world) {
        state.pointer = world;
        state.pointerActive = 1;
        state.targetYaw = clamp(world[0] * 0.04, -0.25, 0.25);
        state.targetPitch = clamp(-world[1] * 0.03, -0.18, 0.18);
      } else {
        state.pointerActive = 0;
        state.targetYaw = 0;
        state.targetPitch = 0;
      }
    },
    burst(world: Vec3) {
      state.burst = world;
      state.burstAmount = 1;
    },
    screenToWorld(ndcX: number, ndcY: number): Vec3 {
      const aspect = width / height;
      const dist = camDistFor(aspect);
      const halfH = Math.tan(FOV / 2) * dist;
      const halfW = halfH * aspect;
      ndcX -= ndcOffsetFor(aspect);
      ndcY -= ndcOffsetYFor(aspect);
      const b = cameraBasis(currentEye(dist), [0, 0, 0], [0, 1, 0]);
      const x = ndcX * halfW;
      const y = ndcY * halfH;
      return [
        b.right[0] * x + b.up[0] * y,
        b.right[1] * x + b.up[1] * y,
        b.right[2] * x + b.up[2] * y,
      ];
    },
    setCount(next: number) {
      const clamped = Math.max(2048, Math.min(Math.round(next), opts.maxCount));
      if (clamped === count) return count;
      count = clamped;
      allocate(count);
      state.morph = 1;
      return count;
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", vis);
      gl!.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

/* ===========================================================================
   GL helpers
   =========================================================================== */

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader compile failed: ${log}`);
  }
  return shader;
}

function link(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
  feedbackVaryings?: string[]
): WebGLProgram {
  const program = gl.createProgram()!;
  const vs = compile(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fsSource);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  if (feedbackVaryings) {
    gl.transformFeedbackVaryings(program, feedbackVaryings, gl.SEPARATE_ATTRIBS);
  }
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`program link failed: ${log}`);
  }
  return program;
}

function uniformMap<K extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: K[]
): Record<K, WebGLUniformLocation | null> {
  const out = {} as Record<K, WebGLUniformLocation | null>;
  for (const n of names) out[n] = gl.getUniformLocation(program, n);
  return out;
}

function makeBuffer(gl: WebGL2RenderingContext, data: Float32Array): WebGLBuffer {
  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_COPY);
  return buffer;
}

function bindAttrib(
  gl: WebGL2RenderingContext,
  buffer: WebGLBuffer,
  location: number,
  size: number
) {
  if (location < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
}

function describeGL(gl: WebGL2RenderingContext): string {
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  const raw = ext
    ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string)
    : (gl.getParameter(gl.RENDERER) as string);
  return raw ? raw.replace(/\s*\([^)]*\)\s*/g, " ").trim().slice(0, 48) : "WebGL2 device";
}

function seedParticles(count: number) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 4.2 + Math.random() * 2.1;
    positions[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r;
    positions[i * 3 + 2] = Math.cos(phi) * r;
    seeds[i] = Math.random();
  }
  return { positions, seeds };
}
