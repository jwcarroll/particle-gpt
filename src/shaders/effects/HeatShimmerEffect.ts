import { ShaderEffectPlugin } from '../types';

export interface HeatShimmerEffectState {
  enabled: boolean;
  frequency: number;
  amplitude: number;
  speed: number;
  strength: number;
}

const DEFAULT_STATE: HeatShimmerEffectState = {
  enabled: false,
  frequency: 8,
  amplitude: 0.04,
  speed: 1.2,
  strength: 0.25,
};

export class HeatShimmerEffectPlugin implements ShaderEffectPlugin<HeatShimmerEffectState> {
  readonly id = 'heatShimmer';
  readonly label = 'Heat Shimmer';

  private readonly initialState: HeatShimmerEffectState;
  private state: HeatShimmerEffectState;

  constructor(defaults?: Partial<HeatShimmerEffectState>) {
    this.initialState = { ...DEFAULT_STATE, ...defaults };
    this.state = { ...this.initialState };
  }

  getState(): HeatShimmerEffectState {
    return { ...this.state };
  }

  setState(next: Partial<HeatShimmerEffectState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }
}
