import { BenchmarkResult } from './types';
import { validateBenchmarkResult } from './BenchmarkManifest';

const STORAGE_KEY = 'benchmark_results';

export interface BenchmarkStorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class BenchmarkStorage {
  private results: BenchmarkResult[] = [];

  constructor(private readonly backend: BenchmarkStorageBackend | null = browserStorage()) {
    this.loadFromLocalStorage();
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = this.backend?.getItem(STORAGE_KEY);
      if (stored) {
        const imported = JSON.parse(stored);
        if (!Array.isArray(imported)) {
          throw new Error('expected an array');
        }
        this.results = imported.filter((result) => this.isValidResult(result));
      }
    } catch (e) {
      console.warn('Failed to load benchmark results from localStorage:', e);
      this.results = [];
    }
  }

  private saveToLocalStorage(): void {
    try {
      this.backend?.setItem(STORAGE_KEY, JSON.stringify(this.results));
    } catch (e) {
      console.warn('Failed to save benchmark results to localStorage:', e);
    }
  }

  save(result: BenchmarkResult): void {
    validateBenchmarkResult(result);
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
    const imported = JSON.parse(json) as unknown;
    if (!Array.isArray(imported)) {
      throw new Error('Invalid format: expected array');
    }

    // Validate every entry before mutating saved results.
    const validResults: BenchmarkResult[] = [];
    for (const result of imported) {
      validateBenchmarkResult(result);
      validResults.push(result);
    }

    let count = 0;
    for (const result of validResults) {
      // Avoid duplicates by ID
      if (!this.results.find((r) => r.id === result.id)) {
        this.results.push(result);
        count++;
      }
    }

    this.saveToLocalStorage();
    return count;
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
    try {
      validateBenchmarkResult(result);
      return true;
    } catch {
      return false;
    }
  }
}

function browserStorage(): BenchmarkStorageBackend | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}
