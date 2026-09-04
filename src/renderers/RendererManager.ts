import { ShaderRegistry } from '../shaders';
import { Canvas2DRenderer } from './Canvas2DRenderer';
import { DirectCanvas2DRenderer } from './DirectCanvas2DRenderer';
import { ParticleRenderer } from './ParticleRenderer';
import { RenderSurfaceConfig } from './RenderSurface';
import { WebGLRenderer } from './WebGLRenderer';

export type RendererType = 'DoubleBuffered' | 'Direct' | 'WebGL';

export interface WebGLCapabilityStatus {
  state: 'unprobed' | 'available' | 'unavailable';
  reason?: string;
  renderer?: WebGLRenderer;
}

export interface RendererSelection {
  active: RendererType;
  changed: boolean;
  reason?: string;
}

export interface RendererManagerOptions {
  createDoubleBuffered?: (canvas: HTMLCanvasElement) => ParticleRenderer;
  createDirect?: (canvas: HTMLCanvasElement) => ParticleRenderer;
  createWebGL?: (canvas: HTMLCanvasElement, shaderRegistry: ShaderRegistry) => WebGLRenderer;
}

/**
 * Owns renderer lifetime and keeps optional renderers from preventing the
 * Canvas2D baseline from loading. WebGL is only constructed after selection.
 */
export class RendererManager {
  private readonly renderers: Record<Exclude<RendererType, 'WebGL'>, ParticleRenderer>;
  private readonly createWebGL: (
    canvas: HTMLCanvasElement,
    shaderRegistry: ShaderRegistry,
  ) => WebGLRenderer;
  private webglRenderer?: WebGLRenderer;
  private webglFailureReason?: string;
  private surface?: RenderSurfaceConfig;

  public active: RendererType = 'DoubleBuffered';

  constructor(
    canvas: HTMLCanvasElement,
    private readonly webglCanvas: HTMLCanvasElement,
    private readonly shaderRegistry: ShaderRegistry,
    options: RendererManagerOptions = {},
  ) {
    const createDoubleBuffered =
      options.createDoubleBuffered ?? ((surface) => new Canvas2DRenderer(surface));
    const createDirect = options.createDirect ?? ((surface) => new DirectCanvas2DRenderer(surface));
    this.createWebGL =
      options.createWebGL ?? ((surface, registry) => new WebGLRenderer(surface, registry));
    this.renderers = {
      DoubleBuffered: createDoubleBuffered(canvas),
      Direct: createDirect(canvas),
    };
  }

  get activeRenderer(): ParticleRenderer {
    return this.active === 'WebGL' ? this.webglRenderer! : this.renderers[this.active];
  }

  getWebGLCapabilityStatus(): WebGLCapabilityStatus {
    if (this.webglRenderer) {
      return { state: 'available', renderer: this.webglRenderer };
    }

    if (this.webglFailureReason) {
      return { state: 'unavailable', reason: this.webglFailureReason };
    }

    return { state: 'unprobed' };
  }

  initialize(surface: RenderSurfaceConfig): void {
    this.surface = surface;
    Object.values(this.renderers).forEach((renderer) => renderer.initialize(surface));
  }

  select(type: RendererType): RendererSelection {
    if (type !== 'WebGL') {
      const changed = this.active !== type;
      this.active = type;
      return { active: this.active, changed };
    }

    const webglRenderer = this.getOrCreateWebGLRenderer();
    if (!webglRenderer) {
      return { active: this.active, changed: false, reason: this.webglFailureReason };
    }

    const changed = this.active !== 'WebGL';
    this.active = 'WebGL';
    return { active: this.active, changed };
  }

  resize(surface: RenderSurfaceConfig): void {
    this.surface = surface;
    Object.values(this.renderers).forEach((renderer) => renderer.resize(surface));
    this.webglRenderer?.resize(surface);
  }

  dispose(): void {
    Object.values(this.renderers).forEach((renderer) => renderer.dispose());
    this.webglRenderer?.dispose();
  }

  private getOrCreateWebGLRenderer(): WebGLRenderer | undefined {
    if (this.webglRenderer) {
      return this.webglRenderer;
    }

    if (this.webglFailureReason) {
      return undefined;
    }

    try {
      const renderer = this.createWebGL(this.webglCanvas, this.shaderRegistry);
      if (!this.surface) {
        throw new Error('RendererManager must be initialized before selecting WebGL');
      }
      renderer.initialize(this.surface);
      this.webglRenderer = renderer;
      return renderer;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.webglFailureReason = `WebGL renderer could not initialize: ${detail}`;
      return undefined;
    }
  }
}
