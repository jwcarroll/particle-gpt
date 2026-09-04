import {
  BENCHMARK_MANIFEST_VERSION,
  BenchmarkResult,
  BenchmarkRunManifest,
  BenchmarkScenario,
} from './types';

const COMPATIBILITY_EXCLUDED_PATHS = new Set(['build.appVersion', 'build.revision', 'quality']);

export class BenchmarkManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BenchmarkManifestValidationError';
  }
}

export class BenchmarkCompatibilityError extends Error {
  constructor(readonly differingFields: string[]) {
    super(`Benchmark workloads differ: ${differingFields.join(', ')}`);
    this.name = 'BenchmarkCompatibilityError';
  }
}

export function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function fingerprintManifest(
  manifest: Omit<BenchmarkRunManifest, 'compatibilityFingerprint'>,
): string {
  const canonical = compatibilityProjection(manifest);
  let hash = 0x811c9dc5;
  const serialized = stableSerialize(canonical);
  for (let index = 0; index < serialized.length; index++) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function withCompatibilityFingerprint(
  manifest: Omit<BenchmarkRunManifest, 'compatibilityFingerprint'>,
): BenchmarkRunManifest {
  return {
    ...manifest,
    compatibilityFingerprint: fingerprintManifest(manifest),
  };
}

export function getManifestDifferences(
  baseline: BenchmarkRunManifest,
  current: BenchmarkRunManifest,
): string[] {
  const differences: string[] = [];
  findDifferences(
    compatibilityProjection(baseline),
    compatibilityProjection(current),
    '',
    differences,
  );
  return differences;
}

export function ensureComparable(baseline: BenchmarkResult, current: BenchmarkResult): void {
  const differences = getManifestDifferences(baseline.manifest, current.manifest);
  if (differences.length > 0) {
    throw new BenchmarkCompatibilityError(differences);
  }
}

export function validateBenchmarkResult(value: unknown): asserts value is BenchmarkResult {
  const result = expectRecord(value, 'result');
  expectString(result.id, 'id');
  expectString(result.timestamp, 'timestamp');
  if (result.userLabel !== undefined) expectString(result.userLabel, 'userLabel');
  validateScenario(result.scenario);
  validateStats(result.stats);
  validateEnvironment(result.environment);
  validateManifest(result.manifest);
}

function compatibilityProjection(
  manifest: Omit<BenchmarkRunManifest, 'compatibilityFingerprint'> | BenchmarkRunManifest,
): unknown {
  return removeExcludedFields(manifest, '');
}

function removeExcludedFields(value: unknown, path: string): unknown {
  if (Array.isArray(value)) {
    return value.map((entry, index) => removeExcludedFields(entry, `${path}[${index}]`));
  }
  if (!value || typeof value !== 'object') return value;

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'compatibilityFingerprint') continue;
    const entryPath = path ? `${path}.${key}` : key;
    if (COMPATIBILITY_EXCLUDED_PATHS.has(entryPath)) continue;
    output[key] = removeExcludedFields(entry, entryPath);
  }
  return output;
}

function findDifferences(
  baseline: unknown,
  current: unknown,
  path: string,
  differences: string[],
): void {
  if (stableSerialize(baseline) === stableSerialize(current)) return;
  if (!isRecord(baseline) || !isRecord(current)) {
    differences.push(path || 'workload');
    return;
  }

  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const key of [...keys].sort()) {
    const nextPath = path ? `${path}.${key}` : key;
    if (!(key in baseline) || !(key in current)) {
      differences.push(nextPath);
      continue;
    }
    findDifferences(baseline[key], current[key], nextPath, differences);
  }
}

function validateManifest(value: unknown): void {
  const manifest = expectRecord(value, 'manifest');
  if (manifest.schemaVersion !== BENCHMARK_MANIFEST_VERSION) {
    throw new BenchmarkManifestValidationError(
      `Unsupported benchmark manifest schema version: ${String(manifest.schemaVersion)}`,
    );
  }
  validateScenario(manifest.scenario);
  validateStringRecord(manifest.renderer, 'manifest.renderer');
  const surface = expectRecord(manifest.surface, 'manifest.surface');
  for (const key of [
    'logicalWidth',
    'logicalHeight',
    'backingWidth',
    'backingHeight',
    'devicePixelRatio',
  ]) {
    expectFiniteNumber(surface[key], `manifest.surface.${key}`);
  }
  expectString(surface.backgroundColor, 'manifest.surface.backgroundColor');
  validateNumberRecord(manifest.clock, 'manifest.clock');
  expectFiniteNumber(manifest.pixelsPerMeter, 'manifest.pixelsPerMeter');
  validateWorld(manifest.world);
  validatePluginRecord(manifest.forces, 'manifest.forces');
  validatePluginRecord(manifest.effects, 'manifest.effects');
  validateNumberRecord(manifest.thresholds, 'manifest.thresholds');
  validateNumberRecord(manifest.quality, 'manifest.quality');
  validateStringRecord(manifest.build, 'manifest.build');
  expectString(manifest.compatibilityFingerprint, 'manifest.compatibilityFingerprint');

  const withoutFingerprint = { ...manifest } as Omit<
    BenchmarkRunManifest,
    'compatibilityFingerprint'
  >;
  delete (withoutFingerprint as Partial<BenchmarkRunManifest>).compatibilityFingerprint;
  const expectedFingerprint = fingerprintManifest(withoutFingerprint);
  if (manifest.compatibilityFingerprint !== expectedFingerprint) {
    throw new BenchmarkManifestValidationError(
      'manifest compatibility fingerprint does not match its fields',
    );
  }
}

