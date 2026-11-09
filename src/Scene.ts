import { SimulationController } from './SimulationController';
import { WorldSettings, validateWorldSettings } from './simulator';
import { ColorConfig, validateColorConfig } from './ColorConfig';
import { Field, validateFields } from './Fields';
import { parseOpaqueColor } from './colors';
import { configurationState, validatePluginState } from './plugins/metadata';

export interface Scene {
  version: 1;
  seed: number;
  world: Omit<WorldSettings, 'fillStyle'>;
  colors: ColorConfig;
  plugins: Record<
    string,
    { kind: 'force' | 'effect'; schemaVersion: number; state: Record<string, unknown> }
  >;
  fields: Field[];
  presentation: { background: string; trails: boolean; arrows: boolean };
}

export function captureScene(controller: SimulationController): Scene {
  const settings = controller.world.getSettings();
  const world = Object.fromEntries(
    Object.entries(settings).filter(([key]) => key !== 'fillStyle'),
  ) as Scene['world'];
  const colors = controller.world.getColors();
  if (!colors) throw new Error('Custom color functions cannot be shared');
  const plugins: Scene['plugins'] = {};
  for (const registry of [controller.forces, controller.effects]) {
    for (const plugin of registry.list()) {
      const definition = registry.describe(plugin.id);
      plugins[plugin.id] = {
        kind: definition.kind,
        schemaVersion: definition.schemaVersion,
        state: configurationState(plugin.getState()),
      };
    }
  }
  return {
    version: 1,
    seed: controller.seed,
    world,
    colors,
    plugins,
    fields: controller.world.getFields(),
    presentation: {
      background: controller.background,
      trails: controller.trails,
      arrows: controller.arrows,
    },
  };
}

export function validateScene(value: unknown, controller: SimulationController): Scene {
  if (!value || typeof value !== 'object') throw new Error('Expected scene');
  const scene = structuredClone(value) as Scene;
  if (
    scene.version !== 1 ||
    !Number.isInteger(scene.seed) ||
    scene.seed < 1 ||
    scene.seed > 2147483647
  )
    throw new Error('Unsupported scene version or seed');
  if (!scene.world || typeof scene.world !== 'object') throw new Error('Missing world settings');
  const expected = Object.keys(controller.world.getSettings()).filter((key) => key !== 'fillStyle');
  if (
    Object.keys(scene.world).length !== expected.length ||
    expected.some((key) => !(key in scene.world))
  )
    throw new Error('Incomplete world configuration');
  validateWorldSettings({ ...scene.world, fillStyle: '#000000' });
  if (scene.world.width < 1 || scene.world.height < 1)
    throw new Error('Scene dimensions must be positive');
  validateColorConfig(scene.colors);
  validateFields(scene.fields);
  if (
    !scene.presentation ||
    typeof scene.presentation.background !== 'string' ||
    typeof scene.presentation.trails !== 'boolean' ||
    typeof scene.presentation.arrows !== 'boolean'
  )
    throw new Error('Invalid presentation');
  parseOpaqueColor(scene.presentation.background);
  if (!scene.plugins || typeof scene.plugins !== 'object' || Array.isArray(scene.plugins))
    throw new Error('Invalid plugins');
  const registries = [controller.forces, controller.effects];
  const ids = registries.flatMap((r) => r.list().map((p) => p.id));
  if (Object.keys(scene.plugins).length !== ids.length || ids.some((id) => !(id in scene.plugins)))
    throw new Error('Incomplete plugin configuration');
  for (const [id, entry] of Object.entries(scene.plugins)) {
    const registry = registries.find((r) => r.get(id));
    if (!registry || !entry || typeof entry !== 'object') throw new Error('Unknown plugin');
    const def = registry.describe(id);
    if (entry.kind !== def.kind) throw new Error('Wrong plugin kind');
    if (id === 'radial' && entry.schemaVersion === 1) {
      entry.state = { ...entry.state, evaluationMode: 'uniform' };
      entry.schemaVersion = 2;
    }
    if (entry.schemaVersion !== def.schemaVersion) throw new Error('Unsupported plugin version');
    const configDefaults = configurationState(def.defaults);
    if (
      !entry.state ||
      Object.keys(entry.state).some((key) => !(key in configDefaults)) ||
      Object.keys(configDefaults).some((key) => !(key in entry.state))
    )
      throw new Error('Invalid plugin configuration fields');
    validatePluginState(def, { ...def.defaults, ...entry.state });
  }
  return scene;
}

export function applyScene(value: unknown, controller: SimulationController): void {
  const scene = validateScene(value, controller);
  controller.change(() => {
    controller.world.updateSettings(scene.world);
    controller.world.setColors(scene.colors);
    controller.world.setFields(scene.fields);
    for (const registry of [controller.forces, controller.effects]) {
      for (const plugin of registry.list()) {
        plugin.reset();
        plugin.setState(scene.plugins[plugin.id].state);
      }
    }
    controller.seed = scene.seed;
    controller.background = scene.presentation.background;
    controller.trails = scene.presentation.trails;
    controller.arrows = scene.presentation.arrows;
    controller.fitToWindow = false;
    controller.reset();
  });
}

export function sceneFragment(scene: Scene): string {
  const fragment = '#scene=' + encodeURIComponent(JSON.stringify(scene));
  if (fragment.length > 16384)
    throw new Error('Scene exceeds the 16 KiB link limit. Export JSON instead.');
  return fragment;
}

export function parseSceneFragment(hash: string): unknown {
  if (!hash.startsWith('#scene=') || hash.length > 16384) throw new Error('Invalid scene link');
  return JSON.parse(decodeURIComponent(hash.slice(7)));
}

export function makePreset(name: string, base: Scene): Scene {
  const scene = structuredClone(base);
  scene.seed = 1337;
  scene.fields = [];
  if (name === 'Low Gravity') scene.plugins.gravity.state.strengthMps2 = 3.2;
  if (name === 'Attractor' || name === 'Vortex') {
    scene.plugins.gravity.state.enabled = false;
    scene.fields = [
      {
        id: 'preset-field',
        kind: name === 'Attractor' ? 'attractor' : 'vortex',
        x: scene.world.width / 2,
        y: scene.world.height / 2,
        strength: 8,
        falloff: 'inverseDistance',
        rate: 120,
        direction: 270,
        spread: 30,
      },
    ];
  }
  return scene;
}
