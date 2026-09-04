export interface SimulationClockOptions {
  fixedStepSeconds?: number;
  maxFrameDeltaSeconds?: number;
  maxStepsPerCallback?: number;
  overloadThresholdSeconds?: number;
}

export interface SimulationClockFrame {
  observedDeltaSeconds: number;
  acceptedDeltaSeconds: number;
  discardedWallTimeSeconds: number;
  physicsSteps: number;
  simulationTimeSeconds: number;
  accumulatorSeconds: number;
  presentationTimeSeconds: number;
  interpolationAlpha: number;
  behind: boolean;
  overloaded: boolean;
  clamped: boolean;
  shouldRender: boolean;
}

export interface SimulationClockDiagnostics {
  simulationTimeSeconds: number;
  accumulatorSeconds: number;
  totalPhysicsSteps: number;
  skippedRenders: number;
  clampedFrames: number;
  discardedWallTimeSeconds: number;
  overloaded: boolean;
}

const DEFAULT_FIXED_STEP_SECONDS = 1 / 60;
const DEFAULT_MAX_FRAME_DELTA_SECONDS = 0.1;
const DEFAULT_MAX_STEPS_PER_CALLBACK = 8;
const DEFAULT_OVERLOAD_THRESHOLD_SECONDS = 0.5;
const FLOATING_POINT_EPSILON = 1e-12;

export class SimulationClock {
  readonly fixedStepSeconds: number;
  readonly maxFrameDeltaSeconds: number;
  readonly maxStepsPerCallback: number;
  readonly overloadThresholdSeconds: number;

  private previousWallTimeMilliseconds: number | null = null;
  private accumulatorSeconds = 0;
  private simulationTimeSeconds = 0;
  private overloadDurationSeconds = 0;
  private paused = false;
  private totalPhysicsSteps = 0;
  private skippedRenders = 0;
  private clampedFrames = 0;
  private discardedWallTimeSeconds = 0;
  private overloaded = false;

  constructor(options: SimulationClockOptions = {}) {
    this.fixedStepSeconds = options.fixedStepSeconds ?? DEFAULT_FIXED_STEP_SECONDS;
    this.maxFrameDeltaSeconds = options.maxFrameDeltaSeconds ?? DEFAULT_MAX_FRAME_DELTA_SECONDS;
    this.maxStepsPerCallback = options.maxStepsPerCallback ?? DEFAULT_MAX_STEPS_PER_CALLBACK;
    this.overloadThresholdSeconds = options.overloadThresholdSeconds ?? DEFAULT_OVERLOAD_THRESHOLD_SECONDS;

    this.validatePositiveFinite(this.fixedStepSeconds, 'fixedStepSeconds');
    this.validatePositiveFinite(this.maxFrameDeltaSeconds, 'maxFrameDeltaSeconds');
    this.validatePositiveFinite(this.overloadThresholdSeconds, 'overloadThresholdSeconds');
    if (!Number.isInteger(this.maxStepsPerCallback) || this.maxStepsPerCallback <= 0) {
      throw new RangeError('maxStepsPerCallback must be a positive integer.');
    }
  }

