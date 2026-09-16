import { GLSL_COMPOSITE, GLSL_SCATTER, GLSL_VERTEX } from "./shaders";
import { HEADER_FLOATS, type Renderer } from "./types";

/**
 * Without a float colour buffer the scatter pass renders to RGBA8, so values
 * are divided down on the way in and scaled back up when composited.
 */
const LDR_SCATTER_SCALE = 8;

export function createWebGL2Renderer(canvas: HTMLCanvasElement): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("webgl2 unavailable");

  const floatTarget = Boolean(
    gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float")
  );
  const scatterScale = floatTarget ? 1 : LDR_SCATTER_SCALE;

  function compile(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      throw new Error(`GLSL: ${gl!.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  function program(fragment: string) {
    const p = gl!.createProgram()!;
    gl!.attachShader(p, compile(gl!.VERTEX_SHADER, GLSL_VERTEX));
    gl!.attachShader(p, compile(gl!.FRAGMENT_SHADER, fragment));
    gl!.linkProgram(p);
    if (!gl!.getProgramParameter(p, gl!.LINK_STATUS)) {
      throw new Error(`GLSL link: ${gl!.getProgramInfoLog(p)}`);
    }
    return p;
  }

  // Scatter writes pre-divided values when targeting RGBA8.
  const scatterSource = floatTarget
    ? GLSL_SCATTER
    : GLSL_SCATTER.replace(
        "outColor = vec4(col, 1.0);",
        `outColor = vec4(col / ${LDR_SCATTER_SCALE.toFixed(1)}, 1.0);`
      );
  const scatterProgram = program(scatterSource);
  const compositeProgram = program(GLSL_COMPOSITE);

  const loc = (p: WebGLProgram, name: string) => gl.getUniformLocation(p, name);
  const scatterU = {
    head: loc(scatterProgram, "uHead"),
    lights: loc(scatterProgram, "uLights"),
    mask: loc(scatterProgram, "uMask"),
  };
  const compositeU = {
    head: loc(compositeProgram, "uHead"),
    scatter: loc(compositeProgram, "uScatter"),
    scale: loc(compositeProgram, "uScatterScale"),
  };

  // The fullscreen triangle is generated from gl_VertexID; a bound VAO is
  // still required for drawArrays.
  const vao = gl.createVertexArray();

  function makeTexture() {
    const t = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, t);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return t;
  }

  const mask = makeTexture();
  const scatter = makeTexture();
  const framebuffer = gl.createFramebuffer();
  let scatterSize: [number, number] = [0, 0];
  let hasMask = false;

  function bindTexture(unit: number, texture: WebGLTexture, location: WebGLUniformLocation | null) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.uniform1i(location, unit);
  }

  return {
    kind: "webgl2",

    resize(width, height, scatterWidth, scatterHeight) {
      canvas.width = width;
      canvas.height = height;
      scatterSize = [scatterWidth, scatterHeight];
      gl.bindTexture(gl.TEXTURE_2D, scatter);
      if (floatTarget) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, scatterWidth, scatterHeight, 0, gl.RGBA, gl.HALF_FLOAT, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, scatterWidth, scatterHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, scatter, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    },

    setMask(source) {
      gl.bindTexture(gl.TEXTURE_2D, mask);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      hasMask = true;
    },

    render(uniforms) {
      if (!hasMask || !scatterSize[0]) return;
      const head = uniforms.subarray(0, HEADER_FLOATS);
      const lights = uniforms.subarray(HEADER_FLOATS);
      gl.bindVertexArray(vao);

      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, scatterSize[0], scatterSize[1]);
      gl.useProgram(scatterProgram);
      gl.uniform4fv(scatterU.head, head);
      gl.uniform4fv(scatterU.lights, lights);
      bindTexture(0, mask, scatterU.mask);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(compositeProgram);
      gl.uniform4fv(compositeU.head, head);
      gl.uniform1f(compositeU.scale, scatterScale);
      bindTexture(0, scatter, compositeU.scatter);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    destroy() {
      gl.deleteTexture(mask);
      gl.deleteTexture(scatter);
      gl.deleteFramebuffer(framebuffer);
      gl.deleteProgram(scatterProgram);
      gl.deleteProgram(compositeProgram);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
