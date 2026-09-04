import assert from 'node:assert/strict';
import test from 'node:test';
import { getBackingHeight, getBackingWidth } from '../src/renderers/RenderSurface';
import { getParticleOpacity } from '../src/renderers/ParticleOpacity';
import { BASE_RENDERER_PARITY_FIXTURE } from '../src/renderers/RendererParityFixtures';

test('base renderer parity fixture defines shared surface and particle expectations', () => {
  const fixture = BASE_RENDERER_PARITY_FIXTURE;

  assert.equal(getBackingWidth(fixture.surface), 640);
  assert.equal(getBackingHeight(fixture.surface), 360);
  assert.equal(fixture.surface.backgroundColor, '#242424');

  for (const particle of fixture.particles) {
    const x = particle.previousX + (particle.x - particle.previousX) * fixture.interpolationAlpha;
    const y = particle.previousY + (particle.y - particle.previousY) * fixture.interpolationAlpha;
    assert.equal(x, particle.expectedX);
    assert.equal(y, particle.expectedY);
    assert.equal(
      getParticleOpacity(particle.timeAlive, particle.maxLifeSpan),
      particle.expectedOpacity,
    );
  }
});

test('lifetime opacity is clamped for renderer parity', () => {
  assert.equal(getParticleOpacity(0, 10), 1);
  assert.equal(getParticleOpacity(2.5, 10), 0.75);
  assert.equal(getParticleOpacity(10, 10), 0);
  assert.equal(getParticleOpacity(12, 10), 0);
  assert.equal(getParticleOpacity(12, null), 1);
});
