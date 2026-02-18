import { ForceContext, ForcePlugin, ForceVector } from '../types';

export interface GravityForceState {
  enabled: boolean;
  strengthMps2: number;
  directionDeg: number;
}

type GravityOptions = {
  pixelsPerMeter: number;
  defaults?: Partial<GravityForceState>;
};

const DEFAULT_STATE: GravityForceState = {
  enabled: true,
  strengthMps2: 9.81,
  directionDeg: 90,
};

export class GravityForcePlugin implements ForcePlugin<GravityForceState> {
  readonly id = 'gravity';
  readonly label = 'Gravity';

  private readonly pixelsPerMeter: number;
  private readonly initialState: GravityForceState;
  private state: GravityForceState;

  constructor(options: GravityOptions) {
    this.pixelsPerMeter = options.pixelsPerMeter;
    this.initialState = { ...DEFAULT_STATE, ...options.defaults };
    this.state = { ...this.initialState };
  }

  getState(): GravityForceState {
    return { ...this.state };
  }

  setState(next: Partial<GravityForceState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }

  getVector(_context: ForceContext): ForceVector {
    if (!this.state.enabled) {
      return { x: 0, y: 0 };
    }
    const radians = this.state.directionDeg * (Math.PI / 180);
    const strength = this.state.strengthMps2 * this.pixelsPerMeter;
    return {
      x: Math.cos(radians) * strength,
      y: Math.sin(radians) * strength,
    };
  }
}
