import { ShaderEffectPlugin } from '../types';

export interface GlowEffectState {
  enabled: boolean;
  radius: number;
  intensity: number;
}

const DEFAULT_STATE: GlowEffectState = {
  enabled: false,
  radius: 0.2,
  intensity: 0.6,
};

export class GlowEffectPlugin implements ShaderEffectPlugin<GlowEffectState> {
  readonly id = 'glow';
  readonly label = 'Glow';

  private readonly initialState: GlowEffectState;
  private state: GlowEffectState;

  constructor(defaults?: Partial<GlowEffectState>) {
    this.initialState = { ...DEFAULT_STATE, ...defaults };
    this.state = { ...this.initialState };
  }

  getState(): GlowEffectState {
    return { ...this.state };
  }

  setState(next: Partial<GlowEffectState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }
}
