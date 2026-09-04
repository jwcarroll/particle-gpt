export type RandomSource = () => number;

const UINT32_RANGE = 4_294_967_296;

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) {
    throw new RangeError('Random seed must be a finite number.');
  }

  const normalized = Math.floor(Math.abs(seed)) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

export function createSeededRandom(seed: number): RandomSource {
  let state = normalizeSeed(seed);

  return () => {
    state = (Math.imul(1_664_525, state) + 1_013_904_223) >>> 0;
    return state / UINT32_RANGE;
  };
}
