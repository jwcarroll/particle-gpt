import { ShaderEffectPlugin } from '../types';

export interface OutlineEffectState {
  enabled: boolean;
  thickness: number;
  strength: number;
  color: string;
}

const DEFAULT_STATE: OutlineEffectState = {
  enabled: false,
  thickness: 0.12,
  strength: 0.7,
  color: '#ffffff',
};

export class OutlineEffectPlugin implements ShaderEffectPlugin<OutlineEffectState> {
  readonly id = 'outline';
  readonly label = 'Outline';

  private readonly initialState: OutlineEffectState;
  private state: OutlineEffectState;

  constructor(defaults?: Partial<OutlineEffectState>) {
    this.initialState = { ...DEFAULT_STATE, ...defaults };
    this.state = { ...this.initialState };
  }

  getState(): OutlineEffectState {
    return { ...this.state };
  }

  setState(next: Partial<OutlineEffectState>): void {
    this.state = { ...this.state, ...next };
  }

  reset(): void {
    this.state = { ...this.initialState };
  }
}
