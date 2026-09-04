import { World, WorldStateSnapshot } from '../simulator';
import { ForceRegistry } from '../forces';
import { ShaderRegistry } from '../shaders';
import { MetricsCollector } from './MetricsCollector';
import {
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkRunManifest,
  BenchmarkRuntimeContext,
  BenchmarkScenario,
  BenchmarkState,
  EnvironmentInfo,
} from './types';
import { withCompatibilityFingerprint } from './BenchmarkManifest';

const FPS_THRESHOLD = 58; // Consider "below 60fps" with small margin
const SUSTAINED_DROP_MILLISECONDS = 1_000;
const BENCHMARK_EMISSION_RATE = 3_000;

export class BenchmarkRunner {
  private collector: MetricsCollector;
  private state: BenchmarkState = 'idle';
  private scenario: BenchmarkScenario | null = null;
  private startTime = 0;
  private warmupEndTime = 0;
  private endTime = 0;
  private originalWorldState: WorldStateSnapshot | null = null;
  private originalForceSnapshot: Record<string, unknown> | null = null;
  private originalShaderSnapshot: Record<string, unknown> | null = null;
  private manifest: BenchmarkRunManifest | null = null;
  private onProgress: ((progress: BenchmarkProgress) => void) | null = null;
  private onComplete: ((result: BenchmarkResult) => void) | null = null;
  private onInvalid: ((reason: string) => void) | null = null;
  private forceRegistry: ForceRegistry | null;
  private shaderRegistry: ShaderRegistry | null;

  // Ramp test tracking
  private currentRampParticles = 0;
  private belowFpsSinceMilliseconds: number | null = null;
  private breakPointParticles: number | null = null;

  constructor(
    forceRegistry?: ForceRegistry,
    shaderRegistry?: ShaderRegistry,
    private readonly getRuntimeContext: () => BenchmarkRuntimeContext = defaultRuntimeContext,
  ) {
    this.collector = new MetricsCollector();
    this.forceRegistry = forceRegistry || null;
    this.shaderRegistry = shaderRegistry || null;
  }

  isRunning(): boolean {
    return this.state === 'warmup' || this.state === 'running';
  }

  getState(): BenchmarkState {
    return this.state;
  }

  start(
    scenario: BenchmarkScenario,
    world: World,
    callbacks: {
      onProgress?: (progress: BenchmarkProgress) => void;
      onComplete?: (result: BenchmarkResult) => void;
      onInvalid?: (reason: string) => void;
    } = {},
  ): void {
    if (this.isRunning()) {
      console.warn('Benchmark already running');
      return;
    }

    this.scenario = scenario;
    this.onProgress = callbacks.onProgress || null;
    this.onComplete = callbacks.onComplete || null;
    this.onInvalid = callbacks.onInvalid || null;

    // Save original settings
    this.originalWorldState = world.snapshotState();
    this.originalForceSnapshot = this.forceRegistry ? this.forceRegistry.snapshot() : null;
    this.originalShaderSnapshot = this.shaderRegistry ? this.shaderRegistry.snapshot() : null;

    // Apply scenario settings
    world.updateSettings({
      maxParticleCount: scenario.settings.maxParticleCount,
      enableParticleCollision: scenario.settings.enableParticleCollision,
      emissionRate: BENCHMARK_EMISSION_RATE,
    });
    const initialParticleCount = scenario.settings.rampMode
      ? (scenario.settings.rampStartCount ?? scenario.settings.maxParticleCount)
      : scenario.settings.maxParticleCount;
    world.resetPopulation(initialParticleCount, { seed: scenario.settings.seed });
    this.applyForcePreset(scenario);
    this.applyShaderPreset(scenario);
    this.manifest = this.createManifest(world, initialParticleCount);

    // Set timing
    const now = performance.now();
    this.startTime = now;
    this.warmupEndTime = now + scenario.warmupDuration * 1000;
    this.endTime = now + (scenario.warmupDuration + scenario.duration) * 1000;

    // Start in warmup state
    this.state = 'warmup';
    this.collector.reset();

    // Reset ramp tracking
    this.currentRampParticles =
      scenario.settings.rampStartCount ?? scenario.settings.maxParticleCount;
    this.belowFpsSinceMilliseconds = null;
    this.breakPointParticles = null;
  }

