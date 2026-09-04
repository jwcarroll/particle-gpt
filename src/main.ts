import './style.css';
import { World } from './simulator';
import { BladeApi, Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { ParticleRenderer } from './renderers/ParticleRenderer';
import {
  RendererManager,
  RendererSelection,
  RendererType,
  WebGLCapabilityStatus,
} from './renderers/RendererManager';
import { BenchmarkModule } from './benchmark';
import { ForceRegistry, GravityForcePlugin, RadialForcePlugin, WindForcePlugin } from './forces';
import {
  AgeAlphaEffectPlugin,
  ColorShiftEffectPlugin,
  GlowEffectPlugin,
  HeatShimmerEffectPlugin,
  OutlineEffectPlugin,
  ShaderRegistry,
  VelocityTintEffectPlugin,
} from './shaders';
import { SimulationClock } from './SimulationClock';

const canvas = document.querySelector<HTMLCanvasElement>('#canvas');
const app = document.querySelector('#app');

if (!app) {
  throw new Error('Could not find app element');
}

if (!canvas) {
  app.innerHTML = `
    <div class="error">
      <h1>Canvas not found</h1>
      <p>Make sure you have a canvas element with the id "canvas"</p>
    </div>
  `;
} else {
  const PIXELS_PER_METER = 100;
  const shaderRegistry = new ShaderRegistry();
  const colorShiftEffect = new ColorShiftEffectPlugin();
  const outlineEffect = new OutlineEffectPlugin();
  const glowEffect = new GlowEffectPlugin();
  const ageAlphaEffect = new AgeAlphaEffectPlugin();
  const velocityTintEffect = new VelocityTintEffectPlugin();
  const heatShimmerEffect = new HeatShimmerEffectPlugin();
  shaderRegistry.register(colorShiftEffect);
  shaderRegistry.register(outlineEffect);
  shaderRegistry.register(glowEffect);
  shaderRegistry.register(ageAlphaEffect);
  shaderRegistry.register(velocityTintEffect);
  shaderRegistry.register(heatShimmerEffect);

  // Create separate canvas for WebGL (can't mix 2d and webgl contexts)
  const webglCanvas = document.createElement('canvas');
  webglCanvas.id = 'webgl-canvas';
  webglCanvas.style.display = 'none';
  canvas.parentElement?.appendChild(webglCanvas);

  const rendererManager = new RendererManager(canvas, webglCanvas, shaderRegistry);

  const rendererState = { current: 'DoubleBuffered' as RendererType };
  let renderer: ParticleRenderer = rendererManager.activeRenderer;

  // Helper to show correct canvas
  const updateCanvasVisibility = (type: RendererType) => {
    canvas.style.display = type === 'WebGL' ? 'none' : 'block';
    webglCanvas.style.display = type === 'WebGL' ? 'block' : 'none';
  };

  const world = new World();
  const forceRegistry = new ForceRegistry();
  const gravityForce = new GravityForcePlugin({
    pixelsPerMeter: PIXELS_PER_METER,
    defaults: { strengthMps2: 9.81, directionDeg: 90, enabled: true },
  });
  const windForce = new WindForcePlugin({ pixelsPerMeter: PIXELS_PER_METER });
  const radialForce = new RadialForcePlugin({
    pixelsPerMeter: PIXELS_PER_METER,
    defaults: { centerX: window.innerWidth * 0.5, centerY: window.innerHeight * 0.5 },
  });
  forceRegistry.register(gravityForce);
  forceRegistry.register(windForce);
  forceRegistry.register(radialForce);
  world.setForceProvider((context) => forceRegistry.getNetForce(context));

  world.updateSettings({
    height: window.innerHeight,
    width: window.innerWidth,
    maxParticleCount: 1000,
    minParticleLifeSpan: 5,
    maxParticleLifeSpan: 15,
    minParticleRadius: 5,
    maxParticleRadius: 20,
    enableParticleCollision: false,
    elasticity: 0.7,
    fillStyle: (random) => `hsl(${random() * 360}, 100%, 50%)`,
  });

  const benchmark = new BenchmarkModule(world, forceRegistry, shaderRegistry);
  const paneRefs = setupTweakPane(
    world,
    forceRegistry,
    shaderRegistry,
    benchmark,
    rendererState,
    (type: RendererType) => {
      const selection = rendererManager.select(type);
      rendererState.current = selection.active;
      renderer = rendererManager.activeRenderer;
      updateCanvasVisibility(selection.active);
      return selection;
    },
    () => rendererManager.getWebGLCapabilityStatus(),
  );

  rendererManager.initialize(window.innerWidth, window.innerHeight);

  // Handle window resize
  window.addEventListener('resize', () => {
    rendererManager.resize(window.innerWidth, window.innerHeight);
    world.updateSettings({
      height: window.innerHeight,
      width: window.innerWidth,
    });
    const radialState = radialForce.getState();
    radialForce.setState({
      centerX: Math.min(radialState.centerX, window.innerWidth),
      centerY: Math.min(radialState.centerY, window.innerHeight),
    });
  });

  const simulationClock = new SimulationClock();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      simulationClock.pause();
      benchmark.invalidate('document visibility changed');
      return;
    }

    simulationClock.resume(performance.now());
  });

  function animate(currentTime: number) {
    paneRefs.fpsgraph.begin();

    const updateStart = performance.now();
    const clockFrame = simulationClock.advance(currentTime, (fixedStepSeconds) => {
      world.update(fixedStepSeconds);
    });
    const updateEnd = performance.now();

    if (clockFrame.clamped) {
      benchmark.invalidate('wall-clock time was clamped');
    } else if (clockFrame.overloaded) {
      benchmark.invalidate('physics could not keep pace with wall time');
    }

    if (clockFrame.shouldRender) {
      const renderStart = performance.now();
      if (typeof renderer.setTime === 'function') {
        renderer.setTime(clockFrame.presentationTimeSeconds);
      }
      renderer.render(world.activeParticles, clockFrame.interpolationAlpha);
      const renderEnd = performance.now();

      benchmark.recordFrame({
        updateTime: updateEnd - updateStart,
        renderTime: renderEnd - renderStart,
        particleCount: world.particleCount,
        poolSize: world.particlePool.length,
      });
    }

    paneRefs.fpsgraph.end();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

interface FpsBladeApi extends BladeApi {
  begin(): void;
  end(): void;
}

type PaneReferences = {
  fpsgraph: FpsBladeApi;
};

type IntervalRange = {
  min: number;
  max: number;
};

type ColorMode = 'solid' | 'rainbow' | 'preset';
type ColorPreset = 'water' | 'fire' | 'forest' | 'sunset';

type PaneState = {
  targetPopulation: number;
  lifespanRange: IntervalRange;
  radiusRange: IntervalRange;
  velocityRange: IntervalRange;
  angleRange: IntervalRange;
  colorMode: ColorMode;
  colorPreset: ColorPreset;
  rainbowCount: number;
  solidColor: string;
  colorPalette: string[];
};

const COLOR_PRESETS: Record<ColorPreset, string[]> = {
  water: ['#0b3c5d', '#1d6996', '#39a0ed', '#6ec6ff', '#9bdaf1'],
  fire: ['#4a0d00', '#8b1d04', '#d94801', '#ff8c00', '#ffd166', '#ff4d00'],
  forest: ['#1b4332', '#2d6a4f', '#40916c', '#52b788', '#95d5b2'],
  sunset: ['#3a0f5c', '#8c1c61', '#d1495b', '#edae49', '#f7e1ae'],
};

function randomHexColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`;
}

function createRandomPalette(count: number): string[] {
  const colors: string[] = [];
  for (let i = 0; i < count; i++) {
    colors.push(randomHexColor());
  }
  return colors;
}

function describeWebGLCapability(status: WebGLCapabilityStatus): string {
  if (status.state === 'available') return 'Available';
  if (status.state === 'unavailable') return status.reason ?? 'Unavailable';
  return 'Not checked';
}

function getCompileStatus(status: WebGLCapabilityStatus): string {
  if (status.renderer) return status.renderer.getCompileStatus();
  return status.state === 'unavailable' ? 'Unavailable' : 'Not initialized';
}

function setupTweakPane(
  world: World,
  forceRegistry: ForceRegistry,
  shaderRegistry: ShaderRegistry,
  benchmark: BenchmarkModule,
  rendererState: { current: string },
  onRendererChange: (type: RendererType) => RendererSelection,
  getWebGLCapabilityStatus: () => WebGLCapabilityStatus,
): PaneReferences {
  const pane = new Pane();
  pane.registerPlugin(EssentialsPlugin);
  const fpsgraph = pane.addBlade({ view: 'fpsgraph', label: 'FPS', rows: 2 }) as FpsBladeApi;
  const settings = world.getSettings();
  const initialSolidColor = typeof settings.fillStyle === 'string' ? settings.fillStyle : '#00aaff';
  const initialRainbowCount = 7;

  const paneState: PaneState = {
    targetPopulation: settings.maxParticleCount,
    lifespanRange: {
      min: settings.minParticleLifeSpan,
      max: settings.maxParticleLifeSpan,
    },
    radiusRange: {
      min: settings.minParticleRadius,
      max: settings.maxParticleRadius,
    },
    velocityRange: {
      min: settings.minParticleVelocity,
      max: settings.maxParticleVelocity,
    },
    angleRange: {
      min: settings.minStartingAngle,
      max: settings.maxStartingAngle,
    },
    colorMode: typeof settings.fillStyle === 'string' ? 'solid' : 'rainbow',
    colorPreset: 'water',
    rainbowCount: initialRainbowCount,
    solidColor: initialSolidColor,
    colorPalette:
      typeof settings.fillStyle === 'string'
        ? [initialSolidColor]
        : createRandomPalette(initialRainbowCount),
  };

  const tabs = pane.addTab({
    pages: [
      { title: 'Simulation' },
      { title: 'Forces' },
      { title: 'Rendering' },
      { title: 'Benchmark' },
    ],
  });

  const simulationTab = tabs.pages[0];
  const forcesTab = tabs.pages[1];
  const renderingTab = tabs.pages[2];
  const benchmarkTab = tabs.pages[3];

  const populationFolder = simulationTab.addFolder({ title: 'Population', expanded: true });
  const lifespanAndSizeFolder = simulationTab.addFolder({
    title: 'Lifespan & Size',
    expanded: false,
  });
  const motionFolder = simulationTab.addFolder({ title: 'Motion', expanded: false });
  const collisionFolder = simulationTab.addFolder({ title: 'Collision', expanded: false });

  populationFolder.addBinding(paneState, 'targetPopulation', {
    min: 0,
    max: 50000,
    step: 10,
    label: 'Target',
  });
  populationFolder.addBinding(settings, 'emissionRate', {
    min: 0,
    max: 10000,
    step: 60,
    label: 'Emission / sec',
  });
  populationFolder.addBinding(world, 'particleCount', { label: 'Particles', readonly: true });

  lifespanAndSizeFolder.addBinding(paneState, 'lifespanRange', {
    min: 0.1,
    max: 100,
    step: 0.1,
    label: 'Lifespan',
  });
  lifespanAndSizeFolder.addBinding(paneState, 'radiusRange', {
    min: 0,
    max: 100,
    step: 1,
    label: 'Radius',
  });

  motionFolder.addBinding(paneState, 'velocityRange', {
    min: 0,
    max: 1000,
    step: 1,
    label: 'Velocity',
  });
  motionFolder.addBinding(paneState, 'angleRange', {
    min: 0,
    max: 360,
    step: 1,
    label: 'Angle',
  });

  collisionFolder.addBinding(settings, 'enableParticleCollision', { label: 'Enable Collisions' });
  collisionFolder.addBinding(settings, 'elasticity', { min: 0, max: 1, step: 0.01 });

  const gravityPlugin = forceRegistry.get('gravity');
  if (gravityPlugin instanceof GravityForcePlugin) {
    const gravityFolder = forcesTab.addFolder({ title: 'Gravity', expanded: true });
    const gravityState = gravityPlugin.getState();
    const applyGravityState = () => {
      if (benchmark.isRunning()) return;
      gravityPlugin.setState(gravityState);
    };

    gravityFolder
      .addBinding(gravityState, 'enabled', { label: 'Enabled' })
      .on('change', applyGravityState);
    gravityFolder
      .addBinding(gravityState, 'strengthMps2', {
        min: 0,
        max: 30,
        step: 0.01,
        label: 'Strength (m/s²)',
      })
      .on('change', applyGravityState);
    gravityFolder
      .addBinding(gravityState, 'directionDeg', {
        min: 0,
        max: 360,
        step: 1,
        label: 'Direction',
      })
      .on('change', applyGravityState);
    gravityFolder.addButton({ title: 'Reset' }).on('click', () => {
      gravityPlugin.reset();
      Object.assign(gravityState, gravityPlugin.getState());
      pane.refresh();
    });
  }

  const windPlugin = forceRegistry.get('wind');
  if (windPlugin instanceof WindForcePlugin) {
    const windFolder = forcesTab.addFolder({ title: 'Wind', expanded: false });
    const windState = windPlugin.getState();
    const applyWindState = () => {
      if (benchmark.isRunning()) return;
      windPlugin.setState({
        enabled: windState.enabled,
        baseMps2: windState.baseMps2,
        variabilityMps2: windState.variabilityMps2,
        directionDeg: windState.directionDeg,
        directionJitterDeg: windState.directionJitterDeg,
        turbulenceHz: windState.turbulenceHz,
        gustChancePerMin: windState.gustChancePerMin,
        gustStrengthMps2: windState.gustStrengthMps2,
        gustDurationSec: windState.gustDurationSec,
        seed: windState.seed,
      });
    };

    windFolder.addBinding(windState, 'enabled', { label: 'Enabled' }).on('change', applyWindState);
    windFolder
      .addBinding(windState, 'baseMps2', {
        min: -30,
        max: 30,
        step: 0.01,
        label: 'Base (m/s²)',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'variabilityMps2', {
        min: 0,
        max: 30,
        step: 0.01,
        label: 'Variability',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'turbulenceHz', {
        min: 0.01,
        max: 2,
        step: 0.01,
        label: 'Turbulence (Hz)',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'directionDeg', {
        min: 0,
        max: 360,
        step: 1,
        label: 'Direction',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'directionJitterDeg', {
        min: 0,
        max: 90,
        step: 1,
        label: 'Dir Jitter',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'gustChancePerMin', {
        min: 0,
        max: 60,
        step: 1,
        label: 'Gusts / Min',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'gustStrengthMps2', {
        min: 0,
        max: 30,
        step: 0.1,
        label: 'Gust Strength',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'gustDurationSec', {
        min: 0.1,
        max: 10,
        step: 0.1,
        label: 'Gust Duration',
      })
      .on('change', applyWindState);
    windFolder
      .addBinding(windState, 'seed', {
        min: 1,
        max: 2147483647,
        step: 1,
        label: 'Seed',
      })
      .on('change', applyWindState);
    windFolder.addButton({ title: 'Randomize Seed' }).on('click', () => {
      if (benchmark.isRunning()) return;
      windState.seed = Math.floor(Math.random() * 2147483646) + 1;
      windPlugin.setState({ seed: windState.seed });
      Object.assign(windState, windPlugin.getState());
      pane.refresh();
    });
    windFolder.addButton({ title: 'Reset' }).on('click', () => {
      windPlugin.reset();
      Object.assign(windState, windPlugin.getState());
      pane.refresh();
    });
  }

  const radialPlugin = forceRegistry.get('radial');
  if (radialPlugin instanceof RadialForcePlugin) {
    const radialFolder = forcesTab.addFolder({ title: 'Radial', expanded: false });
    const radialState = radialPlugin.getState();
    const applyRadialState = () => {
      if (benchmark.isRunning()) return;
      radialPlugin.setState(radialState);
    };

    radialFolder
      .addBinding(radialState, 'enabled', { label: 'Enabled' })
      .on('change', applyRadialState);
    radialFolder
      .addBinding(radialState, 'strengthMps2', {
        min: -50,
        max: 50,
        step: 0.1,
        label: 'Strength (m/s²)',
      })
      .on('change', applyRadialState);
    radialFolder
      .addBinding(radialState, 'centerX', {
        min: 0,
        max: settings.width,
        step: 1,
        label: 'Center X',
      })
      .on('change', applyRadialState);
    radialFolder
      .addBinding(radialState, 'centerY', {
        min: 0,
        max: settings.height,
        step: 1,
        label: 'Center Y',
      })
      .on('change', applyRadialState);
    radialFolder
      .addBinding(radialState, 'falloff', {
        label: 'Falloff',
        options: {
          None: 'none',
          'Inverse Distance': 'inverseDistance',
          'Inverse Square': 'inverseSquare',
        },
      })
      .on('change', applyRadialState);
    radialFolder.addButton({ title: 'Reset' }).on('click', () => {
      radialPlugin.reset();
      Object.assign(radialState, radialPlugin.getState());
      pane.refresh();
    });
  }

  const rendererFolder = renderingTab.addFolder({ title: 'Renderer', expanded: true });
  rendererFolder
    .addBinding(rendererState, 'current', {
      label: 'Renderer',
      options: {
        Canvas2D: 'DoubleBuffered',
        'Canvas2D (Direct)': 'Direct',
        WebGL: 'WebGL',
      },
    })
    .on('change', (ev) => {
      onRendererChange(ev.value as RendererType);
      updateShaderUiState();
    });

  const shadersFolder = renderingTab.addFolder({ title: 'Shaders', expanded: true });
  const initialWebGLStatus = getWebGLCapabilityStatus();
  const shaderUiState = {
    webglActive: rendererState.current === 'WebGL' ? 'Yes' : 'No',
    availability: describeWebGLCapability(initialWebGLStatus),
    compileStatus: getCompileStatus(initialWebGLStatus),
    activeEffects: 'None',
  };
  const shaderBlades: BladeApi[] = [];

  const updateShaderUiState = () => {
    const webglStatus = getWebGLCapabilityStatus();
    shaderUiState.webglActive = rendererState.current === 'WebGL' ? 'Yes' : 'No';
    shaderUiState.availability = describeWebGLCapability(webglStatus);
    shaderUiState.compileStatus = getCompileStatus(webglStatus);
    const active = shaderRegistry
      .list()
      .filter((plugin) => plugin.getState().enabled)
      .map((plugin) => plugin.label);
    shaderUiState.activeEffects = active.length > 0 ? active.join(', ') : 'None';

    const disabled = rendererState.current !== 'WebGL';
    for (const blade of shaderBlades) {
      (blade as unknown as { disabled: boolean }).disabled = disabled;
    }
    pane.refresh();
  };

  shadersFolder.addBinding(shaderUiState, 'webglActive', { label: 'WebGL Active', readonly: true });
  shadersFolder.addBinding(shaderUiState, 'availability', { label: 'Capability', readonly: true });
  shadersFolder.addBinding(shaderUiState, 'compileStatus', { label: 'Compile', readonly: true });
  shadersFolder.addBinding(shaderUiState, 'activeEffects', { label: 'Active', readonly: true });

  const ageAlphaEffect = shaderRegistry.get('ageAlpha');
  if (ageAlphaEffect instanceof AgeAlphaEffectPlugin) {
    const folder = shadersFolder.addFolder({ title: 'Age Alpha', expanded: false });
    const state = ageAlphaEffect.getState();
    const apply = () => {
      if (benchmark.isRunning() || rendererState.current !== 'WebGL') return;
      ageAlphaEffect.setState(state);
      updateShaderUiState();
    };
    shaderBlades.push(
      folder.addBinding(state, 'enabled', { label: 'Enabled' }).on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'curve', {
          label: 'Curve',
          options: {
            Linear: 'linear',
            Smoothstep: 'smoothstep',
            Exponential: 'exponential',
          },
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'exponent', {
          min: 0.2,
          max: 5,
          step: 0.1,
          label: 'Exponent',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder.addButton({ title: 'Reset' }).on('click', () => {
        ageAlphaEffect.reset();
        Object.assign(state, ageAlphaEffect.getState());
        updateShaderUiState();
      }),
    );
  }

  const velocityTintEffect = shaderRegistry.get('velocityTint');
  if (velocityTintEffect instanceof VelocityTintEffectPlugin) {
    const folder = shadersFolder.addFolder({ title: 'Velocity Tint', expanded: false });
    const state = velocityTintEffect.getState();
    const apply = () => {
      if (benchmark.isRunning() || rendererState.current !== 'WebGL') return;
      velocityTintEffect.setState(state);
      updateShaderUiState();
    };
    shaderBlades.push(
      folder.addBinding(state, 'enabled', { label: 'Enabled' }).on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'minSpeed', {
          min: 0,
          max: 2000,
          step: 1,
          label: 'Min Speed',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'maxSpeed', {
          min: 1,
          max: 3000,
          step: 1,
          label: 'Max Speed',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'lowColor', {
          label: 'Low Color',
          view: 'color',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'highColor', {
          label: 'High Color',
          view: 'color',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'strength', {
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Strength',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder.addButton({ title: 'Reset' }).on('click', () => {
        velocityTintEffect.reset();
        Object.assign(state, velocityTintEffect.getState());
        updateShaderUiState();
      }),
    );
  }

  const colorShiftEffect = shaderRegistry.get('colorShift');
  if (colorShiftEffect instanceof ColorShiftEffectPlugin) {
    const folder = shadersFolder.addFolder({ title: 'Color Shift', expanded: false });
    const state = colorShiftEffect.getState();
    const apply = () => {
      if (benchmark.isRunning() || rendererState.current !== 'WebGL') return;
      colorShiftEffect.setState(state);
      updateShaderUiState();
    };
    shaderBlades.push(
      folder.addBinding(state, 'enabled', { label: 'Enabled' }).on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'speed', {
          min: 0,
          max: 5,
          step: 0.01,
          label: 'Speed',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'amount', {
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Amount',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder.addButton({ title: 'Reset' }).on('click', () => {
        colorShiftEffect.reset();
        Object.assign(state, colorShiftEffect.getState());
        updateShaderUiState();
      }),
    );
  }

  const outlineEffect = shaderRegistry.get('outline');
  if (outlineEffect instanceof OutlineEffectPlugin) {
    const folder = shadersFolder.addFolder({ title: 'Outline', expanded: false });
    const state = outlineEffect.getState();
    const apply = () => {
      if (benchmark.isRunning() || rendererState.current !== 'WebGL') return;
      outlineEffect.setState(state);
      updateShaderUiState();
    };
    shaderBlades.push(
      folder.addBinding(state, 'enabled', { label: 'Enabled' }).on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'thickness', {
          min: 0.01,
          max: 0.95,
          step: 0.01,
          label: 'Thickness',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'strength', {
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Strength',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'color', {
          label: 'Color',
          view: 'color',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder.addButton({ title: 'Reset' }).on('click', () => {
        outlineEffect.reset();
        Object.assign(state, outlineEffect.getState());
        updateShaderUiState();
      }),
    );
  }

  const glowEffect = shaderRegistry.get('glow');
  if (glowEffect instanceof GlowEffectPlugin) {
    const folder = shadersFolder.addFolder({ title: 'Glow', expanded: false });
    const state = glowEffect.getState();
    const apply = () => {
      if (benchmark.isRunning() || rendererState.current !== 'WebGL') return;
      glowEffect.setState(state);
      updateShaderUiState();
    };
    shaderBlades.push(
      folder.addBinding(state, 'enabled', { label: 'Enabled' }).on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'radius', {
          min: 0.01,
          max: 0.95,
          step: 0.01,
          label: 'Radius',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'intensity', {
          min: 0,
          max: 2,
          step: 0.01,
          label: 'Intensity',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder.addButton({ title: 'Reset' }).on('click', () => {
        glowEffect.reset();
        Object.assign(state, glowEffect.getState());
        updateShaderUiState();
      }),
    );
  }

  const heatShimmerEffect = shaderRegistry.get('heatShimmer');
  if (heatShimmerEffect instanceof HeatShimmerEffectPlugin) {
    const folder = shadersFolder.addFolder({ title: 'Heat Shimmer', expanded: false });
    const state = heatShimmerEffect.getState();
    const apply = () => {
      if (benchmark.isRunning() || rendererState.current !== 'WebGL') return;
      heatShimmerEffect.setState(state);
      updateShaderUiState();
    };
    shaderBlades.push(
      folder.addBinding(state, 'enabled', { label: 'Enabled' }).on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'frequency', {
          min: 0.1,
          max: 40,
          step: 0.1,
          label: 'Frequency',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'amplitude', {
          min: 0,
          max: 0.2,
          step: 0.001,
          label: 'Amplitude',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'speed', {
          min: 0,
          max: 8,
          step: 0.01,
          label: 'Speed',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder
        .addBinding(state, 'strength', {
          min: 0,
          max: 1,
          step: 0.01,
          label: 'Strength',
        })
        .on('change', apply),
    );
    shaderBlades.push(
      folder.addButton({ title: 'Reset' }).on('click', () => {
        heatShimmerEffect.reset();
        Object.assign(state, heatShimmerEffect.getState());
        updateShaderUiState();
      }),
    );
  }
  updateShaderUiState();

  const colorFolder = renderingTab.addFolder({ title: 'Color', expanded: true });
  const paletteFolder = colorFolder.addFolder({ title: 'Palette', expanded: true });
  const colorModeBinding = colorFolder.addBinding(paneState, 'colorMode', {
    label: 'Mode',
    options: {
      Solid: 'solid',
      Rainbow: 'rainbow',
      Preset: 'preset',
    },
  });

  const colorPresetBinding = colorFolder.addBinding(paneState, 'colorPreset', {
    label: 'Preset',
    options: {
      Water: 'water',
      Fire: 'fire',
      Forest: 'forest',
      Sunset: 'sunset',
    },
  });

  const rainbowCountBinding = colorFolder.addBinding(paneState, 'rainbowCount', {
    label: 'Colors',
    min: 5,
    max: 10,
    step: 1,
  });

  const randomizePaletteButton = colorFolder.addButton({ title: 'Randomize Palette' });

  const dynamicPaletteBindings: BladeApi[] = [];
  const clearPaletteBindings = () => {
    while (dynamicPaletteBindings.length > 0) {
      dynamicPaletteBindings.pop()?.dispose();
    }
  };

  const syncPaletteForMode = (regenerateRainbow: boolean) => {
    if (paneState.colorMode === 'solid') {
      paneState.colorPalette = [paneState.solidColor];
      return;
    }

    if (paneState.colorMode === 'preset') {
      paneState.colorPalette = [...COLOR_PRESETS[paneState.colorPreset]];
      return;
    }

    if (regenerateRainbow || paneState.colorPalette.length === 0) {
      paneState.colorPalette = createRandomPalette(paneState.rainbowCount);
      return;
    }

    const next = [...paneState.colorPalette];
    if (next.length > paneState.rainbowCount) {
      next.length = paneState.rainbowCount;
    } else {
      while (next.length < paneState.rainbowCount) {
        next.push(randomHexColor());
      }
    }
    paneState.colorPalette = next;
  };

  const rebuildPaletteBindings = () => {
    clearPaletteBindings();

    for (let i = 0; i < paneState.colorPalette.length; i++) {
      const swatch = { color: paneState.colorPalette[i] };
      const binding = paletteFolder.addBinding(swatch, 'color', {
        label: `Color ${i + 1}`,
        view: 'color',
      });
      binding.on('change', (ev) => {
        paneState.colorPalette[i] = ev.value as string;
        if (paneState.colorMode === 'solid') {
          paneState.solidColor = paneState.colorPalette[0];
        }
      });
      dynamicPaletteBindings.push(binding);
    }
  };

  const updateColorUiVisibility = () => {
    colorPresetBinding.hidden = paneState.colorMode !== 'preset';
    rainbowCountBinding.hidden = paneState.colorMode !== 'rainbow';
    randomizePaletteButton.hidden = paneState.colorMode !== 'rainbow';
  };

  syncPaletteForMode(false);
  rebuildPaletteBindings();
  updateColorUiVisibility();

  colorModeBinding.on('change', () => {
    syncPaletteForMode(true);
    rebuildPaletteBindings();
    updateColorUiVisibility();
  });
  colorPresetBinding.on('change', () => {
    syncPaletteForMode(false);
    rebuildPaletteBindings();
  });
  rainbowCountBinding.on('change', () => {
    syncPaletteForMode(false);
    rebuildPaletteBindings();
  });
  randomizePaletteButton.on('click', () => {
    syncPaletteForMode(true);
    rebuildPaletteBindings();
  });

  // Setup benchmark UI
  benchmark.setupUI(benchmarkTab);

  //update world settings when pane is changed
  pane.on('change', () => {
    // Don't overwrite settings while benchmark is running
    if (benchmark.isRunning()) return;

    settings.maxParticleCount = paneState.targetPopulation;
    settings.minParticleLifeSpan = paneState.lifespanRange.min;
    settings.maxParticleLifeSpan = paneState.lifespanRange.max;
    settings.minParticleRadius = paneState.radiusRange.min;
    settings.maxParticleRadius = paneState.radiusRange.max;
    settings.minParticleVelocity = paneState.velocityRange.min;
    settings.maxParticleVelocity = paneState.velocityRange.max;
    settings.minStartingAngle = paneState.angleRange.min;
    settings.maxStartingAngle = paneState.angleRange.max;
    settings.fillStyle = (random) => {
      const palette = paneState.colorPalette;
      if (palette.length === 0) {
        return paneState.solidColor;
      }
      const index = Math.floor(random() * palette.length);
      return palette[index];
    };

    world.updateSettings(settings);
  });

  return { fpsgraph };
}