  advance(wallTimeMilliseconds: number, update: (fixedStepSeconds: number) => void): SimulationClockFrame {
    if (!Number.isFinite(wallTimeMilliseconds)) {
      throw new RangeError('wallTimeMilliseconds must be finite.');
    }

    if (this.paused || this.previousWallTimeMilliseconds === null) {
      this.previousWallTimeMilliseconds = wallTimeMilliseconds;
      return this.createFrame(0, 0, 0, 0, false);
    }

    const observedDeltaSeconds = Math.max(
      (wallTimeMilliseconds - this.previousWallTimeMilliseconds) / 1_000,
      0,
    );
    this.previousWallTimeMilliseconds = wallTimeMilliseconds;

    const acceptedDeltaSeconds = Math.min(observedDeltaSeconds, this.maxFrameDeltaSeconds);
    const discardedWallTimeSeconds = Math.max(observedDeltaSeconds - acceptedDeltaSeconds, 0);
    const clamped = discardedWallTimeSeconds > FLOATING_POINT_EPSILON;
    if (clamped) {
      this.clampedFrames++;
      this.discardedWallTimeSeconds += discardedWallTimeSeconds;
    }

    this.accumulatorSeconds += acceptedDeltaSeconds;

    let physicsSteps = 0;
    while (
      this.accumulatorSeconds + FLOATING_POINT_EPSILON >= this.fixedStepSeconds
      && physicsSteps < this.maxStepsPerCallback
    ) {
      update(this.fixedStepSeconds);
      this.simulationTimeSeconds += this.fixedStepSeconds;
      this.accumulatorSeconds -= this.fixedStepSeconds;
      if (this.accumulatorSeconds < FLOATING_POINT_EPSILON) {
        this.accumulatorSeconds = 0;
      }
      physicsSteps++;
      this.totalPhysicsSteps++;
    }

    const behind = this.accumulatorSeconds + FLOATING_POINT_EPSILON >= this.fixedStepSeconds;
    if (behind) {
      this.overloadDurationSeconds += acceptedDeltaSeconds;
      if (this.overloadDurationSeconds >= this.overloadThresholdSeconds) {
        this.overloaded = true;
      }
      this.skippedRenders++;
    } else {
      this.overloadDurationSeconds = 0;
      this.overloaded = false;
    }

    return this.createFrame(
      observedDeltaSeconds,
      acceptedDeltaSeconds,
      discardedWallTimeSeconds,
      physicsSteps,
      clamped,
    );
  }

  pause(): void {
    this.paused = true;
    this.previousWallTimeMilliseconds = null;
    this.accumulatorSeconds = 0;
    this.overloadDurationSeconds = 0;
  }

  resume(wallTimeMilliseconds?: number): void {
    if (wallTimeMilliseconds !== undefined && !Number.isFinite(wallTimeMilliseconds)) {
      throw new RangeError('wallTimeMilliseconds must be finite.');
    }
    this.paused = false;
    this.previousWallTimeMilliseconds = wallTimeMilliseconds ?? null;
    this.accumulatorSeconds = 0;
    this.overloadDurationSeconds = 0;
  }

  reset(wallTimeMilliseconds?: number): void {
    if (wallTimeMilliseconds !== undefined && !Number.isFinite(wallTimeMilliseconds)) {
      throw new RangeError('wallTimeMilliseconds must be finite.');
    }
    this.previousWallTimeMilliseconds = wallTimeMilliseconds ?? null;
    this.accumulatorSeconds = 0;
    this.simulationTimeSeconds = 0;
    this.overloadDurationSeconds = 0;
    this.paused = false;
    this.totalPhysicsSteps = 0;
    this.skippedRenders = 0;
    this.clampedFrames = 0;
    this.discardedWallTimeSeconds = 0;
    this.overloaded = false;
  }

  getDiagnostics(): SimulationClockDiagnostics {
    return {
      simulationTimeSeconds: this.simulationTimeSeconds,
      accumulatorSeconds: this.accumulatorSeconds,
      totalPhysicsSteps: this.totalPhysicsSteps,
      skippedRenders: this.skippedRenders,
      clampedFrames: this.clampedFrames,
      discardedWallTimeSeconds: this.discardedWallTimeSeconds,
      overloaded: this.overloaded,
    };
  }

  private createFrame(
    observedDeltaSeconds: number,
    acceptedDeltaSeconds: number,
    discardedWallTimeSeconds: number,
    physicsSteps: number,
    clamped: boolean,
  ): SimulationClockFrame {
    const interpolationAlpha = Math.min(
      Math.max(this.accumulatorSeconds / this.fixedStepSeconds, 0),
      1,
    );
    const behind = this.accumulatorSeconds + FLOATING_POINT_EPSILON >= this.fixedStepSeconds;

    return {
      observedDeltaSeconds,
      acceptedDeltaSeconds,
      discardedWallTimeSeconds,
      physicsSteps,
      simulationTimeSeconds: this.simulationTimeSeconds,
      accumulatorSeconds: this.accumulatorSeconds,
      presentationTimeSeconds: this.simulationTimeSeconds + this.accumulatorSeconds,
      interpolationAlpha,
      behind,
      overloaded: this.overloaded,
      clamped,
      shouldRender: !behind,
    };
  }

  private validatePositiveFinite(value: number, name: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number.`);
    }
  }
}
