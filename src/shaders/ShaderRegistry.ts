import { ShaderEffectPlugin, ShaderSnapshot } from './types';

export class ShaderRegistry {
  private plugins: Map<string, ShaderEffectPlugin> = new Map();

  register(plugin: ShaderEffectPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Shader effect "${plugin.id}" is already registered.`);
    }
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
    for (const [id, state] of Object.entries(snapshot)) {
      const plugin = this.plugins.get(id);
      if (!plugin || typeof state !== 'object' || state === null) {
        continue;
      }
      plugin.setState(state as Record<string, unknown>);
    }
  }
}
