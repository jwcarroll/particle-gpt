export interface ShaderEffectState {
  enabled: boolean;
}

export interface ShaderEffectPlugin<TState extends ShaderEffectState = ShaderEffectState> {
  id: string;
  label: string;
  getState(): TState;
  setState(next: Partial<TState>): void;
  reset(): void;
}

export type ShaderSnapshot = Record<string, unknown>;
