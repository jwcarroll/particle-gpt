import { SimulationClock } from './SimulationClock';
import { World } from './simulator';
import { ForceRegistry } from './forces';
import { ShaderRegistry } from './shaders';
import { configurationState } from './plugins/metadata';

export class SimulationController {
  readonly clock = new SimulationClock();
  paused = false;
  locked = false;
  seed = 1337;
  background = '#111820';
  trails = false;
  arrows = false;
  fitToWindow = true;
  constructor(
    readonly world: World,
    readonly forces: ForceRegistry,
    readonly effects: ShaderRegistry,
  ) {}

  change(action: () => void): void {
    if (this.locked) throw new Error('Cancel the benchmark before editing the scene');
    action();
  }
  toggle(): void {
    this.change(() => {
      this.paused = !this.paused;
      if (this.paused) this.clock.pause();
      else this.clock.resume();
    });
  }
  step(): void {
    this.change(() => {
      if (!this.paused) {
        this.paused = true;
        this.clock.pause();
      }
      this.clock.step((dt) => this.world.update(dt));
    });
  }
  reset(): void {
    this.change(() => {
      for (const registry of [this.forces, this.effects]) {
        for (const plugin of registry.list()) {
          const config = configurationState(plugin.getState());
          plugin.reset();
          plugin.setState(config);
        }
      }
      this.world.resetPopulation(this.world.getSettings().maxParticleCount, { seed: this.seed });
      this.clock.reset();
      if (this.paused) this.clock.pause();
    });
  }
  benchmarkLifecycle() {
    let saved: {
      clock: ReturnType<SimulationClock['snapshot']>;
      paused: boolean;
      trails: boolean;
      arrows: boolean;
    } | null = null;
    return {
      begin: () => {
        saved = {
          clock: this.clock.snapshot(),
          paused: this.paused,
          trails: this.trails,
          arrows: this.arrows,
        };
        this.locked = true;
        this.paused = false;
        this.trails = false;
        this.arrows = false;
        this.clock.reset();
      },
      end: () => {
        if (!saved) return;
        this.clock.restore(saved.clock);
        this.paused = saved.paused;
        this.trails = saved.trails;
        this.arrows = saved.arrows;
        this.locked = false;
        saved = null;
      },
    };
  }
}
