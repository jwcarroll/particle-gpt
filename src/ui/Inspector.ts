import { Pane, FolderApi } from 'tweakpane';
import { SimulationController } from '../SimulationController';
import { BenchmarkModule } from '../benchmark';
import { RendererManager, RendererType } from '../renderers/RendererManager';
import { WorldSettings } from '../simulator';
import { Field } from '../Fields';

export class Inspector {
  readonly pane: Pane;
  private refreshers: (() => void)[] = [];
  private editable: FolderApi[] = [];
  private fieldFolder: FolderApi;
  private selected: string | null = null;
  private fieldOptionsKey = '';
  constructor(
    container: HTMLElement,
    private controller: SimulationController,
    benchmark: BenchmarkModule,
    renderers: RendererManager,
    selectRenderer: (type: RendererType) => void,
    private changed: () => void,
    private report: (message: string) => void,
  ) {
    this.pane = new Pane({ container, title: 'Scene inspector' });
    const world = this.pane.addFolder({ title: 'Simulation', expanded: true });
    this.editable.push(world);
    const values = controller.world.getSettings();
    const keys: (keyof WorldSettings)[] = [
      'maxParticleCount',
      'emissionRate',
      'minParticleRadius',
      'maxParticleRadius',
      'minParticleVelocity',
      'maxParticleVelocity',
      'minParticleLifeSpan',
      'maxParticleLifeSpan',
      'minStartingAngle',
      'maxStartingAngle',
      'elasticity',
      'enableParticleCollision',
    ];
    const maxima: Partial<Record<keyof WorldSettings, number>> = {
      maxParticleCount: 50000,
      emissionRate: 10000,
      minParticleRadius: 100,
      maxParticleRadius: 100,
      minParticleVelocity: 1000,
      maxParticleVelocity: 1000,
      minParticleLifeSpan: 100,
      maxParticleLifeSpan: 100,
      minStartingAngle: 360,
      maxStartingAngle: 360,
      elasticity: 1,
    };
    for (const key of keys) {
      const numeric = typeof values[key] === 'number';
      world
        .addBinding(values, key, {
          label: key.replace(/Particle/g, '').replace(/([A-Z])/g, ' $1'),
          ...(numeric
            ? {
                min: 0,
                max: maxima[key],
                step: key === 'elasticity' ? 0.01 : key.includes('LifeSpan') ? 0.1 : 1,
              }
            : {}),
        })
        .on('change', () =>
          this.run(() => controller.world.updateSettings({ [key]: values[key] })),
        );
    }
    this.refreshers.push(() => Object.assign(values, controller.world.getSettings()));
    const rendering = this.pane.addFolder({ title: 'Rendering', expanded: false });
    this.editable.push(rendering);
    const renderState = {
      renderer: renderers.active,
      background: controller.background,
      trails: false,
      arrows: false,
      palette: '#39a0ed, #6ec6ff, #9bdaf1',
      mode: 'palette',
    };
    rendering
      .addBinding(renderState, 'renderer', {
        options: { Canvas2D: 'DoubleBuffered', 'Canvas2D Direct': 'Direct', WebGL: 'WebGL' },
      })
      .on('change', (event) => this.run(() => selectRenderer(event.value)));
    rendering.addBinding(renderState, 'background', { view: 'color' }).on('change', () =>
      this.run(() => {
        controller.background = renderState.background;
        this.changed();
      }),
    );
    for (const key of ['trails', 'arrows'] as const)
      rendering.addBinding(renderState, key).on('change', () =>
        this.run(() => {
          controller[key] = renderState[key];
        }),
      );
    rendering
      .addBinding(renderState, 'mode', {
        label: 'Colors',
        options: { Palette: 'palette', Hue: 'hue', Solid: 'solid' },
      })
      .on('change', () => this.applyColors(renderState));
    rendering
      .addBinding(renderState, 'palette', { label: 'Hex colors' })
      .on('change', () => this.applyColors(renderState));
    this.refreshers.push(() => {
      renderState.renderer = renderers.active;
      renderState.background = controller.background;
      renderState.trails = controller.trails;
      renderState.arrows = controller.arrows;
      const colors = controller.world.getColors();
      if (colors) {
        renderState.mode = colors.mode;
        if (colors.mode === 'palette') renderState.palette = colors.colors.join(', ');
        if (colors.mode === 'solid') renderState.palette = colors.color;
      }
    });
    for (const registry of [controller.forces, controller.effects]) {
      const parent = this.pane.addFolder({
        title: registry === controller.forces ? 'Forces' : 'WebGL effects',
        expanded: false,
      });
      this.editable.push(parent);
      for (const plugin of registry.list()) {
        const folder = parent.addFolder({ title: plugin.label, expanded: false });
        const state = plugin.getState() as unknown as Record<string, any>;
        for (const control of registry.describe(plugin.id).controls) {
          const { key, ...params } = control;
          folder
            .addBinding(state, key, params)
            .on('change', () => this.run(() => plugin.setState({ [key]: state[key] })));
        }
        folder
          .addButton({ title: 'Reset ' + plugin.label })
          .on('click', () => this.run(() => plugin.reset()));
        this.refreshers.push(() => {
          Object.assign(state, plugin.getState());
          folder.disabled =
            controller.locked || (registry === controller.effects && renderers.active !== 'WebGL');
        });
      }
    }
    this.fieldFolder = this.pane.addFolder({ title: 'Selected field', expanded: true });
    this.editable.push(this.fieldFolder);
    benchmark.setupUI(this.pane);
    const fieldList = document.getElementById('field-list') as HTMLSelectElement;
    fieldList.onchange = () => this.selectField(fieldList.value || null);
    this.refresh();
  }
  private applyColors(state: { mode: string; palette: string }) {
    this.run(() => {
      const colors = state.palette
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean);
      this.controller.world.setColors(
        state.mode === 'hue'
          ? { mode: 'hue' }
          : state.mode === 'solid'
            ? { mode: 'solid', color: colors[0] }
            : { mode: 'palette', colors },
      );
    });
  }
  private run(action: () => void) {
    try {
      this.controller.change(action);
    } catch (error) {
      this.report(String(error));
    }
    this.refresh();
  }
  selectField(id: string | null): void {
    this.selected = id;
    const list = document.getElementById('field-list') as HTMLSelectElement;
    if (list) list.value = id ?? '';
    for (const child of [...this.fieldFolder.children]) child.dispose();
    const field = this.controller.world.getFields().find((f) => f.id === id);
    if (!field) return;
    const state = { ...field };
    for (const key of ['x', 'y', 'strength', 'rate', 'direction', 'spread'] as const) {
      if (field.kind !== 'emitter' && ['rate', 'direction', 'spread'].includes(key)) continue;
      if (field.kind === 'emitter' && key === 'strength') continue;
      this.fieldFolder
        .addBinding(state, key, {
          min: key === 'strength' ? -50 : 0,
          max:
            key === 'strength'
              ? 50
              : key === 'rate'
                ? 10000
                : ['direction', 'spread'].includes(key)
                  ? 360
                  : 100000,
        })
        .on('change', () =>
          this.run(() =>
            this.controller.world.setFields(
              this.controller.world
                .getFields()
                .map((f) => (f.id === id ? { ...f, [key]: state[key] } : f)),
            ),
          ),
        );
    }
    if (field.kind !== 'emitter')
      this.fieldFolder
        .addBinding(state, 'falloff', {
          options: {
            None: 'none',
            'Inverse distance': 'inverseDistance',
            'Inverse square': 'inverseSquare',
          },
        })
        .on('change', () =>
          this.run(() =>
            this.controller.world.setFields(
              this.controller.world
                .getFields()
                .map((f) => (f.id === id ? { ...f, falloff: state.falloff } : f)),
            ),
          ),
        );
    this.fieldFolder.addButton({ title: 'Delete field' }).on('click', () => {
      this.run(() =>
        this.controller.world.setFields(
          this.controller.world.getFields().filter((f) => f.id !== this.selected),
        ),
      );
      this.selectField(null);
    });
  }
  getSelected(): string | null {
    return this.selected;
  }
  refresh(): void {
    const fields = this.controller.world.getFields();
    const key = fields.map((f) => f.id).join(',');
    if (key !== this.fieldOptionsKey) {
      this.fieldOptionsKey = key;
      const list = document.getElementById('field-list') as HTMLSelectElement;
      list.replaceChildren(
        new Option('None', ''),
        ...fields.map((f, i) => new Option(`${i + 1}. ${f.kind}`, f.id)),
      );
      list.value = this.selected ?? '';
    }
    for (const folder of this.editable) folder.disabled = this.controller.locked;
    for (const refresh of this.refreshers) refresh();
    this.pane.refresh();
  }
  updateField(field: Field): void {
    this.selectField(field.id);
  }
}
