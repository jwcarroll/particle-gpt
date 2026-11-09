/** Imported only in Vite's test build; tree-shaken from the shipped application. */
import { SimulationController } from './SimulationController';
import { BenchmarkModule, SCENARIOS } from './benchmark';
import { RendererManager, RendererType } from './renderers/RendererManager';
import { captureScene, applyScene } from './Scene';

export function attachTesting(options: {
  controller: SimulationController;
  benchmark: BenchmarkModule;
  renderers: RendererManager;
  selectRenderer: (type: RendererType) => void;
  refreshScene: () => void;
  suspend: (value: boolean) => void;
}): void {
  const { controller: c, benchmark, renderers } = options;
  Object.assign(window, {
    laboratory: {
      profile: async () => {
        options.suspend(true);
        options.selectRenderer('Direct');
        const original = c.world.snapshotState();
        c.world.updateSettings({
          width: 1280,
          height: 720,
          maxParticleCount: 5000,
          minParticleLifeSpan: 5,
          maxParticleLifeSpan: 15,
        });
        options.refreshScene();
        const runs = [];
        let manifest = null;
        try {
          for (let run = 0; run < 5; run++) {
            benchmark.getRunner().start(SCENARIOS.stress, c.world);
            manifest = benchmark.getRunner().getManifest();
            const updates: number[] = [],
              renders: number[] = [],
              frames: number[] = [];
            let previous = 0;
            for (let frame = 0; frame < 300; frame++) {
              const now = await new Promise<number>((resolve) => requestAnimationFrame(resolve));
              const start = performance.now();
              c.world.update(1 / 60);
              const mid = performance.now();
              renderers.activeRenderer.render(c.world.activeParticles, 1);
              const end = performance.now();
              if (frame >= 120) {
                updates.push(mid - start);
                renders.push(end - mid);
                frames.push(now - previous);
              }
              previous = now;
            }
            const median = (values: number[]) =>
              [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
            runs.push({
              medianUpdateMs: median(updates),
              medianRenderMs: median(renders),
              p95FrameMs: [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.95)],
            });
            benchmark.getRunner().stop(c.world);
          }
          return { manifest, runs, userAgent: navigator.userAgent };
        } finally {
          benchmark.getRunner().stop(c.world);
          c.world.restoreState(original);
          options.refreshScene();
          options.suspend(false);
        }
      },
      pixels: (type: RendererType) => {
        options.selectRenderer(type);
        renderers.activeRenderer.setTime?.(0);
        renderers.activeRenderer.render(c.world.activeParticles, 1);
        const source = document.getElementById(
          renderers.active === 'WebGL' ? 'webgl-canvas' : 'canvas',
        ) as HTMLCanvasElement;
        const copy = document.createElement('canvas');
        copy.width = source.width;
        copy.height = source.height;
        const ctx = copy.getContext('2d')!;
        ctx.drawImage(source, 0, 0);
        return Array.from(ctx.getImageData(0, 0, copy.width, copy.height).data);
      },
      snapshot: () => ({
        scene: captureScene(c),
        particles: c.world.snapshotState().particles,
        clock: c.clock.getDiagnostics(),
        paused: c.paused,
        locked: c.locked,
        renderer: renderers.active,
        benchmark: benchmark.getRunner().getState(),
      }),
      freeze: () => {
        if (!c.paused) c.toggle();
        c.reset();
        options.refreshScene();
      },
      fixture: (count = 20) => {
        if (!c.paused) c.toggle();
        c.world.updateSettings({ width: 640, height: 480, maxParticleCount: count });
        c.fitToWindow = false;
        c.reset();
        options.refreshScene();
      },
      renderer: options.selectRenderer,
      scene: (value: unknown) => {
        applyScene(value, c);
        options.refreshScene();
      },
      benchmark: (duration = 0.15, ramp = false) => {
        const scenario = structuredClone(ramp ? SCENARIOS.ramp : SCENARIOS.standard);
        scenario.duration = duration;
        scenario.warmupDuration = 0;
        benchmark.getRunner().start(scenario, c.world);
      },
      history: () => benchmark.getStorage().getAll(),
      importHistory: (json: string) => benchmark.getStorage().importFromJson(json),
      cancel: () => benchmark.getRunner().stop(c.world),
    },
  });
}
