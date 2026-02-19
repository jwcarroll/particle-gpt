import { World } from '../simulator';
import { ForceRegistry } from '../forces';
import { ShaderRegistry } from '../shaders';
import { BenchmarkComparison } from './BenchmarkComparison';
import { BenchmarkRunner } from './BenchmarkRunner';
import { BenchmarkStorage } from './BenchmarkStorage';
import { BenchmarkPaneContainer, BenchmarkUI } from './BenchmarkUI';

export class BenchmarkModule {
  private runner: BenchmarkRunner;
  private storage: BenchmarkStorage;
  private comparison: BenchmarkComparison;
  private ui: BenchmarkUI;
  private world: World;

  constructor(world: World, forceRegistry?: ForceRegistry, shaderRegistry?: ShaderRegistry) {
    this.world = world;
    this.runner = new BenchmarkRunner(forceRegistry, shaderRegistry);
    this.storage = new BenchmarkStorage();
    this.comparison = new BenchmarkComparison();
    this.ui = new BenchmarkUI(this.runner, this.storage, this.world);
  }

  setupUI(pane: BenchmarkPaneContainer): void {
    this.ui.setup(pane);
  }

  recordFrame(data: {
    updateTime: number;
    renderTime: number;
    particleCount: number;
    poolSize: number;
  }): void {
    this.runner.recordFrame(data, this.world);
  }

  isRunning(): boolean {
    return this.runner.isRunning();
  }

  getRunner(): BenchmarkRunner {
    return this.runner;
  }

  getStorage(): BenchmarkStorage {
    return this.storage;
  }

  getComparison(): BenchmarkComparison {
    return this.comparison;
  }
}

// Re-export types and utilities
export { BenchmarkRunner } from './BenchmarkRunner';
export { BenchmarkStorage } from './BenchmarkStorage';
export { BenchmarkComparison } from './BenchmarkComparison';
export { MetricsCollector } from './MetricsCollector';
export { SCENARIOS, getScenarioList, getScenarioById } from './BenchmarkScenario';
export * from './types';
