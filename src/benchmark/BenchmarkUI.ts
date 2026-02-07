import { FolderApi, Pane } from 'tweakpane';
import { World } from '../simulator';
import { BenchmarkComparison } from './BenchmarkComparison';
import { BenchmarkRunner } from './BenchmarkRunner';
import { getScenarioList, SCENARIOS } from './BenchmarkScenario';
import { BenchmarkStorage } from './BenchmarkStorage';
import { BenchmarkProgress, BenchmarkResult } from './types';

interface UIState {
  scenario: string;
  progress: number;
  status: string;
  lastFps: string;
  lastP95: string;
  lastDropRate: string;
  lastBreakPoint: string;
  label: string;
  baseline: string;
}

export class BenchmarkUI {
  private runner: BenchmarkRunner;
  private storage: BenchmarkStorage;
  private comparison: BenchmarkComparison;
  private world: World;
  private pane: Pane | null = null;
  private folder: FolderApi | null = null;
  private lastResult: BenchmarkResult | null = null;

  private state: UIState = {
    scenario: 'standard',
    progress: 0,
    status: 'Idle',
    lastFps: '-',
    lastP95: '-',
    lastDropRate: '-',
    lastBreakPoint: '-',
    label: '',
    baseline: '',
  };

  constructor(runner: BenchmarkRunner, storage: BenchmarkStorage, world: World) {
    this.runner = runner;
    this.storage = storage;
    this.comparison = new BenchmarkComparison();
    this.world = world;
  }

  setup(pane: Pane): FolderApi {
    this.pane = pane;
    this.folder = pane.addFolder({ title: 'Benchmark', expanded: false });

    // Scenario dropdown
    const scenarios = getScenarioList();
    const scenarioOptions = scenarios.reduce((acc, s) => {
      acc[s.name] = s.id;
      return acc;
    }, {} as Record<string, string>);

    this.folder.addBinding(this.state, 'scenario', {
      label: 'Scenario',
      options: scenarioOptions,
    });

    // Run button
    this.folder.addButton({ title: 'Run Benchmark' }).on('click', () => {
      this.runBenchmark();
    });

    // Progress bar (read-only binding)
    this.folder.addBinding(this.state, 'progress', {
      label: 'Progress',
      min: 0,
      max: 100,
      readonly: true,
    });

    // Status
    this.folder.addBinding(this.state, 'status', {
      label: 'Status',
      readonly: true,
    });

    // Results section
    const resultsFolder = this.folder.addFolder({ title: 'Last Run', expanded: true });

    resultsFolder.addBinding(this.state, 'lastFps', {
      label: 'Avg FPS',
      readonly: true,
    });

    resultsFolder.addBinding(this.state, 'lastP95', {
      label: 'p95 Frame',
      readonly: true,
    });

    resultsFolder.addBinding(this.state, 'lastDropRate', {
      label: 'Drop Rate',
      readonly: true,
    });

    resultsFolder.addBinding(this.state, 'lastBreakPoint', {
      label: '60fps Limit',
      readonly: true,
    });

    // Save section
    const saveFolder = this.folder.addFolder({ title: 'Save & Compare', expanded: true });

    saveFolder.addBinding(this.state, 'label', {
      label: 'Label',
    });

    saveFolder.addButton({ title: 'Save Result' }).on('click', () => {
      this.saveResult();
    });

    // Baseline selection
    this.updateBaselineOptions(saveFolder);

    saveFolder.addButton({ title: 'Compare to Baseline' }).on('click', () => {
      this.compareToBaseline();
    });

    // Export/Import section
    const ioFolder = this.folder.addFolder({ title: 'Import/Export', expanded: false });

    ioFolder.addButton({ title: 'Export Results' }).on('click', () => {
      this.storage.downloadAsFile();
    });

    ioFolder.addButton({ title: 'Import Results' }).on('click', () => {
      this.importResults();
    });

    ioFolder.addButton({ title: 'Clear All Results' }).on('click', () => {
      if (confirm('Delete all saved benchmark results?')) {
        this.storage.clear();
        this.updateBaselineOptions(saveFolder);
      }
    });

    return this.folder;
  }

