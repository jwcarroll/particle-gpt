import { ShaderEffectPlugin } from '../types';

export interface ColorShiftEffectState {
  enabled: boolean;
  speed: number;
  amount: number;
}

const DEFAULT_STATE: ColorShiftEffectState = {
  enabled: false,
  speed: 0.8,
  amount: 0.35,
};

export class ColorShiftEffectPlugin implements ShaderEffectPlugin<ColorShiftEffectState> {
  readonly id = 'colorShift';
  readonly label = 'Color Shift';

  private readonly initialState: ColorShiftEffectState;
  private state: ColorShiftEffectState;

  constructor(defaults?: Partial<ColorShiftEffectState>) {
    this.initialState = { ...DEFAULT_STATE, ...defaults };
    this.state = { ...this.initialState };
  }

  getState(): ColorShiftEffectState {
    return { ...this.state };
  }

  setState(next: Partial<ColorShiftEffectState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }
}
