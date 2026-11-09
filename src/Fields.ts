export interface Field {
  id: string;
  kind: 'attractor' | 'repulsor' | 'vortex' | 'emitter';
  x: number;
  y: number;
  strength: number;
  falloff: 'none' | 'inverseDistance' | 'inverseSquare';
  rate: number;
  direction: number;
  spread: number;
}

export function validateFields(value: unknown): asserts value is Field[] {
  if (!Array.isArray(value) || value.length > 64) throw new Error('Expected at most 64 fields');
  const ids = new Set<string>();
  for (const f of value) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string' || !f.id || ids.has(f.id))
      throw new Error('Invalid or duplicate field ID');
    ids.add(f.id);
    if (!['attractor', 'repulsor', 'vortex', 'emitter'].includes(f.kind))
      throw new Error('Unknown field tool');
    if (!['none', 'inverseDistance', 'inverseSquare'].includes(f.falloff))
      throw new Error('Unknown falloff');
    for (const key of ['x', 'y', 'strength', 'rate', 'direction', 'spread']) {
      if (!Number.isFinite(f[key])) throw new Error('Field values must be finite');
    }
    if (
      f.x < 0 ||
      f.y < 0 ||
      f.x > 100000 ||
      f.y > 100000 ||
      Math.abs(f.strength) > 50 ||
      f.rate < 0 ||
      f.rate > 10000 ||
      f.direction < 0 ||
      f.direction > 360 ||
      f.spread < 0 ||
      f.spread > 360
    )
      throw new Error('Field value out of range');
  }
}

/** Pure sampling; never advances a plugin RNG or mutates particles. */
export function sampleFields(
  fields: readonly Field[],
  x: number,
  y: number,
  out: { x: number; y: number },
): void {
  out.x = 0;
  out.y = 0;
  for (const field of fields) {
    if (field.kind === 'emitter') continue;
    const dx = field.x - x,
      dy = field.y - y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1e-6) continue;
    const meters = Math.max(distance / 100, 0.001);
    const falloff =
      field.falloff === 'none'
        ? 1
        : field.falloff === 'inverseDistance'
          ? 1 / meters
          : 1 / (meters * meters);
    const strength =
      field.strength * 100 * Math.min(falloff, 10) * (field.kind === 'repulsor' ? -1 : 1);
    out.x += ((field.kind === 'vortex' ? -dy : dx) / distance) * strength;
    out.y += ((field.kind === 'vortex' ? dx : dy) / distance) * strength;
  }
}
