// Adapted from https://github.com/clayharmon/webgl-liquid-glass (MIT).
// See THIRD_PARTY_NOTICES.md for the upstream license.
import { vertexSource, fragmentSource } from './shaders';
import type { RenderParams } from './types';

const UNIFORM_NAMES = [
  'u_resolution',
  'u_lightPos',
  'u_pillX',
  'u_pillWidth',
  'u_pillHeight',
  'u_navRadius',
  'u_transitionVel',
  'u_pressAmt',
  'u_tintColor',
] as const;

// A 3x phone would run the fragment shader at 9x the CSS-pixel fill rate for a
// bar that is mostly soft gradients. 2x costs 4x and looks the same.
const MAX_DPR = 2;

export class LiquidGlassRenderer {
  private gl: WebGLRenderingContext;
  private canvas: HTMLCanvasElement;
  private program: WebGLProgram | null = null;
  private vertexShader: WebGLShader | null = null;
  private fragmentShader: WebGLShader | null = null;
  private buffer: WebGLBuffer | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private contextLost = false;

  // Last CSS size handed to resize(). Replayed after a context restore and
  // when the device pixel ratio changes, neither of which the caller sees.
  private cssWidth = 0;
  private cssHeight = 0;
  private appliedDpr: number;
  private dprQuery: MediaQueryList | null = null;

  /**
   * Called after the renderer has thrown away the contents of the canvas and
   * needs the caller to draw again — a context restore or a DPR change, neither
   * of which the caller can see. A caller that idles its render loop when
   * nothing is moving would otherwise leave the overlay blank until the next
   * unrelated frame.
   */
  constructor(
    canvas: HTMLCanvasElement,
    private onInvalidate: () => void = () => {},
  ) {
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: true,
      alpha: true,
      antialias: true,
    });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;
    this.canvas = canvas;
    this.appliedDpr = this.dpr();

    this.build();

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.watchDpr();
  }

  resize(width: number, height: number): void {
    this.cssWidth = width;
    this.cssHeight = height;
    // Nothing sized against a lost context survives; applySize() runs again
    // from onContextRestored.
    if (this.contextLost) return;
    this.applySize();
  }

  render(params: RenderParams): void {
    if (this.contextLost || !this.program) return;

    const { gl, uniforms } = this;
    // The DPR the backing store was actually built with, not the live one.
    // If the two ever disagree the pill lands off the canvas geometry.
    const dpr = this.appliedDpr;

    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform2f(uniforms.u_resolution!, gl.canvas.width, gl.canvas.height);
    gl.uniform2f(uniforms.u_lightPos!, params.lightPos[0], params.lightPos[1]);
    gl.uniform1f(uniforms.u_pillX!, params.pillX * dpr);
    gl.uniform1f(uniforms.u_pillWidth!, params.pillWidth * dpr);
    gl.uniform1f(uniforms.u_pillHeight!, params.pillHeight * dpr);
    gl.uniform1f(uniforms.u_navRadius!, params.navRadius * dpr);
    gl.uniform1f(uniforms.u_transitionVel!, params.transitionVel);
    gl.uniform1f(uniforms.u_pressAmt!, params.pressAmt);
    gl.uniform3f(
      uniforms.u_tintColor!,
      params.tintColor[0],
      params.tintColor[1],
      params.tintColor[2],
    );

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  destroy(): void {
    const { gl, canvas } = this;

    canvas.removeEventListener('webglcontextlost', this.onContextLost);
    canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    this.dprQuery = null;

    gl.deleteProgram(this.program);
    gl.deleteShader(this.vertexShader);
    gl.deleteShader(this.fragmentShader);
    gl.deleteBuffer(this.buffer);
    this.program = null;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.buffer = null;
    this.uniforms = {};

    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // Builds every GL object the renderer owns. Runs once from the constructor
  // and again on each context restore, which resets all of it.
  private build(): void {
    const { gl } = this;

    const vs = this.compile(gl.VERTEX_SHADER, vertexSource);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragmentSource);
    this.vertexShader = vs;
    this.fragmentShader = fs;

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      throw new Error('Link failed: ' + info);
    }
    this.program = program;

    // Full-screen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    this.buffer = buf;
    const aPos = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Uniforms
    this.uniforms = {};
    for (const name of UNIFORM_NAMES) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }

    gl.useProgram(program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
  }

  private onContextLost = (e: Event): void => {
    // Without preventDefault the browser never fires webglcontextrestored and
    // the nav stays flat for the life of the page.
    e.preventDefault();
    this.contextLost = true;
    // Every handle is dangling now. Dropping them keeps destroy() from
    // deleting objects against a context that no longer owns them.
    this.program = null;
    this.vertexShader = null;
    this.fragmentShader = null;
    this.buffer = null;
    this.uniforms = {};
  };

  private onContextRestored = (): void => {
    try {
      this.build();
    } catch {
      // Stay lost rather than draw with a half-built program. render() keeps
      // no-opping and the CSS layers carry the effect.
      return;
    }
    this.contextLost = false;
    this.applySize();
    this.onInvalidate();
  };

  // The one place the ratio is read. Everything downstream uses appliedDpr so
  // the backing store and the pill uniforms can never drift apart.
  private dpr(): number {
    return Math.min(window.devicePixelRatio || 1, MAX_DPR);
  }

  private applySize(): void {
    const { canvas } = this;
    const dpr = this.dpr();
    this.appliedDpr = dpr;
    if (this.cssWidth > 0 && this.cssHeight > 0) {
      canvas.width = Math.round(this.cssWidth * dpr);
      canvas.height = Math.round(this.cssHeight * dpr);
    }
    this.gl.viewport(0, 0, canvas.width, canvas.height);
  }

  // Dragging the window to a display of a different density changes DPR
  // without changing the CSS size, so the caller's ResizeObserver never fires.
  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDprChange);
    // The query matches only the ratio it was built with, so it has to be
    // re-armed against the new one after every change.
    const dpr = window.devicePixelRatio || 1;
    const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
    query.addEventListener('change', this.onDprChange);
    this.dprQuery = query;
  }

  private onDprChange = (): void => {
    this.watchDpr();
    if (this.contextLost) return;
    // Above MAX_DPR the backing store does not move, so skip the reallocation.
    if (this.dpr() === this.appliedDpr) return;
    this.applySize();
    this.onInvalidate();
  };

  private compile(type: number, source: string): WebGLShader {
    const { gl } = this;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile: ' + info);
    }
    return shader;
  }
}
