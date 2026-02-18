import { ForceContext, ForcePlugin, ForceVector } from '../types';

export type RadialFalloff = 'none' | 'inverseDistance' | 'inverseSquare';

export interface RadialForceState {
  enabled: boolean;
  centerX: number;
  centerY: number;
  strengthMps2: number;
  falloff: RadialFalloff;
}

type RadialOptions = {
  pixelsPerMeter: number;
  defaults?: Partial<RadialForceState>;
};

const DEFAULT_STATE: RadialForceState = {
  enabled: false,
  centerX: 0,
  centerY: 0,
  strengthMps2: 10,
  falloff: 'inverseDistance',
};

export class RadialForcePlugin implements ForcePlugin<RadialForceState> {
  readonly id = 'radial';
  readonly label = 'Radial';

  private readonly pixelsPerMeter: number;
  private readonly initialState: RadialForceState;
  private state: RadialForceState;

  constructor(options: RadialOptions) {
    this.pixelsPerMeter = options.pixelsPerMeter;
    this.initialState = { ...DEFAULT_STATE, ...options.defaults };
    this.state = { ...this.initialState };
  }

  getState(): RadialForceState {
    return { ...this.state };
  }

  setState(next: Partial<RadialForceState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }

  getVector(context: ForceContext): ForceVector {
    if (!this.state.enabled) {
      return { x: 0, y: 0 };
    }

    const dx = this.state.centerX - context.particleCentroidX;
    const dy = this.state.centerY - context.particleCentroidY;
    const distancePx = Math.sqrt(dx * dx + dy * dy);
    if (distancePx < 1e-6) {
      return { x: 0, y: 0 };
    }

    const ux = dx / distancePx;
    const uy = dy / distancePx;
    const distanceMeters = Math.max(distancePx / this.pixelsPerMeter, 0.001);
    const falloff = this.getFalloffMultiplier(distanceMeters, this.state.falloff);
    const clampedFalloff = Math.min(falloff, 10);
    const baseStrength = Math.abs(this.state.strengthMps2) * this.pixelsPerMeter * clampedFalloff;
    const sign = this.state.strengthMps2 >= 0 ? 1 : -1;

    return {
      x: ux * baseStrength * sign,
      y: uy * baseStrength * sign,
    };
  }

  private getFalloffMultiplier(distanceMeters: number, falloff: RadialFalloff): number {
    switch (falloff) {
      case 'none':
        return 1;
      case 'inverseDistance':
        return 1 / distanceMeters;
      case 'inverseSquare':
        return 1 / (distanceMeters * distanceMeters);
      default:
        return 1;
    }
  }
}
