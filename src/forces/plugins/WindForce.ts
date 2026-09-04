import { ForceContext, ForcePlugin, ForceVector } from '../types';

export interface WindForceState {
  enabled: boolean;
  baseMps2: number;
  variabilityMps2: number;
  directionDeg: number;
  directionJitterDeg: number;
  turbulenceHz: number;
  gustChancePerMin: number;
  gustStrengthMps2: number;
  gustDurationSec: number;
  seed: number;
  rngState: number;
  activeGustElapsedSec: number;
  activeGustDurationSec: number;
  activeGustStrengthMps2: number;
}

type WindOptions = {
  pixelsPerMeter: number;
  defaults?: Partial<WindForceState>;
};

const DEFAULT_STATE: WindForceState = {
  enabled: false,
  baseMps2: 1.5,
  variabilityMps2: 1.0,
  directionDeg: 0,
  directionJitterDeg: 12,
  turbulenceHz: 0.25,
  gustChancePerMin: 8,
  gustStrengthMps2: 2.5,
  gustDurationSec: 1.8,
  seed: 1337,
  rngState: 1337,
  activeGustElapsedSec: 0,
  activeGustDurationSec: 0,
  activeGustStrengthMps2: 0,
};

export class WindForcePlugin implements ForcePlugin<WindForceState> {
  readonly id = 'wind';
  readonly label = 'Wind';

  private readonly pixelsPerMeter: number;
  private readonly initialState: WindForceState;
  private state: WindForceState;

  constructor(options: WindOptions) {
    this.pixelsPerMeter = options.pixelsPerMeter;
    const merged = { ...DEFAULT_STATE, ...options.defaults };
    const normalizedSeed = this.normalizeSeed(merged.seed);
    this.initialState = {
      ...merged,
      seed: normalizedSeed,
      rngState: normalizedSeed,
      activeGustElapsedSec: 0,
      activeGustDurationSec: 0,
      activeGustStrengthMps2: 0,
    };
    this.state = { ...this.initialState };
  }

  getState(): WindForceState {
    return { ...this.state };
  }

  setState(next: Partial<WindForceState>): void {
    const previousSeed = this.state.seed;
    this.state = { ...this.state, ...next };

    if (next.seed !== undefined && next.seed !== previousSeed) {
      const normalizedSeed = this.normalizeSeed(next.seed);
      this.state.seed = normalizedSeed;
      this.state.rngState = normalizedSeed;
      this.state.activeGustElapsedSec = 0;
      this.state.activeGustDurationSec = 0;
      this.state.activeGustStrengthMps2 = 0;
    }
  }

  reset(): void {
    this.state = { ...this.initialState };
  }

  getVector(context: ForceContext): ForceVector {
    if (!this.state.enabled) {
      return { x: 0, y: 0 };
    }

    const t = context.elapsedTime;
    const turbulenceHz = Math.max(this.state.turbulenceHz, 0.01);
    const strengthNoise = this.fbm1D(this.state.seed, t * turbulenceHz);
    const directionNoise = this.fbm1D(this.state.seed + 1013904223, t * turbulenceHz * 0.6);
    const gustValue = this.stepGust(context.dt);
    const strengthMps2 =
      this.state.baseMps2 + this.state.variabilityMps2 * strengthNoise + gustValue;
    const directionDegNow =
      this.state.directionDeg + this.state.directionJitterDeg * directionNoise;
    const radians = directionDegNow * (Math.PI / 180);
    const strength = strengthMps2 * this.pixelsPerMeter;

    return {
      x: Math.cos(radians) * strength,
      y: Math.sin(radians) * strength,
    };
  }

  private stepGust(dt: number): number {
    const chancePerSecond = Math.max(this.state.gustChancePerMin, 0) / 60;
    const triggerProbability = Math.min(chancePerSecond * Math.max(dt, 0), 1);

    if (this.state.activeGustDurationSec <= 0 && this.nextRandom() < triggerProbability) {
      this.state.activeGustDurationSec = Math.max(this.state.gustDurationSec, 0.1);
      this.state.activeGustElapsedSec = 0;
      this.state.activeGustStrengthMps2 =
        this.state.gustStrengthMps2 * (0.6 + this.nextRandom() * 0.4);
    }

    if (this.state.activeGustDurationSec <= 0) {
      return 0;
    }

    this.state.activeGustElapsedSec += Math.max(dt, 0);
    const duration = this.state.activeGustDurationSec;
    const progress = Math.min(this.state.activeGustElapsedSec / duration, 1);
    const envelope = Math.sin(Math.PI * progress);
    const gustValue = this.state.activeGustStrengthMps2 * envelope;

    if (progress >= 1) {
      this.state.activeGustDurationSec = 0;
      this.state.activeGustElapsedSec = 0;
      this.state.activeGustStrengthMps2 = 0;
    }

    return gustValue;
  }

  private nextRandom(): number {
    this.state.rngState = (1664525 * this.state.rngState + 1013904223) >>> 0;
    return this.state.rngState / 4294967296;
  }

  private fbm1D(seed: number, x: number): number {
    const octaves = 3;
    let frequency = 1;
    let amplitude = 1;
    let value = 0;
    let totalAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += this.valueNoise1D(seed + i * 92821, x * frequency) * amplitude;
      totalAmplitude += amplitude;
      frequency *= 2;
      amplitude *= 0.5;
    }

    return totalAmplitude > 0 ? value / totalAmplitude : 0;
  }

  private valueNoise1D(seed: number, x: number): number {
    const x0 = Math.floor(x);
    const x1 = x0 + 1;
    const t = x - x0;
    const v0 = this.hashToUnit(seed, x0);
    const v1 = this.hashToUnit(seed, x1);
    const smooth = t * t * (3 - 2 * t);
    return v0 + (v1 - v0) * smooth;
  }

  private hashToUnit(seed: number, x: number): number {
    let h = (seed ^ (x * 374761393)) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return h / 2147483648 - 1;
  }

  private normalizeSeed(seed: number): number {
    const normalized = Math.floor(Math.abs(seed)) >>> 0;
    return normalized === 0 ? 1 : normalized;
  }
}
