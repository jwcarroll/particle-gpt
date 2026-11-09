// src/renderers/WebGLRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';
import { ShaderRegistry } from '../shaders';
import { parseOpaqueColor, RgbColor } from '../colors';
import { getBackingHeight, getBackingWidth, RenderSurfaceConfig } from './RenderSurface';

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_offset;
attribute float a_radius;
attribute vec3 a_color;
attribute float a_ageNorm;
attribute float a_speed;

uniform vec2 u_resolution;

varying vec3 v_color;
varying vec2 v_uv;
varying float v_ageNorm;
varying float v_speed;

void main() {
    // Scale quad by radius and translate to particle position
    vec2 pos = a_position * a_radius + a_offset;

    // Convert to clip space (-1 to 1)
    vec2 clipSpace = (pos / u_resolution) * 2.0 - 1.0;

    // Flip Y axis (canvas has Y down, WebGL has Y up)
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

    v_color = a_color;
    v_uv = a_position; // -1 to 1 for circle calculation
    v_ageNorm = a_ageNorm;
    v_speed = a_speed;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

varying vec3 v_color;
varying vec2 v_uv;
varying float v_ageNorm;
varying float v_speed;

uniform float u_time;

uniform float u_fxColorShiftEnabled;
uniform float u_fxColorShiftSpeed;
uniform float u_fxColorShiftAmount;

uniform float u_fxOutlineEnabled;
uniform float u_fxOutlineThickness;
uniform float u_fxOutlineStrength;
uniform vec3 u_fxOutlineColor;

uniform float u_fxGlowEnabled;
uniform float u_fxGlowRadius;
uniform float u_fxGlowIntensity;

uniform float u_fxAgeAlphaEnabled;
uniform float u_fxAgeAlphaCurve;
uniform float u_fxAgeAlphaExponent;

uniform float u_fxVelocityTintEnabled;
uniform float u_fxVelocityTintMinSpeed;
uniform float u_fxVelocityTintMaxSpeed;
uniform vec3 u_fxVelocityTintLowColor;
uniform vec3 u_fxVelocityTintHighColor;
uniform float u_fxVelocityTintStrength;

uniform float u_fxHeatShimmerEnabled;
uniform float u_fxHeatShimmerFrequency;
uniform float u_fxHeatShimmerAmplitude;
uniform float u_fxHeatShimmerSpeed;
uniform float u_fxHeatShimmerStrength;

void main() {
    // Distance from center of quad
    float dist = length(v_uv);

    // Discard pixels outside the circle
    if (dist > 1.0) {
        discard;
    }

    // Smooth edge for anti-aliasing
    float edgeAlpha = 1.0 - smoothstep(0.9, 1.0, dist);
    vec3 color = v_color.rgb;
    float age = clamp(v_ageNorm, 0.0, 1.0);
    float alpha = edgeAlpha * (1.0 - age);

    if (u_fxAgeAlphaEnabled > 0.5) {
        float ageFade = 1.0 - age;
        if (u_fxAgeAlphaCurve < 0.5) {
            // linear
            ageFade = 1.0 - age;
        } else if (u_fxAgeAlphaCurve < 1.5) {
            // smoothstep
            ageFade = 1.0 - smoothstep(0.0, 1.0, age);
        } else {
            // exponential
            ageFade = pow(max(1.0 - age, 0.0), max(u_fxAgeAlphaExponent, 0.01));
        }
        alpha = edgeAlpha * ageFade;
    }

    if (u_fxVelocityTintEnabled > 0.5) {
        float minSpeed = min(u_fxVelocityTintMinSpeed, u_fxVelocityTintMaxSpeed - 0.0001);
        float maxSpeed = max(u_fxVelocityTintMaxSpeed, minSpeed + 0.0001);
        float speedT = clamp((v_speed - minSpeed) / (maxSpeed - minSpeed), 0.0, 1.0);
        vec3 tintColor = mix(u_fxVelocityTintLowColor, u_fxVelocityTintHighColor, speedT);
        color = mix(color, tintColor, clamp(u_fxVelocityTintStrength, 0.0, 1.0));
    }

    if (u_fxColorShiftEnabled > 0.5) {
        float phase = u_time * u_fxColorShiftSpeed;
        vec3 wave = vec3(
            sin(phase + color.r * 6.2831853),
            sin(phase + 2.0943951 + color.g * 6.2831853),
            sin(phase + 4.1887902 + color.b * 6.2831853)
        );
        color = clamp(color + wave * (0.25 * u_fxColorShiftAmount), 0.0, 1.0);
    }

    if (u_fxOutlineEnabled > 0.5) {
        float thickness = clamp(u_fxOutlineThickness, 0.001, 0.95);
        float edgeBand = smoothstep(1.0 - thickness, 1.0, dist);
        float edgeMix = edgeBand * clamp(u_fxOutlineStrength, 0.0, 1.0);
        color = mix(color, u_fxOutlineColor, edgeMix);
    }

    if (u_fxGlowEnabled > 0.5) {
        float glowRadius = clamp(u_fxGlowRadius, 0.01, 0.95);
        float glow = 1.0 - smoothstep(1.0 - glowRadius, 1.0, dist);
        color += color * glow * clamp(u_fxGlowIntensity, 0.0, 2.0);
        color = clamp(color, 0.0, 1.0);
    }

    if (u_fxHeatShimmerEnabled > 0.5) {
        float freq = max(u_fxHeatShimmerFrequency, 0.01);
        float shimmerTime = u_time * u_fxHeatShimmerSpeed;
        float waveA = sin((v_uv.x + v_uv.y) * freq + shimmerTime);
        float waveB = sin((v_uv.y - v_uv.x) * (freq * 0.73) - shimmerTime * 1.31);
        float shimmer = (waveA + waveB) * 0.5;
        float edgeMask = 1.0 - smoothstep(0.0, 1.0, dist);
        float shimmerAmount = shimmer * u_fxHeatShimmerAmplitude * u_fxHeatShimmerStrength;
        color += vec3(shimmerAmount * 0.6, shimmerAmount * 0.2, shimmerAmount * 0.8) * edgeMask;
        color = clamp(color, 0.0, 1.0);
    }

    gl_FragColor = vec4(color, alpha);
}
`;

// Pre-allocated typed arrays for particle data
export const MAX_WEBGL_PARTICLES = 50_000;

export class WebGLRenderer implements ParticleRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private ext: ANGLE_instanced_arrays;

  // Buffers
  private quadBuffer: WebGLBuffer;
  private instanceBuffer: WebGLBuffer;

  // Attribute locations
  private positionLoc: number;
  private offsetLoc: number;
  private radiusLoc: number;
  private colorLoc: number;
  private ageNormLoc: number;
  private speedLoc: number;

  // Uniform locations
  private resolutionLoc: WebGLUniformLocation;
  private timeLoc: WebGLUniformLocation;

  // Instance data: x, y, radius, r, g, b, ageNorm, speed (8 floats per particle)
  private instanceData: Float32Array;

  private elapsedTime = 0;
  private effectUniforms: { id: string; key: string; location: WebGLUniformLocation | null }[] = [];
  private compileStatus: 'OK' | 'Error' = 'OK';
  private backgroundColor: RgbColor = [0, 0, 0];

  constructor(
    private canvas: HTMLCanvasElement,
    private shaderRegistry?: ShaderRegistry,
  ) {
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    // Get instancing extension
    const ext = gl.getExtension('ANGLE_instanced_arrays');
    if (!ext) throw new Error('ANGLE_instanced_arrays not supported');
    this.ext = ext;

    // Create shader program
    this.program = this.createProgram(VERTEX_SHADER, FRAGMENT_SHADER);
    gl.useProgram(this.program);

    // Get attribute locations
    this.positionLoc = gl.getAttribLocation(this.program, 'a_position');
    this.offsetLoc = gl.getAttribLocation(this.program, 'a_offset');
    this.radiusLoc = gl.getAttribLocation(this.program, 'a_radius');
    this.colorLoc = gl.getAttribLocation(this.program, 'a_color');
    this.ageNormLoc = gl.getAttribLocation(this.program, 'a_ageNorm');
    this.speedLoc = gl.getAttribLocation(this.program, 'a_speed');

    // Get uniform locations
    this.resolutionLoc = gl.getUniformLocation(this.program, 'u_resolution')!;
    this.timeLoc = gl.getUniformLocation(this.program, 'u_time')!;
    for (const plugin of this.shaderRegistry?.list() ?? []) {
      for (const key of Object.keys(plugin.getState())) {
        const capitalize = (value: string) => value[0].toUpperCase() + value.slice(1);
        this.effectUniforms.push({
          id: plugin.id,
          key,
          location: gl.getUniformLocation(
            this.program,
            'u_fx' + capitalize(plugin.id) + capitalize(key),
          ),
        });
      }
    }

    // Create quad geometry (2 triangles forming a square from -1 to 1)
    this.quadBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    // Create instance buffer
    this.instanceBuffer = gl.createBuffer()!;
    this.instanceData = new Float32Array(MAX_WEBGL_PARTICLES * 8);

    // Enable blending for alpha
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  private createShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      this.compileStatus = 'Error';
      throw new Error('Shader compile error: ' + info);
    }
    return shader;
  }

  private createProgram(vertexSrc: string, fragmentSrc: string): WebGLProgram {
    const gl = this.gl;
    const program = gl.createProgram()!;

    gl.attachShader(program, this.createShader(gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(program, this.createShader(gl.FRAGMENT_SHADER, fragmentSrc));
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program);
      gl.deleteProgram(program);
      this.compileStatus = 'Error';
      throw new Error('Program link error: ' + info);
    }
    return program;
  }

  setTime(seconds: number): void {
    this.elapsedTime = seconds;
  }

  getCompileStatus(): 'OK' | 'Error' {
    return this.compileStatus;
  }

  getParticleCapacity(): number {
    return MAX_WEBGL_PARTICLES;
  }

  initialize(surface: RenderSurfaceConfig): void {
    this.backgroundColor = parseOpaqueColor(surface.backgroundColor);
    const backingWidth = getBackingWidth(surface);
    const backingHeight = getBackingHeight(surface);
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.gl.viewport(0, 0, backingWidth, backingHeight);
    this.gl.uniform2f(this.resolutionLoc, surface.logicalWidth, surface.logicalHeight);
  }

  render(particles: Particle[], interpolationAlpha: number = 1): void {
    const gl = this.gl;
    const ext = this.ext;
    const count = Math.min(particles.length, MAX_WEBGL_PARTICLES);

    // Update instance data
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const base = i * 8;
      const [r, g, b] = p.color;
      const ageNorm =
        p.maxLifeSpan === null ? 0.0 : Math.min(Math.max(p.timeAlive / p.maxLifeSpan, 0), 1);
      const speed = Math.sqrt(p.velocity.x * p.velocity.x + p.velocity.y * p.velocity.y);

      this.instanceData[base + 0] = p.getInterpolatedX(interpolationAlpha);
      this.instanceData[base + 1] = p.getInterpolatedY(interpolationAlpha);
      this.instanceData[base + 2] = p.radius;
      this.instanceData[base + 3] = r;
      this.instanceData[base + 4] = g;
      this.instanceData[base + 5] = b;
      this.instanceData[base + 6] = ageNorm;
      this.instanceData[base + 7] = speed;
    }

    // Clear
    const [backgroundRed, backgroundGreen, backgroundBlue] = this.backgroundColor;
    gl.clearColor(backgroundRed, backgroundGreen, backgroundBlue, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (count === 0) return;

    this.applyShaderUniforms();

    // Upload instance data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.subarray(0, count * 8), gl.DYNAMIC_DRAW);

    // Set up quad vertices (per-vertex, not instanced)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.positionLoc);
    gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0);
    ext.vertexAttribDivisorANGLE(this.positionLoc, 0); // per vertex

    // Set up instance attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    const stride = 8 * 4; // 8 floats * 4 bytes

    // Offset (x, y)
    gl.enableVertexAttribArray(this.offsetLoc);
    gl.vertexAttribPointer(this.offsetLoc, 2, gl.FLOAT, false, stride, 0);
    ext.vertexAttribDivisorANGLE(this.offsetLoc, 1); // per instance

    // Radius
    gl.enableVertexAttribArray(this.radiusLoc);
    gl.vertexAttribPointer(this.radiusLoc, 1, gl.FLOAT, false, stride, 2 * 4);
    ext.vertexAttribDivisorANGLE(this.radiusLoc, 1); // per instance

    // Color (r, g, b)
    gl.enableVertexAttribArray(this.colorLoc);
    gl.vertexAttribPointer(this.colorLoc, 3, gl.FLOAT, false, stride, 3 * 4);
    ext.vertexAttribDivisorANGLE(this.colorLoc, 1); // per instance

    // Age normalized (0 to 1)
    gl.enableVertexAttribArray(this.ageNormLoc);
    gl.vertexAttribPointer(this.ageNormLoc, 1, gl.FLOAT, false, stride, 6 * 4);
    ext.vertexAttribDivisorANGLE(this.ageNormLoc, 1); // per instance

    // Speed (pixels/sec)
    gl.enableVertexAttribArray(this.speedLoc);
    gl.vertexAttribPointer(this.speedLoc, 1, gl.FLOAT, false, stride, 7 * 4);
    ext.vertexAttribDivisorANGLE(this.speedLoc, 1); // per instance

    // Draw all particles in one call
    ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, count);
  }

  private applyShaderUniforms(): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1f(this.timeLoc, this.elapsedTime);

    const states = new Map<string, Record<string, unknown>>();
    for (const plugin of this.shaderRegistry?.list() ?? [])
      states.set(plugin.id, plugin.getState() as unknown as Record<string, unknown>);
    for (const binding of this.effectUniforms) {
      const value = states.get(binding.id)?.[binding.key];
      if (typeof value === 'boolean') gl.uniform1f(binding.location, value ? 1 : 0);
      else if (typeof value === 'number') gl.uniform1f(binding.location, value);
      else if (binding.key === 'curve')
        gl.uniform1f(
          binding.location,
          ['linear', 'smoothstep', 'exponential'].indexOf(String(value)),
        );
      else if (typeof value === 'string') {
        const [r, g, b] = parseOpaqueColor(value);
        gl.uniform3f(binding.location, r, g, b);
      }
    }
  }

  resize(surface: RenderSurfaceConfig): void {
    this.backgroundColor = parseOpaqueColor(surface.backgroundColor);
    const backingWidth = getBackingWidth(surface);
    const backingHeight = getBackingHeight(surface);
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.gl.viewport(0, 0, backingWidth, backingHeight);
    this.gl.useProgram(this.program);
    this.gl.uniform2f(this.resolutionLoc, surface.logicalWidth, surface.logicalHeight);
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.instanceBuffer);
    gl.deleteProgram(this.program);
  }
}