  recordFrame(
    data: {
      updateTime: number;
      renderTime: number;
      particleCount: number;
      poolSize: number;
    },
    world: World,
  ): void {
    if (!this.isRunning() || !this.scenario) return;

    const now = performance.now();

    // Handle ramp mode - increase particles until FPS drops
    if (this.scenario.settings.rampMode && this.state === 'running') {
      const endCount = this.scenario.settings.rampEndCount || 10000;
      const actualParticles = data.particleCount;
      const rollingFps = this.collector.getRollingFps(30);

      // Track highest actual particle count seen
      if (actualParticles > this.currentRampParticles) {
        this.currentRampParticles = actualParticles;
      }

      // Check if FPS is below threshold (only after we have enough data)
      if (this.collector.getFrameCount() >= 30 && rollingFps < FPS_THRESHOLD) {
        this.belowFpsSinceMilliseconds ??= now;
        if (
          now - this.belowFpsSinceMilliseconds >= SUSTAINED_DROP_MILLISECONDS &&
          !this.breakPointParticles
        ) {
          this.breakPointParticles = this.currentRampParticles;
          this.complete(world, this.breakPointParticles);
          return;
        }
      } else {
        this.belowFpsSinceMilliseconds = null;
      }

      world.setTargetPopulation(endCount);

      // If actual particles reached max and still above 60fps, we're done
      if (actualParticles >= endCount && this.collector.getFrameCount() > 60) {
        this.breakPointParticles = endCount; // Never dropped
        this.complete(world, this.breakPointParticles);
        return;
      }
    }

    // Check state transitions
    if (this.state === 'warmup' && now >= this.warmupEndTime) {
      this.state = 'running';
      this.collector.start();
    }

    // Record frame if in running state
    if (this.state === 'running') {
      this.collector.recordFrame(data);
    }

    // Check for completion (time-based, for non-ramp tests)
    if (!this.scenario.settings.rampMode && now >= this.endTime) {
      this.complete(world);
      return;
    }

    // Report progress
    this.reportProgress(now, data.particleCount);
  }

  private complete(world: World, breakPoint?: number): void {
    this.collector.stop();
    this.restoreBenchmarkState(world);
    const result = this.generateResult(breakPoint);
    if (!result) {
      this.state = 'invalid';
      this.onInvalid?.('benchmark ended without measured frames');
      return;
    }

    this.state = 'complete';
    this.onComplete?.(result);

    // Reset to idle after a short delay
    setTimeout(() => {
      this.state = 'idle';
    }, 100);
  }

  stop(world: World): void {
    if (!this.isRunning()) return;

    this.collector.stop();
    this.state = 'idle';

    this.restoreBenchmarkState(world);
  }

  invalidate(reason: string, world: World): void {
    if (!this.isRunning()) {
      return;
    }

    this.collector.stop();
    this.state = 'invalid';
    this.restoreBenchmarkState(world);
    this.onInvalid?.(reason);
  }

  private restoreBenchmarkState(world: World): void {
    this.restoreWorldState(world);
    if (this.forceRegistry && this.originalForceSnapshot) {
      this.forceRegistry.restore(this.originalForceSnapshot);
      this.originalForceSnapshot = null;
    }
    if (this.shaderRegistry && this.originalShaderSnapshot) {
      this.shaderRegistry.restore(this.originalShaderSnapshot);
      this.originalShaderSnapshot = null;
    }
  }

  private applyForcePreset(scenario: BenchmarkScenario): void {
    if (!this.forceRegistry) {
      return;
    }

    const forcePresetId = scenario.settings.forcePresetId || 'gravityOnly';
    if (forcePresetId === 'custom' && scenario.settings.customForceState) {
      this.forceRegistry.restore(scenario.settings.customForceState);
      return;
    }

    if (forcePresetId === 'gravityOnly' || forcePresetId === 'benchmarkDefault') {
      for (const plugin of this.forceRegistry.list()) {
        plugin.setState({ enabled: plugin.id === 'gravity' });
      }
    }
  }

  private restoreWorldState(world: World): void {
    if (!this.originalWorldState) {
      return;
    }
    world.restoreState(this.originalWorldState);
    this.originalWorldState = null;
  }

  private applyShaderPreset(scenario: BenchmarkScenario): void {
    if (!this.shaderRegistry) {
      return;
    }

    const shaderPresetId = scenario.settings.shaderPresetId || 'shadersOff';
    if (shaderPresetId === 'custom' && scenario.settings.customShaderState) {
      this.shaderRegistry.restore(scenario.settings.customShaderState);
      return;
    }

    if (shaderPresetId === 'shadersOff' || shaderPresetId === 'benchmarkDefault') {
      for (const plugin of this.shaderRegistry.list()) {
        if (plugin.id === 'ageAlpha') {
          plugin.setState({ enabled: true });
        } else {
          plugin.setState({ enabled: false });
        }
      }
    }
  }

