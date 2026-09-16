import type { Grid } from "./field";
import { GLSL_FRAGMENT, GLSL_VERTEX } from "./shaders";
import { WaveSim } from "./sim";
import type { Renderer } from "./types";

export function createWebGL2Renderer(canvas: HTMLCanvasElement, grid: Grid): Renderer {
  const gl = canvas.getContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: "high-performance",
  });
  if (!gl) throw new Error("webgl2 unavailable");

  function compile(type: number, source: string) {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      throw new Error(`GLSL: ${gl!.getShaderInfoLog(shader)}`);
    }
    return shader;
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, GLSL_VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, GLSL_FRAGMENT));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`GLSL link: ${gl.getProgramInfoLog(program)}`);
  }

  const uViewProj = gl.getUniformLocation(program, "uViewProj");
  const uView = gl.getUniformLocation(program, "uView");
  const uHeights = gl.getUniformLocation(program, "uHeights");

  // Corners and grid positions come from gl_VertexID / gl_InstanceID; a bound
  // VAO is still required for drawing.
  const vao = gl.createVertexArray();

  const sim = new WaveSim(grid);
  const heights = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, heights);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, grid.gx, grid.gz, 0, gl.RED, gl.FLOAT, sim.current);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  return {
    kind: "webgl2",
    grid,

    resize(width, height) {
      canvas.width = width;
      canvas.height = height;
    },

    render({ view, steps, drops }) {
      for (let s = 0; s < steps; s++) sim.step(s === 0 ? drops : []);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.039, 0.039, 0.043, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniformMatrix4fv(uViewProj, false, view.subarray(0, 16));
      gl.uniform4fv(uView, view.subarray(16, 28));

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, heights);
      if (steps > 0) {
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, grid.gx, grid.gz, gl.RED, gl.FLOAT, sim.current);
      }
      gl.uniform1i(uHeights, 0);

      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, grid.gx * grid.gz);
    },

    destroy() {
      gl.deleteTexture(heights);
      gl.deleteProgram(program);
      gl.deleteVertexArray(vao);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
