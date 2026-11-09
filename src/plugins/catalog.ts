import { ForceRegistry, GravityForcePlugin, WindForcePlugin, RadialForcePlugin } from '../forces';
import {
  ShaderRegistry,
  AgeAlphaEffectPlugin,
  ColorShiftEffectPlugin,
  GlowEffectPlugin,
  OutlineEffectPlugin,
  HeatShimmerEffectPlugin,
  VelocityTintEffectPlugin,
} from '../shaders';

export function createCatalog() {
  const forces = new ForceRegistry();
  for (const plugin of [
    new GravityForcePlugin({ pixelsPerMeter: 100 }),
    new WindForcePlugin({ pixelsPerMeter: 100 }),
    new RadialForcePlugin({ pixelsPerMeter: 100 }),
  ])
    forces.register(plugin);
  const effects = new ShaderRegistry();
  for (const plugin of [
    new AgeAlphaEffectPlugin(),
    new ColorShiftEffectPlugin(),
    new GlowEffectPlugin(),
    new OutlineEffectPlugin(),
    new HeatShimmerEffectPlugin(),
    new VelocityTintEffectPlugin(),
  ])
    effects.register(plugin);
  return { forces, effects };
}
