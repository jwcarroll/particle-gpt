export interface ForceVector {
  x: number;
  y: number;
}

export interface ForceContext {
  dt: number;
  elapsedTime: number;
  worldWidth: number;
  worldHeight: number;
  particleCount: number;
  particleCentroidX: number;
  particleCentroidY: number;
}

export interface ForcePluginState {
  enabled: boolean;
}

export interface ForcePlugin<TState extends ForcePluginState = ForcePluginState> {
  id: string;
  label: string;
  getState(): TState;
  setState(next: Partial<TState>): void;
  reset(): void;
  getVector(context: ForceContext): ForceVector;
}

export type ForceSnapshot = Record<string, unknown>;
