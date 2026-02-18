import { ForceContext, ForcePlugin, ForceSnapshot, ForceVector } from './types';

export class ForceRegistry {
  private plugins: Map<string, ForcePlugin> = new Map();

  register(plugin: ForcePlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`Force plugin "${plugin.id}" is already registered.`);
    }
    this.plugins.set(plugin.id, plugin);
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

    for (const plugin of this.plugins.values()) {
      if (!plugin.getState().enabled) {
        continue;
      }
      const vector = plugin.getVector(context);
      x += vector.x;
      y += vector.y;
    }

    return { x, y };
  }

  snapshot(): ForceSnapshot {
    const snapshot: ForceSnapshot = {};
    for (const plugin of this.plugins.values()) {
      snapshot[plugin.id] = { ...plugin.getState() };
    }
    return snapshot;
  }

  restore(snapshot: ForceSnapshot): void {
    for (const [id, state] of Object.entries(snapshot)) {
      const plugin = this.plugins.get(id);
      if (!plugin || typeof state !== 'object' || state === null) {
        continue;
      }
      plugin.setState(state as Record<string, unknown>);
    }
  }
}
