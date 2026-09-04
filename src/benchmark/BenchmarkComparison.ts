import { BenchmarkResult, ComparisonResult, PercentageChange } from './types';
import { ensureComparable, getManifestDifferences } from './BenchmarkManifest';

export class BenchmarkComparison {
  compare(baseline: BenchmarkResult, current: BenchmarkResult): ComparisonResult {
    ensureComparable(baseline, current);
    const changes = {
      avgFps: this.calculateChange(
        baseline.stats.avgFps,
        current.stats.avgFps,
        true, // higher is better
      ),
      p95FrameTime: this.calculateChange(
        baseline.stats.p95FrameTime,
        current.stats.p95FrameTime,
        false, // lower is better
      ),
      frameDropRate: this.calculateChange(
        baseline.stats.frameDropRate,
        current.stats.frameDropRate,
        false, // lower is better
      ),
      avgUpdateTime: this.calculateChange(
        baseline.stats.avgUpdateTime,
        current.stats.avgUpdateTime,
        false, // lower is better
      ),
      avgRenderTime: this.calculateChange(
        baseline.stats.avgRenderTime,
        current.stats.avgRenderTime,
        false, // lower is better
      ),
    };

    const verdict = this.determineVerdict(changes);

    return {
      baseline,
      current,
      changes,
      verdict,
      differingFields: getManifestDifferences(baseline.manifest, current.manifest),
    };
  }

  private calculateChange(
    baselineValue: number,
    currentValue: number,
    higherIsBetter: boolean,
  ): PercentageChange {
    const percentChange =
      baselineValue !== 0
        ? ((currentValue - baselineValue) / baselineValue) * 100
        : currentValue > 0
          ? 100
          : 0;

    const improved = higherIsBetter ? currentValue > baselineValue : currentValue < baselineValue;

    return {
      baselineValue,
      currentValue,
      percentChange,
      improved,
    };
  }

  private determineVerdict(changes: ComparisonResult['changes']): ComparisonResult['verdict'] {
    const improvements = [
      changes.avgFps.improved,
      changes.p95FrameTime.improved,
      changes.frameDropRate.improved,
    ];

    const significantChange = 5; // 5% threshold for significance
    const significantChanges = [
      Math.abs(changes.avgFps.percentChange) > significantChange,
      Math.abs(changes.p95FrameTime.percentChange) > significantChange,
      Math.abs(changes.frameDropRate.percentChange) > significantChange,
    ];

    // Count significant improvements and regressions
    let significantImprovements = 0;
    let significantRegressions = 0;

    for (let i = 0; i < improvements.length; i++) {
      if (significantChanges[i]) {
        if (improvements[i]) {
          significantImprovements++;
        } else {
          significantRegressions++;
        }
      }
    }

    if (significantImprovements > significantRegressions) {
      return 'improved';
    } else if (significantRegressions > significantImprovements) {
      return 'regressed';
    }
    return 'unchanged';
  }

  formatComparison(result: ComparisonResult): string {
    const baseLabel = result.baseline.userLabel || result.baseline.id.slice(0, 8);
    const currLabel = result.current.userLabel || result.current.id.slice(0, 8);

    const lines = [
      `Comparison: "${currLabel}" vs "${baseLabel}"`,
      '──────────────────────────────────────────────',
      this.formatLine('Avg FPS', result.changes.avgFps),
      this.formatLine('p95 Frame', result.changes.p95FrameTime, 'ms'),
      this.formatLine('Frame Drops', result.changes.frameDropRate, '%'),
      this.formatLine('Avg Update', result.changes.avgUpdateTime, 'ms'),
      this.formatLine('Avg Render', result.changes.avgRenderTime, 'ms'),
      '',
      `Verdict: ${result.verdict.toUpperCase()}`,
    ];

    return lines.join('\n');
  }

  private formatLine(label: string, change: PercentageChange, unit = ''): string {
    const baseVal = this.formatNumber(change.baselineValue);
    const currVal = this.formatNumber(change.currentValue);
    const pctStr =
      change.percentChange >= 0
        ? `+${change.percentChange.toFixed(1)}%`
        : `${change.percentChange.toFixed(1)}%`;
    const indicator = change.improved ? '✓' : '✗';

    return `${label.padEnd(12)} ${currVal}${unit} vs ${baseVal}${unit}  (${pctStr}) ${indicator}`;
  }

  private formatNumber(n: number): string {
    return n.toFixed(1).padStart(6);
  }
}
