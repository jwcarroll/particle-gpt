import { definePlugin, PluginDefinition, validatePluginState } from '../plugins/metadata';
import { ForceContext, ForcePlugin, ForceSnapshot, ForceVector } from './types';

export class ForceRegistry {
  private plugins: Map<string, ForcePlugin> = new Map();

  private uniformPlugins: ForcePlugin[] = [];
  private particlePlugins: ForcePlugin[] = [];
  private uniformVector = { x: 0, y: 0 };
  private particleVector = { x: 0, y: 0 };

  private compile(): void {
    this.uniformPlugins = [];
    this.particlePlugins = [];
    for (const plugin of this.plugins.values()) {
      const state = plugin.getState() as { enabled: boolean; evaluationMode?: string };
      if (!state.enabled) continue;
      if (state.evaluationMode === 'perParticle') this.particlePlugins.push(plugin);
      else this.uniformPlugins.push(plugin);
    }
  }

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

  register(plugin: ForcePlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Force plugin "${plugin.id}" is already registered.`);
    }
    const definition = definePlugin(plugin.id, 'force', plugin.getState());
    const setState = plugin.setState.bind(plugin);
    plugin.setState = (next) => {
      validatePluginState(definition, { ...plugin.getState(), ...next });
      setState(next);
      this.compile();
    };
    const reset = plugin.reset.bind(plugin);
    plugin.reset = () => {
      reset();
      this.compile();
    };
    this.definitions.set(plugin.id, definition);
    this.plugins.set(plugin.id, plugin);
    this.compile();
  }

  get(id: string): ForcePlugin | undefined {
    return this.plugins.get(id);
  }

  list(): ForcePlugin[] {
    return Array.from(this.plugins.values());
  }

  getNetForce(context: ForceContext): ForceVector {
    let x = 0;
    let y = 0;

    for (const plugin of this.uniformPlugins) {
      const vector = plugin.getVector(context);
      x += vector.x;
      y += vector.y;
    }

    this.uniformVector.x = x;
    this.uniformVector.y = y;
    return this.uniformVector;
  }

  getParticleForce(context: ForceContext, particle: { x: number; y: number }): ForceVector {
    let x = 0,
      y = 0;
    for (const plugin of this.particlePlugins) {
      if (!plugin.getParticleVector) continue;
      const vector = plugin.getParticleVector(context, particle);
      x += vector.x;
      y += vector.y;
    }
    this.particleVector.x = x;
    this.particleVector.y = y;
    return this.particleVector;
  }

  snapshot(): ForceSnapshot {
    const snapshot: ForceSnapshot = {};
    for (const plugin of this.plugins.values()) {
      snapshot[plugin.id] = { ...plugin.getState() };
    }
    return snapshot;
  }

  restore(snapshot: ForceSnapshot): void {
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
