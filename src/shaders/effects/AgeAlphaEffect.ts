import { ShaderEffectPlugin } from '../types';

export type AgeAlphaCurve = 'linear' | 'smoothstep' | 'exponential';

export interface AgeAlphaEffectState {
  enabled: boolean;
  curve: AgeAlphaCurve;
  exponent: number;
}

const DEFAULT_STATE: AgeAlphaEffectState = {
  enabled: true,
  curve: 'linear',
  exponent: 2,
};

export class AgeAlphaEffectPlugin implements ShaderEffectPlugin<AgeAlphaEffectState> {
  readonly id = 'ageAlpha';
  readonly label = 'Age Alpha';

  private readonly initialState: AgeAlphaEffectState;
  private state: AgeAlphaEffectState;

  constructor(defaults?: Partial<AgeAlphaEffectState>) {
    this.initialState = { ...DEFAULT_STATE, ...defaults };
    this.state = { ...this.initialState };
  }

  getState(): AgeAlphaEffectState {
    return { ...this.state };
  }

  setState(next: Partial<AgeAlphaEffectState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }
}
