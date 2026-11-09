import { parseOpaqueColor } from '../colors';

export interface ControlDescriptor {
  key: string;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Record<string, string>;
  view?: 'color';
}
export interface PluginDefinition {
  id: string;
  kind: 'force' | 'effect';
  schemaVersion: number;
  units: string;
  deterministic: boolean;
  capability: 'simulation' | 'WebGL';
  controls: ControlDescriptor[];
  defaults: Record<string, unknown>;
}

const internal = new Set([
  'rngState',
  'activeGustElapsedSec',
  'activeGustDurationSec',
  'activeGustStrengthMps2',
]);
const ranges: Record<string, [number, number, number]> = {
  strengthMps2: [-50, 50, 0.1],
  directionDeg: [0, 360, 1],
  directionJitterDeg: [0, 90, 1],
  baseMps2: [0, 30, 0.1],
  variabilityMps2: [0, 30, 0.1],
  turbulenceHz: [0.01, 10, 0.01],
  gustChancePerMin: [0, 60, 1],
  gustStrengthMps2: [0, 30, 0.1],
  gustDurationSec: [0.1, 10, 0.1],
  activeGustElapsedSec: [0, 1000000, 0.01],
  activeGustDurationSec: [0, 1000000, 0.01],
  activeGustStrengthMps2: [0, 1000000, 0.01],
  seed: [1, 2147483647, 1],
  centerX: [0, 100000, 1],
  centerY: [0, 100000, 1],
  exponent: [0.2, 5, 0.1],
  minSpeed: [0, 3000, 1],
  maxSpeed: [1, 3000, 1],
  strength: [0, 1, 0.01],
  speed: [0, 8, 0.01],
  amount: [0, 1, 0.01],
  thickness: [0.01, 0.95, 0.01],
  radius: [0.01, 0.95, 0.01],
  intensity: [0, 2, 0.01],
  frequency: [0.1, 40, 0.1],
  amplitude: [0, 0.2, 0.001],
};
const choices: Record<string, string[]> = {
  falloff: ['none', 'inverseDistance', 'inverseSquare'],
  curve: ['linear', 'smoothstep', 'exponential'],
  evaluationMode: ['uniform', 'perParticle'],
};

export function definePlugin(
  id: string,
  kind: 'force' | 'effect',
  defaults: object,
): PluginDefinition {
  const values = { ...defaults } as Record<string, unknown>;
  const controls = Object.keys(values)
    .filter((key) => !internal.has(key))
    .map((key) => {
      const range = ranges[key];
      const control: ControlDescriptor = { key, label: key.replace(/([A-Z])/g, ' $1') };
      if (range) [control.min, control.max, control.step] = range;
      if (choices[key]) control.options = Object.fromEntries(choices[key].map((v) => [v, v]));
      if (/color/i.test(key)) control.view = 'color';
      return control;
    });
  const definition: PluginDefinition = {
    id,
    kind,
    schemaVersion: id === 'radial' ? 2 : 1,
    defaults: values,
    controls,
    units: kind === 'force' ? 'm/s² (positions in px)' : 'effect-specific',
    deterministic: true,
    capability: kind === 'force' ? 'simulation' : 'WebGL',
  };
  validatePluginState(definition, values);
  return definition;
}

export function validatePluginState(
  def: PluginDefinition,
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${def.id}: expected state object`);
  const state = value as Record<string, unknown>;
  for (const key of Object.keys(state))
    if (!(key in def.defaults)) throw new Error(`${def.id}: unknown field ${key}`);
  for (const [key, initial] of Object.entries(def.defaults)) {
    const actual = state[key];
    if (typeof actual !== typeof initial) throw new Error(`${def.id}.${key}: wrong type`);
    if (typeof actual === 'number') {
      const range = ranges[key];
      if (!Number.isFinite(actual) || (range && (actual < range[0] || actual > range[1])))
        throw new Error(`${def.id}.${key}: out of range`);
      if (
        (key === 'seed' || key === 'rngState') &&
        (!Number.isInteger(actual) || actual < 0 || actual > 4294967295)
      )
        throw new Error('Invalid RNG state');
    }
    if (choices[key] && !choices[key].includes(actual as string))
      throw new Error(`${def.id}.${key}: unsupported value`);
    if (/color/i.test(key)) parseOpaqueColor(actual as string);
  }
  if (
    typeof state.minSpeed === 'number' &&
    typeof state.maxSpeed === 'number' &&
    state.minSpeed > state.maxSpeed
  )
    throw new Error('Minimum speed exceeds maximum');
}

export function configurationState(state: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(state).filter(([key]) => !internal.has(key)));
}
