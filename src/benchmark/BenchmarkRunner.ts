import { World, WorldSettings } from '../simulator';
import { ForceRegistry } from '../forces';
import { ShaderRegistry } from '../shaders';
import { RandomSource } from '../random';
import { MetricsCollector } from './MetricsCollector';
import {
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkScenario,
  BenchmarkState,
  EnvironmentInfo,
} from './types';

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
  private originalSettings: WorldSettings | null = null;
  private originalForceSnapshot: Record<string, unknown> | null = null;
  private originalShaderSnapshot: Record<string, unknown> | null = null;
  private originalRandomSource: RandomSource | null = null;
  private originalParticleCount = 0;
  private onProgress: ((progress: BenchmarkProgress) => void) | null = null;
  private onComplete: ((result: BenchmarkResult) => void) | null = null;
  private onInvalid: ((reason: string) => void) | null = null;
  private forceRegistry: ForceRegistry | null;
  private shaderRegistry: ShaderRegistry | null;

  // Ramp test tracking
  private currentRampParticles = 0;
  private belowFpsSinceMilliseconds: number | null = null;
  private breakPointParticles: number | null = null;

  constructor(forceRegistry?: ForceRegistry, shaderRegistry?: ShaderRegistry) {
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
    this.originalSettings = world.getSettings();
    this.originalForceSnapshot = this.forceRegistry ? this.forceRegistry.snapshot() : null;
    this.originalShaderSnapshot = this.shaderRegistry ? this.shaderRegistry.snapshot() : null;
    this.originalRandomSource = world.getRandomSource();
    this.originalParticleCount = world.particleCount;

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
    this.state = 'complete';

    this.restoreBenchmarkState(world);

    const result = this.generateResult(breakPoint);

    if (this.onComplete && result) {
      this.onComplete(result);
    }

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
    if (!this.originalSettings) {
      return;
    }

    world.updateSettings(this.originalSettings);
    this.originalSettings = null;

    if (this.originalRandomSource) {
      world.setRandomSource(this.originalRandomSource);
      this.originalRandomSource = null;
    }

    world.resetPopulation(this.originalParticleCount);
    this.originalParticleCount = 0;
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
    if (!this.scenario) return null;

    const stats = this.collector.calculateStats();

    // Add break point for ramp tests
    if (breakPoint !== undefined) {
      stats.breakPointParticles = breakPoint;
    }

    const environment = this.getEnvironmentInfo();

    return {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      scenario: this.scenario,
      stats,
      environment,
    };
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
