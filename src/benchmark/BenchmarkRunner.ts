import { World, WorldSettings } from '../simulator';
import { ForceRegistry } from '../forces';
import { MetricsCollector } from './MetricsCollector';
import {
  BenchmarkProgress,
  BenchmarkResult,
  BenchmarkScenario,
  BenchmarkState,
  EnvironmentInfo,
} from './types';

const FPS_THRESHOLD = 58; // Consider "below 60fps" with small margin
const SUSTAINED_DROP_FRAMES = 60; // Must stay below threshold for 1 second

export class BenchmarkRunner {
  private collector: MetricsCollector;
  private state: BenchmarkState = 'idle';
  private scenario: BenchmarkScenario | null = null;
  private startTime = 0;
  private warmupEndTime = 0;
  private endTime = 0;
  private originalSettings: Partial<WorldSettings> | null = null;
  private originalForceSnapshot: Record<string, unknown> | null = null;
  private onProgress: ((progress: BenchmarkProgress) => void) | null = null;
  private onComplete: ((result: BenchmarkResult) => void) | null = null;
  private forceRegistry: ForceRegistry | null;

  // Ramp test tracking
  private currentRampParticles = 0;
  private framesBelow60 = 0;
  private breakPointParticles: number | null = null;

  constructor(forceRegistry?: ForceRegistry) {
    this.collector = new MetricsCollector();
    this.forceRegistry = forceRegistry || null;
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
    } = {}
  ): void {
    if (this.isRunning()) {
      console.warn('Benchmark already running');
      return;
    }

    this.scenario = scenario;
    this.onProgress = callbacks.onProgress || null;
    this.onComplete = callbacks.onComplete || null;

    // Save original settings
    this.originalSettings = world.getSettings();
    this.originalForceSnapshot = this.forceRegistry ? this.forceRegistry.snapshot() : null;

    // Apply scenario settings
    // Spawn rate of 100 = ~6000 particles/second at 60fps, balances ramp speed vs measurement accuracy
    world.updateSettings({
      minParticleCount: scenario.settings.minParticleCount,
      maxParticleCount: scenario.settings.maxParticleCount,
      enableParticleCollision: scenario.settings.enableParticleCollision,
      spawnRate: 50,
    });
    this.applyForcePreset(scenario);

    // Set timing
    const now = performance.now();
    this.startTime = now;
    this.warmupEndTime = now + scenario.warmupDuration * 1000;
    this.endTime = now + (scenario.warmupDuration + scenario.duration) * 1000;

    // Start in warmup state
    this.state = 'warmup';
    this.collector.reset();

    // Reset ramp tracking
    this.currentRampParticles = scenario.settings.rampStartCount || 100;
    this.framesBelow60 = 0;
    this.breakPointParticles = null;
  }

  recordFrame(
    data: {
      updateTime: number;
      renderTime: number;
      particleCount: number;
      poolSize: number;
    },
    world: World
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
        this.framesBelow60++;

        // If sustained drop detected, record break point and stop
        if (this.framesBelow60 >= SUSTAINED_DROP_FRAMES && !this.breakPointParticles) {
          this.breakPointParticles = this.currentRampParticles;
          this.complete(world, this.breakPointParticles);
          return;
        }
      } else {
        this.framesBelow60 = 0; // Reset counter if FPS recovers
      }

      // Set target to max - let world.refillParticles() do the gradual increase
      world.updateSettings({
        minParticleCount: endCount,
        maxParticleCount: endCount,
      });

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

    // Restore original settings
    if (this.originalSettings) {
      world.updateSettings(this.originalSettings);
      this.originalSettings = null;
    }
    if (this.forceRegistry && this.originalForceSnapshot) {
      this.forceRegistry.restore(this.originalForceSnapshot);
      this.originalForceSnapshot = null;
    }

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

    if (this.originalSettings) {
      world.updateSettings(this.originalSettings);
      this.originalSettings = null;
    }
    if (this.forceRegistry && this.originalForceSnapshot) {
      this.forceRegistry.restore(this.originalForceSnapshot);
      this.originalForceSnapshot = null;
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
