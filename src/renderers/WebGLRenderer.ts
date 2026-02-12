// src/renderers/WebGLRenderer.ts
import { ParticleRenderer } from './ParticleRenderer';
import { Particle } from '../particle';

const VERTEX_SHADER = `
attribute vec2 a_position;
attribute vec2 a_offset;
attribute float a_radius;
attribute vec4 a_color;

uniform vec2 u_resolution;

varying vec4 v_color;
varying vec2 v_uv;

void main() {
    // Scale quad by radius and translate to particle position
    vec2 pos = a_position * a_radius + a_offset;

    // Convert to clip space (-1 to 1)
    vec2 clipSpace = (pos / u_resolution) * 2.0 - 1.0;

    // Flip Y axis (canvas has Y down, WebGL has Y up)
    gl_Position = vec4(clipSpace.x, -clipSpace.y, 0.0, 1.0);

    v_color = a_color;
    v_uv = a_position; // -1 to 1 for circle calculation
}
`;

const FRAGMENT_SHADER = `
precision mediump float;

varying vec4 v_color;
varying vec2 v_uv;

void main() {
    // Distance from center of quad
    float dist = length(v_uv);

    // Discard pixels outside the circle
    if (dist > 1.0) {
        discard;
    }

    // Smooth edge for anti-aliasing
    float alpha = 1.0 - smoothstep(0.9, 1.0, dist);

    gl_FragColor = vec4(v_color.rgb, v_color.a * alpha);
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

    // Uniform locations
    private resolutionLoc: WebGLUniformLocation;

    // Instance data: x, y, radius, r, g, b, a (7 floats per particle)
    private instanceData: Float32Array;

    // Color cache to avoid re-parsing HSL every frame
    private colorCache = new Map<string, [number, number, number]>();

    constructor(private canvas: HTMLCanvasElement) {
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

        // Get uniform locations
        this.resolutionLoc = gl.getUniformLocation(this.program, 'u_resolution')!;

        // Create quad geometry (2 triangles forming a square from -1 to 1)
        this.quadBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
             1, -1,
            -1,  1,
            -1,  1,
             1, -1,
             1,  1,
        ]), gl.STATIC_DRAW);

        // Create instance buffer
        this.instanceBuffer = gl.createBuffer()!;
        this.instanceData = new Float32Array(MAX_PARTICLES * 7);

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
            throw new Error('Program link error: ' + info);
        }
        return program;
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
            const rgbMatch = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+\s*)?\)/i);
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
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };

            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }

        return [r, g, b];
    }

    initialize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
        this.gl.uniform2f(this.resolutionLoc, width, height);
    }

    render(particles: Particle[]): void {
        const gl = this.gl;
        const ext = this.ext;
        const count = Math.min(particles.length, MAX_PARTICLES);

        // Update instance data
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            const base = i * 7;
            const [r, g, b] = this.parseColor(p.fillStyle);
            const alpha = p.maxLifeSpan === null
                ? 1.0
                : Math.max(0, 1 - p.timeAlive / p.maxLifeSpan);

            this.instanceData[base + 0] = p.x;
            this.instanceData[base + 1] = p.y;
            this.instanceData[base + 2] = p.radius;
            this.instanceData[base + 3] = r;
            this.instanceData[base + 4] = g;
            this.instanceData[base + 5] = b;
            this.instanceData[base + 6] = alpha;
        }

        // Clear
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (count === 0) return;

        // Upload instance data
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.subarray(0, count * 7), gl.DYNAMIC_DRAW);

        // Set up quad vertices (per-vertex, not instanced)
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
        gl.enableVertexAttribArray(this.positionLoc);
        gl.vertexAttribPointer(this.positionLoc, 2, gl.FLOAT, false, 0, 0);
        ext.vertexAttribDivisorANGLE(this.positionLoc, 0); // per vertex

        // Set up instance attributes
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
        const stride = 7 * 4; // 7 floats * 4 bytes

        // Offset (x, y)
        gl.enableVertexAttribArray(this.offsetLoc);
        gl.vertexAttribPointer(this.offsetLoc, 2, gl.FLOAT, false, stride, 0);
        ext.vertexAttribDivisorANGLE(this.offsetLoc, 1); // per instance

        // Radius
        gl.enableVertexAttribArray(this.radiusLoc);
        gl.vertexAttribPointer(this.radiusLoc, 1, gl.FLOAT, false, stride, 2 * 4);
        ext.vertexAttribDivisorANGLE(this.radiusLoc, 1); // per instance

        // Color (r, g, b, a)
        gl.enableVertexAttribArray(this.colorLoc);
        gl.vertexAttribPointer(this.colorLoc, 4, gl.FLOAT, false, stride, 3 * 4);
        ext.vertexAttribDivisorANGLE(this.colorLoc, 1); // per instance

        // Draw all particles in one call
        ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, 6, count);
    }

    resize(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;
        this.gl.viewport(0, 0, width, height);
        this.gl.useProgram(this.program);
        this.gl.uniform2f(this.resolutionLoc, width, height);
    }

    dispose(): void {
        const gl = this.gl;
        gl.deleteBuffer(this.quadBuffer);
        gl.deleteBuffer(this.instanceBuffer);
        gl.deleteProgram(this.program);
    }
}
