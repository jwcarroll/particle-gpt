import { RgbColor } from '../colors';
import { RenderSurfaceConfig } from './RenderSurface';

export interface RendererParityParticleFixture {
  previousX: number;
  previousY: number;
  x: number;
  y: number;
  radius: number;
  color: RgbColor;
  timeAlive: number;
  maxLifeSpan: number | null;
  expectedX: number;
  expectedY: number;
  expectedOpacity: number;
}

export interface RendererParityFixture {
  surface: RenderSurfaceConfig;
  interpolationAlpha: number;
  particles: readonly RendererParityParticleFixture[];
}

/**
 * Shared pre-rasterization expectations. Browser screenshot comparisons can
 * reuse this fixture without depending on random particle generation.
 */
export const BASE_RENDERER_PARITY_FIXTURE: RendererParityFixture = {
  surface: {
    logicalWidth: 320,
    logicalHeight: 180,
    devicePixelRatio: 2,
    backgroundColor: '#242424',
  },
  interpolationAlpha: 0.25,
  particles: [
    {
      previousX: 10,
      previousY: 20,
      x: 20,
      y: 40,
      radius: 8,
      color: [0, 170 / 255, 1],
      timeAlive: 2.5,
      maxLifeSpan: 10,
      expectedX: 12.5,
      expectedY: 25,
      expectedOpacity: 0.75,
    },
    {
      previousX: 250,
      previousY: 120,
      x: 230,
      y: 80,
      radius: 12,
      color: [1, 128 / 255, 64 / 255],
      timeAlive: 42,
      maxLifeSpan: null,
      expectedX: 245,
      expectedY: 110,
      expectedOpacity: 1,
    },
  ],
};