function validateScenario(value: unknown): asserts value is BenchmarkScenario {
  const scenario = expectRecord(value, 'scenario');
  expectString(scenario.id, 'scenario.id');
  expectFiniteNumber(scenario.version, 'scenario.version');
  expectString(scenario.name, 'scenario.name');
  expectString(scenario.description, 'scenario.description');
  expectFiniteNumber(scenario.duration, 'scenario.duration');
  expectFiniteNumber(scenario.warmupDuration, 'scenario.warmupDuration');
  const settings = expectRecord(scenario.settings, 'scenario.settings');
  for (const key of ['maxParticleCount', 'seed']) {
    expectFiniteNumber(settings[key], `scenario.settings.${key}`);
  }
  if (typeof settings.enableParticleCollision !== 'boolean') {
    throw new BenchmarkManifestValidationError(
      'scenario.settings.enableParticleCollision must be boolean',
    );
  }
  for (const key of ['rampStartCount', 'rampEndCount']) {
    if (settings[key] !== undefined) expectFiniteNumber(settings[key], `scenario.settings.${key}`);
  }
  for (const key of ['forcePresetId', 'shaderPresetId']) {
    if (settings[key] !== undefined) expectString(settings[key], `scenario.settings.${key}`);
  }
  for (const key of ['customForceState', 'customShaderState']) {
    if (settings[key] !== undefined) validateJsonValue(settings[key], `scenario.settings.${key}`);
  }
  if (settings.rampMode !== undefined && typeof settings.rampMode !== 'boolean') {
    throw new BenchmarkManifestValidationError('scenario.settings.rampMode must be boolean');
  }
}

function validateStats(value: unknown): void {
  const stats = expectRecord(value, 'stats');
  for (const key of [
    'avgFps',
    'minFps',
    'maxFps',
    'avgFrameTime',
    'p95FrameTime',
    'avgUpdateTime',
    'avgRenderTime',
    'framesDropped',
    'frameDropRate',
    'totalFrames',
  ]) {
    expectFiniteNumber(stats[key], `stats.${key}`);
  }
  if (stats.breakPointParticles !== undefined) {
    expectFiniteNumber(stats.breakPointParticles, 'stats.breakPointParticles');
  }
}

function validateEnvironment(value: unknown): void {
  const environment = expectRecord(value, 'environment');
  for (const key of ['userAgent', 'timestamp'])
    expectString(environment[key], `environment.${key}`);
  for (const key of ['screenWidth', 'screenHeight', 'devicePixelRatio', 'hardwareConcurrency']) {
    expectFiniteNumber(environment[key], `environment.${key}`);
  }
}

function validateWorld(value: unknown): void {
  const world = expectRecord(value, 'manifest.world');
  for (const key of [
    'initialParticleCount',
    'maxParticleCount',
    'emissionRate',
    'elasticity',
    'seed',
  ]) {
    expectFiniteNumber(world[key], `manifest.world.${key}`);
  }
  if (typeof world.enableParticleCollision !== 'boolean') {
    throw new BenchmarkManifestValidationError(
      'manifest.world.enableParticleCollision must be boolean',
    );
  }
  expectString(world.fillStyle, 'manifest.world.fillStyle');
  for (const key of ['particleRadius', 'particleVelocity', 'particleLifeSpan', 'startingAngle']) {
    validateNumberRecord(world[key], `manifest.world.${key}`);
  }
}

function validatePluginRecord(value: unknown, name: string): void {
  const record = expectRecord(value, name);
  for (const [id, plugin] of Object.entries(record)) {
    const pluginRecord = expectRecord(plugin, `${name}.${id}`);
    expectFiniteNumber(pluginRecord.schemaVersion, `${name}.${id}.schemaVersion`);
    expectRecord(pluginRecord.state, `${name}.${id}.state`);
    validateJsonValue(pluginRecord.state, `${name}.${id}.state`);
  }
}

function validateNumberRecord(value: unknown, name: string): void {
  const record = expectRecord(value, name);
  for (const [key, entry] of Object.entries(record)) expectFiniteNumber(entry, `${name}.${key}`);
}

function validateStringRecord(value: unknown, name: string): void {
  const record = expectRecord(value, name);
  for (const [key, entry] of Object.entries(record)) expectString(entry, `${name}.${key}`);
}

function expectRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new BenchmarkManifestValidationError(`${name} must be an object`);
  return value;
}

function expectString(value: unknown, name: string): void {
  if (typeof value !== 'string')
    throw new BenchmarkManifestValidationError(`${name} must be a string`);
}

function expectFiniteNumber(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BenchmarkManifestValidationError(`${name} must be a finite number`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateJsonValue(value: unknown, name: string): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    expectFiniteNumber(value, name);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateJsonValue(entry, `${name}[${index}]`));
    return;
  }
  const record = expectRecord(value, name);
  for (const [key, entry] of Object.entries(record)) {
    validateJsonValue(entry, `${name}.${key}`);
  }
}
