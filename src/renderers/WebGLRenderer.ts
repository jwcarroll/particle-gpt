// src/renderers/WebGLRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';
import { ShaderRegistry } from '../shaders';
import { getBackingHeight, getBackingWidth, RenderSurfaceConfig } from './RenderSurface';
import { ColorShiftEffectPlugin } from '../shaders/effects/ColorShiftEffect';
import { OutlineEffectPlugin } from '../shaders/effects/OutlineEffect';
import { GlowEffectPlugin } from '../shaders/effects/GlowEffect';
import { AgeAlphaEffectPlugin } from '../shaders/effects/AgeAlphaEffect';
import { VelocityTintEffectPlugin } from '../shaders/effects/VelocityTintEffect';
import { HeatShimmerEffectPlugin } from '../shaders/effects/HeatShimmerEffect';

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
    float alpha = edgeAlpha;

    if (u_fxAgeAlphaEnabled > 0.5) {
        float age = clamp(v_ageNorm, 0.0, 1.0);
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
        alpha *= ageFade;
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
const MAX_PARTICLES = 50000;

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
  private colorShiftEnabledLoc: WebGLUniformLocation;
  private colorShiftSpeedLoc: WebGLUniformLocation;
  private colorShiftAmountLoc: WebGLUniformLocation;
  private outlineEnabledLoc: WebGLUniformLocation;
  private outlineThicknessLoc: WebGLUniformLocation;
  private outlineStrengthLoc: WebGLUniformLocation;
  private outlineColorLoc: WebGLUniformLocation;
  private glowEnabledLoc: WebGLUniformLocation;
  private glowRadiusLoc: WebGLUniformLocation;
  private glowIntensityLoc: WebGLUniformLocation;
  private ageAlphaEnabledLoc: WebGLUniformLocation;
  private ageAlphaCurveLoc: WebGLUniformLocation;
  private ageAlphaExponentLoc: WebGLUniformLocation;
  private velocityTintEnabledLoc: WebGLUniformLocation;
  private velocityTintMinSpeedLoc: WebGLUniformLocation;
  private velocityTintMaxSpeedLoc: WebGLUniformLocation;
  private velocityTintLowColorLoc: WebGLUniformLocation;
  private velocityTintHighColorLoc: WebGLUniformLocation;
  private velocityTintStrengthLoc: WebGLUniformLocation;
  private heatShimmerEnabledLoc: WebGLUniformLocation;
  private heatShimmerFrequencyLoc: WebGLUniformLocation;
  private heatShimmerAmplitudeLoc: WebGLUniformLocation;
  private heatShimmerSpeedLoc: WebGLUniformLocation;
  private heatShimmerStrengthLoc: WebGLUniformLocation;

  // Instance data: x, y, radius, r, g, b, ageNorm, speed (8 floats per particle)
  private instanceData: Float32Array;

  // Color cache to avoid re-parsing HSL every frame
  private colorCache = new Map<string, [number, number, number]>();
  private elapsedTime = 0;
  private compileStatus: 'OK' | 'Error' = 'OK';
  private surface!: RenderSurfaceConfig;

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
    this.colorShiftEnabledLoc = gl.getUniformLocation(this.program, 'u_fxColorShiftEnabled')!;
    this.colorShiftSpeedLoc = gl.getUniformLocation(this.program, 'u_fxColorShiftSpeed')!;
    this.colorShiftAmountLoc = gl.getUniformLocation(this.program, 'u_fxColorShiftAmount')!;
    this.outlineEnabledLoc = gl.getUniformLocation(this.program, 'u_fxOutlineEnabled')!;
    this.outlineThicknessLoc = gl.getUniformLocation(this.program, 'u_fxOutlineThickness')!;
    this.outlineStrengthLoc = gl.getUniformLocation(this.program, 'u_fxOutlineStrength')!;
    this.outlineColorLoc = gl.getUniformLocation(this.program, 'u_fxOutlineColor')!;
    this.glowEnabledLoc = gl.getUniformLocation(this.program, 'u_fxGlowEnabled')!;
    this.glowRadiusLoc = gl.getUniformLocation(this.program, 'u_fxGlowRadius')!;
    this.glowIntensityLoc = gl.getUniformLocation(this.program, 'u_fxGlowIntensity')!;
    this.ageAlphaEnabledLoc = gl.getUniformLocation(this.program, 'u_fxAgeAlphaEnabled')!;
    this.ageAlphaCurveLoc = gl.getUniformLocation(this.program, 'u_fxAgeAlphaCurve')!;
    this.ageAlphaExponentLoc = gl.getUniformLocation(this.program, 'u_fxAgeAlphaExponent')!;
    this.velocityTintEnabledLoc = gl.getUniformLocation(this.program, 'u_fxVelocityTintEnabled')!;
    this.velocityTintMinSpeedLoc = gl.getUniformLocation(this.program, 'u_fxVelocityTintMinSpeed')!;
    this.velocityTintMaxSpeedLoc = gl.getUniformLocation(this.program, 'u_fxVelocityTintMaxSpeed')!;
    this.velocityTintLowColorLoc = gl.getUniformLocation(this.program, 'u_fxVelocityTintLowColor')!;
    this.velocityTintHighColorLoc = gl.getUniformLocation(
      this.program,
      'u_fxVelocityTintHighColor',
    )!;
    this.velocityTintStrengthLoc = gl.getUniformLocation(this.program, 'u_fxVelocityTintStrength')!;
    this.heatShimmerEnabledLoc = gl.getUniformLocation(this.program, 'u_fxHeatShimmerEnabled')!;
    this.heatShimmerFrequencyLoc = gl.getUniformLocation(this.program, 'u_fxHeatShimmerFrequency')!;
    this.heatShimmerAmplitudeLoc = gl.getUniformLocation(this.program, 'u_fxHeatShimmerAmplitude')!;
    this.heatShimmerSpeedLoc = gl.getUniformLocation(this.program, 'u_fxHeatShimmerSpeed')!;
    this.heatShimmerStrengthLoc = gl.getUniformLocation(this.program, 'u_fxHeatShimmerStrength')!;

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
    this.instanceData = new Float32Array(MAX_PARTICLES * 8);

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

  private parseColor(color: string): [number, number, number] {
    // Check cache first
    let rgb = this.colorCache.get(color);
    if (rgb) return rgb;

    // Parse hex: #rgb, #rgba, #rrggbb, #rrggbbaa
    const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
      const raw = hex[1];
      if (raw.length === 3 || raw.length === 4) {
        const r = parseInt(raw[0] + raw[0], 16) / 255;
        const g = parseInt(raw[1] + raw[1], 16) / 255;
        const b = parseInt(raw[2] + raw[2], 16) / 255;
        rgb = [r, g, b];
      } else {
        const r = parseInt(raw.slice(0, 2), 16) / 255;
        const g = parseInt(raw.slice(2, 4), 16) / 255;
        const b = parseInt(raw.slice(4, 6), 16) / 255;
        rgb = [r, g, b];
      }
    } else {
      // Parse rgb/rgba: "rgb(R,G,B)" or "rgba(R,G,B,A)"
      const rgbMatch = color.match(
        /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)/i,
      );
      if (rgbMatch) {
        const r = Math.max(0, Math.min(255, parseFloat(rgbMatch[1]))) / 255;
        const g = Math.max(0, Math.min(255, parseFloat(rgbMatch[2]))) / 255;
        const b = Math.max(0, Math.min(255, parseFloat(rgbMatch[3]))) / 255;
        rgb = [r, g, b];
      } else {
        // Parse HSL: "hsl(H, S%, L%)"
        const hslMatch = color.match(/hsl\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)/i);
        if (!hslMatch) {
          // Fallback to white for unsupported color strings
          rgb = [1, 1, 1];
        } else {
          const h = parseFloat(hslMatch[1]) / 360;
          const s = parseFloat(hslMatch[2]) / 100;
          const l = parseFloat(hslMatch[3]) / 100;
          rgb = this.hslToRgb(h, s, l);
        }
      }
    }

    // Cache it (limit cache size)
    if (this.colorCache.size > 10000) {
      this.colorCache.clear();
    }
    this.colorCache.set(color, rgb);
    return rgb;
  }

  private hslToRgb(h: number, s: number, l: number): [number, number, number] {
    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return [r, g, b];
  }

  initialize(surface: RenderSurfaceConfig): void {
    this.surface = surface;
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
    const count = Math.min(particles.length, MAX_PARTICLES);

    // Update instance data
    for (let i = 0; i < count; i++) {
      const p = particles[i];
      const base = i * 8;
      const [r, g, b] = this.parseColor(p.fillStyle);
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
    const [backgroundRed, backgroundGreen, backgroundBlue] = this.parseColor(
      this.surface.backgroundColor,
    );
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

    const colorShift = this.shaderRegistry?.get('colorShift');
    if (colorShift instanceof ColorShiftEffectPlugin) {
      const state = colorShift.getState();
      gl.uniform1f(this.colorShiftEnabledLoc, state.enabled ? 1 : 0);
      gl.uniform1f(this.colorShiftSpeedLoc, state.speed);
      gl.uniform1f(this.colorShiftAmountLoc, state.amount);
    } else {
      gl.uniform1f(this.colorShiftEnabledLoc, 0);
      gl.uniform1f(this.colorShiftSpeedLoc, 0.8);
      gl.uniform1f(this.colorShiftAmountLoc, 0.35);
    }

    const outline = this.shaderRegistry?.get('outline');
    if (outline instanceof OutlineEffectPlugin) {
      const state = outline.getState();
      gl.uniform1f(this.outlineEnabledLoc, state.enabled ? 1 : 0);
      gl.uniform1f(this.outlineThicknessLoc, state.thickness);
      gl.uniform1f(this.outlineStrengthLoc, state.strength);
      const [r, g, b] = this.parseColor(state.color);
      gl.uniform3f(this.outlineColorLoc, r, g, b);
    } else {
      gl.uniform1f(this.outlineEnabledLoc, 0);
      gl.uniform1f(this.outlineThicknessLoc, 0.12);
      gl.uniform1f(this.outlineStrengthLoc, 0.7);
      gl.uniform3f(this.outlineColorLoc, 1, 1, 1);
    }

    const glow = this.shaderRegistry?.get('glow');
    if (glow instanceof GlowEffectPlugin) {
      const state = glow.getState();
      gl.uniform1f(this.glowEnabledLoc, state.enabled ? 1 : 0);
      gl.uniform1f(this.glowRadiusLoc, state.radius);
      gl.uniform1f(this.glowIntensityLoc, state.intensity);
    } else {
      gl.uniform1f(this.glowEnabledLoc, 0);
      gl.uniform1f(this.glowRadiusLoc, 0.2);
      gl.uniform1f(this.glowIntensityLoc, 0.6);
    }

    const ageAlpha = this.shaderRegistry?.get('ageAlpha');
    if (ageAlpha instanceof AgeAlphaEffectPlugin) {
      const state = ageAlpha.getState();
      gl.uniform1f(this.ageAlphaEnabledLoc, state.enabled ? 1 : 0);
      gl.uniform1f(this.ageAlphaExponentLoc, state.exponent);
      let curveMode = 0;
      if (state.curve === 'smoothstep') {
        curveMode = 1;
      } else if (state.curve === 'exponential') {
        curveMode = 2;
      }
      gl.uniform1f(this.ageAlphaCurveLoc, curveMode);
    } else {
      gl.uniform1f(this.ageAlphaEnabledLoc, 1);
      gl.uniform1f(this.ageAlphaCurveLoc, 0);
      gl.uniform1f(this.ageAlphaExponentLoc, 2);
    }

    const velocityTint = this.shaderRegistry?.get('velocityTint');
    if (velocityTint instanceof VelocityTintEffectPlugin) {
      const state = velocityTint.getState();
      gl.uniform1f(this.velocityTintEnabledLoc, state.enabled ? 1 : 0);
      gl.uniform1f(this.velocityTintMinSpeedLoc, state.minSpeed);
      gl.uniform1f(this.velocityTintMaxSpeedLoc, state.maxSpeed);
      const [lowR, lowG, lowB] = this.parseColor(state.lowColor);
      const [highR, highG, highB] = this.parseColor(state.highColor);
      gl.uniform3f(this.velocityTintLowColorLoc, lowR, lowG, lowB);
      gl.uniform3f(this.velocityTintHighColorLoc, highR, highG, highB);
      gl.uniform1f(this.velocityTintStrengthLoc, state.strength);
    } else {
      gl.uniform1f(this.velocityTintEnabledLoc, 0);
      gl.uniform1f(this.velocityTintMinSpeedLoc, 0);
      gl.uniform1f(this.velocityTintMaxSpeedLoc, 600);
      gl.uniform3f(this.velocityTintLowColorLoc, 0.231, 0.509, 0.965);
      gl.uniform3f(this.velocityTintHighColorLoc, 1.0, 0.478, 0.094);
      gl.uniform1f(this.velocityTintStrengthLoc, 0.6);
    }

    const heatShimmer = this.shaderRegistry?.get('heatShimmer');
    if (heatShimmer instanceof HeatShimmerEffectPlugin) {
      const state = heatShimmer.getState();
      gl.uniform1f(this.heatShimmerEnabledLoc, state.enabled ? 1 : 0);
      gl.uniform1f(this.heatShimmerFrequencyLoc, state.frequency);
      gl.uniform1f(this.heatShimmerAmplitudeLoc, state.amplitude);
      gl.uniform1f(this.heatShimmerSpeedLoc, state.speed);
      gl.uniform1f(this.heatShimmerStrengthLoc, state.strength);
    } else {
      gl.uniform1f(this.heatShimmerEnabledLoc, 0);
      gl.uniform1f(this.heatShimmerFrequencyLoc, 8);
      gl.uniform1f(this.heatShimmerAmplitudeLoc, 0.04);
      gl.uniform1f(this.heatShimmerSpeedLoc, 1.2);
      gl.uniform1f(this.heatShimmerStrengthLoc, 0.25);
    }
  }

  resize(surface: RenderSurfaceConfig): void {
    this.surface = surface;
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
