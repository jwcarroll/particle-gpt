import { BenchmarkResult } from './types';

const STORAGE_KEY = 'benchmark_results';

export class BenchmarkStorage {
  private results: BenchmarkResult[] = [];

  constructor() {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.results = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Failed to load benchmark results from localStorage:', e);
      this.results = [];
    }
  }

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.results));
    } catch (e) {
      console.warn('Failed to save benchmark results to localStorage:', e);
    }
  }

  save(result: BenchmarkResult): void {
    this.results.push(result);
    this.saveToLocalStorage();
  }

  getAll(): BenchmarkResult[] {
    return [...this.results];
  }

  getById(id: string): BenchmarkResult | undefined {
    return this.results.find((r) => r.id === id);
  }

  getByLabel(label: string): BenchmarkResult | undefined {
    return this.results.find((r) => r.userLabel === label);
  }

  delete(id: string): boolean {
    const index = this.results.findIndex((r) => r.id === id);
    if (index !== -1) {
      this.results.splice(index, 1);
      this.saveToLocalStorage();
      return true;
    }
    return false;
  }

  clear(): void {
    this.results = [];
    this.saveToLocalStorage();
  }

  exportToJson(): string {
    return JSON.stringify(this.results, null, 2);
  }

  importFromJson(json: string): number {
    try {
      const imported = JSON.parse(json) as BenchmarkResult[];
      if (!Array.isArray(imported)) {
        throw new Error('Invalid format: expected array');
      }

      // Validate and add each result
      let count = 0;
      for (const result of imported) {
        if (this.isValidResult(result)) {
          // Avoid duplicates by ID
          if (!this.results.find((r) => r.id === result.id)) {
            this.results.push(result);
            count++;
          }
        }
      }

      this.saveToLocalStorage();
      return count;
    } catch (e) {
      console.error('Failed to import benchmark results:', e);
      throw e;
    }
  }

  downloadAsFile(): void {
    const json = this.exportToJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-results-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  uploadFromFile(): Promise<number> {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';

      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          reject(new Error('No file selected'));
          return;
        }

        try {
          const text = await file.text();
          const count = this.importFromJson(text);
          resolve(count);
        } catch (err) {
          reject(err);
        }
      };

      input.click();
    });
  }

  private isValidResult(result: unknown): result is BenchmarkResult {
    if (!result || typeof result !== 'object') return false;
    const r = result as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      typeof r.timestamp === 'string' &&
      typeof r.scenario === 'object' &&
      typeof r.stats === 'object' &&
      typeof r.environment === 'object'
    );
  }
}
