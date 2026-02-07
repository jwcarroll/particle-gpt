import { BenchmarkStats, FrameMetrics } from './types';

// Frames over 20ms are noticeable jank (50fps), not just timing variance
const FRAME_DROP_THRESHOLD = 20;

export class MetricsCollector {
  private frames: FrameMetrics[] = [];
  private isCollecting = false;
  private lastFrameTime = 0;
  private firstFrame = true;

  start(): void {
    this.frames = [];
    this.isCollecting = true;
    this.lastFrameTime = 0;
    this.firstFrame = true;
  }

  stop(): void {
    this.isCollecting = false;
  }

  reset(): void {
    this.frames = [];
    this.isCollecting = false;
    this.lastFrameTime = 0;
    this.firstFrame = true;
  }

  recordFrame(metrics: Omit<FrameMetrics, 'timestamp' | 'frameTime'>): void {
    if (!this.isCollecting) return;

    const now = performance.now();

    // Skip first frame - we need two timestamps to measure frame time
    if (this.firstFrame) {
      this.lastFrameTime = now;
      this.firstFrame = false;
      return;
    }

    // Actual frame time = time since last frame (real fps measurement)
    const frameTime = now - this.lastFrameTime;
    this.lastFrameTime = now;

    this.frames.push({
      ...metrics,
      timestamp: now,
      frameTime,
    });
  }

  getFrameCount(): number {
    return this.frames.length;
  }

  /**
   * Get rolling average FPS over the last N frames
   */
  getRollingFps(windowSize: number = 30): number {
    if (this.frames.length < windowSize) {
      return 60; // Assume 60fps until we have enough data
    }

    const recentFrames = this.frames.slice(-windowSize);
    const avgFrameTime = recentFrames.reduce((sum, f) => sum + f.frameTime, 0) / windowSize;
    return avgFrameTime > 0 ? 1000 / avgFrameTime : 60;
  }

  calculateStats(): BenchmarkStats {
    if (this.frames.length === 0) {
      return this.emptyStats();
    }

    const frameTimes = this.frames.map(f => f.frameTime);
    const updateTimes = this.frames.map(f => f.updateTime);
    const renderTimes = this.frames.map(f => f.renderTime);

    const avgFrameTime = this.average(frameTimes);
    const avgFps = avgFrameTime > 0 ? 1000 / avgFrameTime : 0;

    const sortedFrameTimes = [...frameTimes].sort((a, b) => a - b);
    const minFrameTime = sortedFrameTimes[0];
    const maxFrameTime = sortedFrameTimes[sortedFrameTimes.length - 1];
    const p95Index = Math.floor(sortedFrameTimes.length * 0.95);
    const p95FrameTime = sortedFrameTimes[p95Index] || maxFrameTime;

    const framesDropped = frameTimes.filter(t => t > FRAME_DROP_THRESHOLD).length;
    const frameDropRate = (framesDropped / frameTimes.length) * 100;

    return {
      avgFps,
      minFps: maxFrameTime > 0 ? 1000 / maxFrameTime : 0,
      maxFps: minFrameTime > 0 ? 1000 / minFrameTime : 0,
      avgFrameTime,
      p95FrameTime,
      avgUpdateTime: this.average(updateTimes),
      avgRenderTime: this.average(renderTimes),
      framesDropped,
      frameDropRate,
      totalFrames: this.frames.length,
    };
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private emptyStats(): BenchmarkStats {
    return {
      avgFps: 0,
      minFps: 0,
      maxFps: 0,
      avgFrameTime: 0,
      p95FrameTime: 0,
      avgUpdateTime: 0,
      avgRenderTime: 0,
      framesDropped: 0,
      frameDropRate: 0,
      totalFrames: 0,
    };
  }
}
