import { Particle } from "../particle";

export interface ParticleRenderer {
    initialize(width: number, height: number): void;
    render(particles: Particle[]): void;
    resize(width: number, height: number): void;
    dispose(): void;
}