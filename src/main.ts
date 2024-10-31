import './style.css'
import { World } from './simulator'
import { Force } from './force';
import { Degree, Vector } from './vector';
import { Pane } from 'tweakpane';

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
}
else {
  const down = new Degree(90);
  const gravity = Force.fromVector('gravity', Vector.fromAngle(down.radians, 10));

  const world = new World(canvas, window);
  world.addForce(gravity);
  world.updateSettings({
    minParticleCount: 190,
    maxParticleCount: 200,
    minParticleLifeSpan: 1,
    maxParticleLifeSpan: 5,
    minParticleRadius: 1,
    maxParticleRadius: 20,
    enableParticleCollision: true,
    elasticity: 0.9,
    fillStyle: () => `hsl(${Math.random() * 360}, 100%, 50%)`,
  });

  setupTweakPane(world);

  let lastTime = performance.now();

  function animate(currentTime: number) {
    const dt = (currentTime - lastTime) / 1000;
    lastTime = currentTime;

    world.update(dt);
    world.draw();

    requestAnimationFrame(animate);
  }

  requestAnimationFrame(animate);
}

function setupTweakPane(world: World) {
  const pane = new Pane();
  const settings = world.getSettings();

  pane.addInput(settings, 'minParticleCount', { min: 0, max: 1000, step: 10 });
  pane.addInput(settings, 'maxParticleCount', { min: 0, max: 10000, step: 10 });
  pane.addInput(settings, 'minParticleLifeSpan', { min: 0.1, max: 10, step: 0.1 });
  pane.addInput(settings, 'maxParticleLifeSpan', { min: 0.1, max: 100, step: 0.1 });
  pane.addInput(settings, 'minParticleRadius', { min: 0, max: 10, step: 1 });
  pane.addInput(settings, 'maxParticleRadius', { min: 1, max: 100, step: 1 });
  pane.addInput(settings, 'enableParticleCollision');
  pane.addInput(settings, 'elasticity', { min: 0, max: 1 });

  //update world settings when pane is changed
  pane.on('change', () => {
    world.updateSettings(settings);
  });
}