  private generateResult(breakPoint?: number): BenchmarkResult | null {
    if (!this.scenario || !this.manifest || this.collector.getFrameCount() === 0) return null;

    const stats = this.collector.calculateStats();

    // Add break point for ramp tests
    if (breakPoint !== undefined) {
      stats.breakPointParticles = breakPoint;
    }

    const environment = this.getEnvironmentInfo();

    const manifest = withCompatibilityFingerprint({
      ...this.manifest,
      quality: { sampleCount: this.collector.getFrameCount() },
    });

    return {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      scenario: this.scenario,
      stats,
      environment,
      manifest,
    };
  }

  private createManifest(world: World, initialParticleCount: number): BenchmarkRunManifest {
    if (!this.scenario) {
      throw new Error('Cannot create a benchmark manifest without a scenario.');
    }

    const settings = world.getSettings();
    const runtime = this.getRuntimeContext();
    const manifest = {
      schemaVersion: 1 as const,
      scenario: clone(this.scenario),
      renderer: clone(runtime.renderer),
      surface: clone(runtime.surface),
      clock: clone(runtime.clock),
      pixelsPerMeter: runtime.pixelsPerMeter,
      world: {
        initialParticleCount,
        maxParticleCount: settings.maxParticleCount,
        enableParticleCollision: settings.enableParticleCollision,
        emissionRate: settings.emissionRate,
        elasticity: settings.elasticity,
        particleRadius: { min: settings.minParticleRadius, max: settings.maxParticleRadius },
        particleVelocity: { min: settings.minParticleVelocity, max: settings.maxParticleVelocity },
        particleLifeSpan: { min: settings.minParticleLifeSpan, max: settings.maxParticleLifeSpan },
        startingAngle: { min: settings.minStartingAngle, max: settings.maxStartingAngle },
        fillStyle: typeof settings.fillStyle === 'string' ? settings.fillStyle : 'random-source',
        seed: this.scenario.settings.seed,
      },
      forces: this.snapshotPlugins(this.forceRegistry),
      effects: this.snapshotPlugins(this.shaderRegistry),
      thresholds: {
        targetFps: FPS_THRESHOLD,
        sustainedDropMilliseconds: SUSTAINED_DROP_MILLISECONDS,
        frameDropMilliseconds: 20,
      },
      quality: { sampleCount: 0 },
      build: clone(runtime.build),
    };
    return withCompatibilityFingerprint(manifest);
  }

  private snapshotPlugins(
    registry: ForceRegistry | ShaderRegistry | null,
  ): BenchmarkRunManifest['forces'] {
    if (!registry) return {};
    return Object.fromEntries(
      registry.list().map((plugin) => [
        plugin.id,
        {
          schemaVersion: 1,
          state: clone(plugin.getState()) as unknown as Record<string, unknown>,
        },
      ]),
    );
  }

  private getEnvironmentInfo(): EnvironmentInfo {
    return {
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      devicePixelRatio: window.devicePixelRatio,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      timestamp: new Date().toISOString(),
    };
  }

  private generateId(): string {
    return `bench_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }

  private reportProgress(now: number, particleCount?: number): void {
    if (!this.onProgress || !this.scenario) return;

    const totalDuration = (this.scenario.warmupDuration + this.scenario.duration) * 1000;
    const elapsed = now - this.startTime;

    // For ramp tests, progress is based on particle count, not time
    let progress: number;
    if (this.scenario.settings.rampMode) {
      const endCount = this.scenario.settings.rampEndCount || 10000;
      progress = Math.min((this.currentRampParticles / endCount) * 100, 100);
    } else {
      progress = Math.min((elapsed / totalDuration) * 100, 100);
    }

    this.onProgress({
      state: this.state,
      elapsedTime: elapsed / 1000,
      totalTime: totalDuration / 1000,
      progress,
      currentParticles: particleCount,
      currentFps: this.collector.getRollingFps(30),
    });
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultRuntimeContext(): BenchmarkRuntimeContext {
  return {
    renderer: { id: 'unknown', capability: 'not-applicable' },
    surface: {
      logicalWidth: 0,
      logicalHeight: 0,
      backingWidth: 0,
      backingHeight: 0,
      devicePixelRatio: 1,
      backgroundColor: 'unknown',
    },
    clock: {
      fixedStepSeconds: 1 / 60,
      maxFrameDeltaSeconds: 0.1,
      maxStepsPerCallback: 8,
      overloadThresholdSeconds: 0.5,
    },
    pixelsPerMeter: 100,
    build: { appVersion: 'unknown', revision: 'unknown' },
  };
}
