import { Particle } from '../particle';
import { RenderSurfaceConfig } from './RenderSurface';

export interface ParticleRenderer {
  initialize(surface: RenderSurfaceConfig): void;
  setTime?(seconds: number): void;
  render(particles: Particle[], interpolationAlpha?: number): void;
  resize(surface: RenderSurfaceConfig): void;
  dispose(): void;
}