  private updateBaselineOptions(folder: FolderApi): void {
    // Remove existing baseline binding if present
    const children = folder.children;
    for (const child of children) {
      if ('label' in child && (child as { label?: string }).label === 'Baseline') {
        child.dispose();
        break;
      }
    }

    // Build options from saved results
    const results = this.storage.getAll();
    const options: Record<string, string> = { '(none)': '' };

    for (const result of results) {
      const label = result.userLabel || result.id.slice(0, 8);
      const date = new Date(result.timestamp).toLocaleDateString();
      options[`${label} (${date})`] = result.id;
    }

    folder.addBinding(this.state, 'baseline', {
      label: 'Baseline',
      options,
    });
  }

  private runBenchmark(): void {
    const scenario = SCENARIOS[this.state.scenario];
    if (!scenario) {
      console.error('Invalid scenario:', this.state.scenario);
      return;
    }

    this.state.status = 'Starting...';
    this.state.progress = 0;

    this.runner.start(scenario, this.world, {
      onProgress: (progress: BenchmarkProgress) => {
        this.state.progress = progress.progress;
        if (progress.state === 'warmup') {
          this.state.status = 'Warming up...';
        } else if (progress.currentParticles !== undefined && progress.currentFps !== undefined) {
          // Ramp test - show particles and FPS
          this.state.status = `${progress.currentParticles.toLocaleString()} particles @ ${progress.currentFps.toFixed(0)}fps`;
        } else {
          this.state.status = `Running (${progress.elapsedTime.toFixed(1)}s / ${progress.totalTime.toFixed(1)}s)`;
        }
        this.pane?.refresh();
      },
      onComplete: (result: BenchmarkResult) => {
        this.lastResult = result;
        this.state.status = 'Complete';
        this.state.progress = 100;
        this.state.lastFps = result.stats.avgFps.toFixed(1);
        this.state.lastP95 = result.stats.p95FrameTime.toFixed(2) + 'ms';
        this.state.lastDropRate = result.stats.frameDropRate.toFixed(1) + '%';
        this.state.lastBreakPoint = result.stats.breakPointParticles
          ? result.stats.breakPointParticles.toLocaleString() + ' particles'
          : '-';
        this.pane?.refresh();
      },
    });
  }

  private saveResult(): void {
    if (!this.lastResult) {
      alert('No benchmark result to save. Run a benchmark first.');
      return;
    }

    const label = this.state.label.trim();
    if (label) {
      this.lastResult.userLabel = label;
    }

    this.storage.save(this.lastResult);

    // Refresh baseline dropdown
    const saveFolder = this.folder?.children.find(
      c => 'title' in c && (c as FolderApi).title === 'Save & Compare'
    ) as FolderApi | undefined;

    if (saveFolder) {
      this.updateBaselineOptions(saveFolder);
    }

    this.state.status = `Saved as "${label || this.lastResult.id.slice(0, 8)}"`;
    this.folder?.refresh();
  }

  private compareToBaseline(): void {
    if (!this.lastResult) {
      alert('No benchmark result to compare. Run a benchmark first.');
      return;
    }

    if (!this.state.baseline) {
      alert('Select a baseline to compare against.');
      return;
    }

    const baseline = this.storage.getById(this.state.baseline);
    if (!baseline) {
      alert('Baseline not found.');
      return;
    }

    const comparison = this.comparison.compare(baseline, this.lastResult);
    const formatted = this.comparison.formatComparison(comparison);

    // Display in console and alert
    console.log(formatted);
    alert(formatted);
  }

  private async importResults(): Promise<void> {
    try {
      const count = await this.storage.uploadFromFile();
      alert(`Imported ${count} benchmark result(s).`);

      // Refresh baseline dropdown
      const saveFolder = this.folder?.children.find(
        c => 'title' in c && (c as FolderApi).title === 'Save & Compare'
      ) as FolderApi | undefined;

      if (saveFolder) {
        this.updateBaselineOptions(saveFolder);
      }
    } catch (e) {
      alert('Failed to import: ' + (e as Error).message);
    }
  }
}
