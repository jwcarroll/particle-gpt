import { BenchmarkScenario } from './types';

export const SCENARIOS: Record<string, BenchmarkScenario> = {
  standard: {
    id: 'standard',
    name: 'Standard (1000 particles)',
    description: 'Baseline test with 1000 particles, no collisions',
    duration: 10,
    warmupDuration: 2,
    settings: {
      maxParticleCount: 1000,
      enableParticleCollision: false,
      seed: 1337,
      forcePresetId: 'gravityOnly',
      shaderPresetId: 'shadersOff',
    },
  },
  stress: {
    id: 'stress',
    name: 'Stress Test (5000 particles)',
    description: 'High particle count stress test',
    duration: 10,
    warmupDuration: 2,
    settings: {
      maxParticleCount: 5000,
      enableParticleCollision: false,
      seed: 1337,
      forcePresetId: 'gravityOnly',
      shaderPresetId: 'shadersOff',
    },
  },
  collision: {
    id: 'collision',
    name: 'Collision Test (500 particles)',
    description: 'Tests collision performance under close-contact particle dynamics',
    duration: 10,
    warmupDuration: 2,
    settings: {
      maxParticleCount: 500,
      enableParticleCollision: true,
      seed: 1337,
      forcePresetId: 'gravityOnly',
      shaderPresetId: 'shadersOff',
    },
  },
  ramp: {
    id: 'ramp',
    name: 'Find 60fps Limit',
    description: 'Ramps particles until FPS drops below 60 for 1 second',
    duration: 60, // Max duration, will stop early when limit found
    warmupDuration: 1,
    settings: {
      maxParticleCount: 100,
      enableParticleCollision: false,
      seed: 1337,
      forcePresetId: 'gravityOnly',
      shaderPresetId: 'shadersOff',
      rampMode: true,
      rampStartCount: 100,
      rampEndCount: 30000,
    },
  },
};

export function getScenarioList(): BenchmarkScenario[] {
  return Object.values(SCENARIOS);
}

export function getScenarioById(id: string): BenchmarkScenario | undefined {
  return SCENARIOS[id];
}
