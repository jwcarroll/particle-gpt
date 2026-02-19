import { ShaderEffectPlugin } from '../types';

export interface VelocityTintEffectState {
  enabled: boolean;
  minSpeed: number;
  maxSpeed: number;
  lowColor: string;
  highColor: string;
  strength: number;
}

const DEFAULT_STATE: VelocityTintEffectState = {
  enabled: false,
  minSpeed: 0,
  maxSpeed: 600,
  lowColor: '#3b82f6',
  highColor: '#ff7a18',
  strength: 0.6,
};

export class VelocityTintEffectPlugin implements ShaderEffectPlugin<VelocityTintEffectState> {
  readonly id = 'velocityTint';
  readonly label = 'Velocity Tint';

  private readonly initialState: VelocityTintEffectState;
  private state: VelocityTintEffectState;

  constructor(defaults?: Partial<VelocityTintEffectState>) {
    this.initialState = { ...DEFAULT_STATE, ...defaults };
    this.state = { ...this.initialState };
  }

  getState(): VelocityTintEffectState {
    return { ...this.state };
  }

  setState(next: Partial<VelocityTintEffectState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }
}
