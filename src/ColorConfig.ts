import { parseOpaqueColor } from './colors';
import { RandomSource } from './random';

export type ColorConfig =
  { mode: 'solid'; color: string } | { mode: 'palette'; colors: string[] } | { mode: 'hue' };

export function validateColorConfig(value: unknown): asserts value is ColorConfig {
  if (!value || typeof value !== 'object') throw new Error('Invalid color configuration');
  const v = value as Record<string, unknown>;
  if (v.mode === 'hue') return;
  const colors = v.mode === 'solid' ? [v.color] : v.mode === 'palette' ? v.colors : null;
  if (!Array.isArray(colors) || !colors.length || colors.length > 64)
    throw new Error('Expected 1–64 colors');
  for (const color of colors) {
    if (typeof color !== 'string') throw new Error('Color must be a string');
    parseOpaqueColor(color);
  }
}

export function createColorGenerator(
  config: ColorConfig,
): string | ((random: RandomSource) => string) {
  validateColorConfig(config);
  if (config.mode === 'solid') return config.color;
  if (config.mode === 'hue') return (random) => `hsl(${random() * 360}, 100%, 50%)`;
  const colors = [...config.colors];
  return (random) => colors[Math.floor(random() * colors.length)];
}
