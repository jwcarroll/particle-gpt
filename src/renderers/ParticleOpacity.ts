export function getParticleOpacity(timeAlive: number, maxLifeSpan: number | null): number {
  if (maxLifeSpan === null) return 1;
  return Math.max(0, Math.min(1, 1 - timeAlive / maxLifeSpan));
}
