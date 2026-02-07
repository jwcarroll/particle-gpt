/**
 * Benchmark system type definitions
 */

export interface FrameMetrics {
  timestamp: number;
  frameTime: number;      // Total frame time (ms)
  updateTime: number;     // world.update() time (ms)
  renderTime: number;     // renderer.render() time (ms)
  particleCount: number;
  poolSize: number;
}

export interface BenchmarkStats {
  avgFps: number;
  minFps: number;
  maxFps: number;
  avgFrameTime: number;
  p95FrameTime: number;   // 95th percentile for jank detection
  avgUpdateTime: number;
  avgRenderTime: number;
  framesDropped: number;  // Frames > 16.67ms
  frameDropRate: number;  // Percentage dropped
  totalFrames: number;
  // Ramp test specific
  breakPointParticles?: number;  // Particle count when FPS dropped below threshold
}

export interface BenchmarkScenario {
  id: string;
  name: string;
  description: string;
  duration: number;       // Duration in seconds
  warmupDuration: number; // Warmup period in seconds (not counted in stats)
  settings: ScenarioSettings;
}

export interface ScenarioSettings {
  minParticleCount: number;
  maxParticleCount: number;
  enableParticleCollision: boolean;
  // For ramp test
  rampMode?: boolean;
  rampStartCount?: number;
  rampEndCount?: number;
}

export interface EnvironmentInfo {
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  hardwareConcurrency: number;
  timestamp: string;
}

export interface BenchmarkResult {
  id: string;
  timestamp: string;
  userLabel?: string;     // e.g., "baseline", "after optimization"
  scenario: BenchmarkScenario;
  stats: BenchmarkStats;
  environment: EnvironmentInfo;
}

export interface ComparisonResult {
  baseline: BenchmarkResult;
  current: BenchmarkResult;
  changes: {
    avgFps: PercentageChange;
    p95FrameTime: PercentageChange;
    frameDropRate: PercentageChange;
    avgUpdateTime: PercentageChange;
    avgRenderTime: PercentageChange;
  };
  verdict: 'improved' | 'regressed' | 'unchanged';
}

export interface PercentageChange {
  baselineValue: number;
  currentValue: number;
  percentChange: number;
  improved: boolean;
}

export type BenchmarkState = 'idle' | 'warmup' | 'running' | 'complete';

export interface BenchmarkProgress {
  state: BenchmarkState;
  elapsedTime: number;
  totalTime: number;
  progress: number;       // 0-100
  currentParticles?: number;  // For ramp tests
  currentFps?: number;        // For ramp tests
}
