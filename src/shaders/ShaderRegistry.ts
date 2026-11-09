import { definePlugin, PluginDefinition, validatePluginState } from '../plugins/metadata';
import { ShaderEffectPlugin, ShaderSnapshot } from './types';

export class ShaderRegistry {
  private plugins: Map<string, ShaderEffectPlugin> = new Map();

  private definitions = new Map<string, PluginDefinition>();

  describe(id: string): PluginDefinition {
    const definition = this.definitions.get(id);
    if (!definition) throw new Error(`Unknown plugin: ${id}`);
    return definition;
  }

  validate(snapshot: Record<string, unknown>): void {
    for (const [id, state] of Object.entries(snapshot))
      validatePluginState(this.describe(id), state);
  }

  register(plugin: ShaderEffectPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Shader effect "${plugin.id}" is already registered.`);
    }
    const definition = definePlugin(plugin.id, 'effect', plugin.getState());
    const setState = plugin.setState.bind(plugin);
    plugin.setState = (next) => {
      validatePluginState(definition, { ...plugin.getState(), ...next });
      setState(next);
    };
    this.definitions.set(plugin.id, definition);
    this.plugins.set(plugin.id, plugin);
  }

  get(id: string): ShaderEffectPlugin | undefined {
    return this.plugins.get(id);
  }

  list(): ShaderEffectPlugin[] {
    return Array.from(this.plugins.values());
  }

  snapshot(): ShaderSnapshot {
    const snapshot: ShaderSnapshot = {};
    for (const plugin of this.plugins.values()) {
      snapshot[plugin.id] = { ...plugin.getState() };
    }
    return snapshot;
  }

  restore(snapshot: ShaderSnapshot): void {
    this.validate(snapshot);
    for (const [id, state] of Object.entries(snapshot)) {
      const plugin = this.plugins.get(id);
      if (!plugin || typeof state !== 'object' || state === null) {
        continue;
      }
      plugin.setState(state as Record<string, unknown>);
      // A seed change resets runtime RNG fields; apply the exact snapshot afterward.
      plugin.setState(state as Record<string, unknown>);
    }
  }
}
