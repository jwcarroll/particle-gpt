import { SimulationController } from '../SimulationController';
import {
  Scene,
  applyScene,
  captureScene,
  makePreset,
  parseSceneFragment,
  sceneFragment,
} from '../Scene';
import { Field } from '../Fields';
import { Inspector } from './Inspector';
import { Presentation } from './Presentation';

export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error('Missing element: ' + id);
  return value as T;
}
export function setupShell(options: {
  controller: SimulationController;
  inspector: Inspector;
  overlay: HTMLCanvasElement;
  presentation: Presentation;
  baseScene: Scene;
  report: (text: string) => void;
  synchronize: () => void;
  refreshScene: () => void;
  resizeViewport: () => void;
}) {
  const {
    controller,
    inspector,
    overlay,
    presentation,
    baseScene,
    report,
    synchronize,
    refreshScene,
    resizeViewport,
  } = options;
  const world = controller.world;
  function action(run: () => void): void {
    try {
      controller.change(run);
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
    }
    synchronize();
  }
  function download(blob: Blob, name: string): void {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }
  element('play').onclick = () => action(() => controller.toggle());
  element('step').onclick = () => action(() => controller.step());
  element('reset').onclick = () =>
    action(() => {
      controller.reset();
      presentation.clear();
    });
  element<HTMLInputElement>('seed').onchange = (event) =>
    action(() => {
      const seed = Number((event.target as HTMLInputElement).value);
      if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647)
        throw new Error('Seed must be an integer from 1 to 2147483647');
      controller.seed = seed;
      controller.reset();
      presentation.clear();
    });
  element('fit').onclick = () =>
    action(() => {
      controller.fitToWindow = true;
      resizeViewport();
    });
  element<HTMLSelectElement>('preset').onchange = (event) =>
    action(() => {
      applyScene(makePreset((event.target as HTMLSelectElement).value, baseScene), controller);
      refreshScene();
    });
  element('share').onclick = () =>
    action(() => {
      const fragment = sceneFragment(captureScene(controller)),
        url = location.href.split('#')[0] + fragment;
      location.hash = fragment;
      void navigator.clipboard.writeText(url).then(
        () => report('Scene link copied'),
        () => report('Copy the scene link from the address bar'),
      );
    });
  element('export').onclick = () =>
    action(() =>
      download(
        new Blob([JSON.stringify(captureScene(controller), null, 2)], { type: 'application/json' }),
        'particle-scene.json',
      ),
    );
  element('import').onclick = () => {
    if (!controller.locked) element<HTMLInputElement>('scene-file').click();
  };
  element<HTMLInputElement>('scene-file').onchange = async (event) => {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 1024 * 1024) throw new Error('Scene file exceeds 1 MiB');
      const value: unknown = JSON.parse(await file.text());
      action(() => {
        applyScene(value, controller);
        refreshScene();
        report('Scene imported');
      });
    } catch (error) {
      report(String(error));
    }
    input.value = '';
  };
  element('save').onclick = () =>
    action(() => {
      const name = prompt('Preset name');
      if (!name?.trim()) return;
      const saved = JSON.parse(localStorage.getItem('particle_scenes_v1') ?? '{}');
      Object.defineProperty(saved, name.trim(), {
        value: captureScene(controller),
        enumerable: true,
        configurable: true,
      });
      localStorage.setItem('particle_scenes_v1', JSON.stringify(saved));
      report('Preset saved locally');
    });
  element('load').onclick = () =>
    action(() => {
      const saved = JSON.parse(localStorage.getItem('particle_scenes_v1') ?? '{}');
      const name = prompt('Load preset: ' + (Object.keys(saved).join(', ') || '(none saved)'));
      if (!name) return;
      if (!Object.hasOwn(saved, name)) throw new Error('Preset not found');
      applyScene(saved[name], controller);
      refreshScene();
    });
  let captureRequested = false;
  element('capture').onclick = () =>
    action(() => {
      captureRequested = true;
    });
  const panel = element('inspector'),
    toggle = element('inspector-toggle');
  function setPanel(open: boolean): void {
    panel.classList.toggle('closed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    const modal = open && window.innerWidth <= 768;
    for (const region of [
      document.querySelector('header'),
      document.querySelector('footer'),
      document.getElementById('viewport'),
    ])
      if (region) (region as HTMLElement).inert = modal;
    if (modal) {
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');
      element('inspector-close').focus();
    } else {
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
    }
  }
  toggle.onclick = () => setPanel(panel.classList.contains('closed'));
  element('inspector-close').onclick = () => {
    setPanel(false);
    toggle.focus();
  };
  window.addEventListener('resize', () => setPanel(!panel.classList.contains('closed')));
  if (window.innerWidth < 769) {
    panel.classList.add('closed');
    toggle.setAttribute('aria-expanded', 'false');
  }
  const tool = element<HTMLSelectElement>('tool');
  let dragId: string | null = null;
  function addField(kind: Field['kind'], x: number, y: number): void {
    const field: Field = {
      id: crypto.randomUUID(),
      kind,
      x,
      y,
      strength: 8,
      falloff: 'inverseDistance',
      rate: 120,
      direction: 270,
      spread: 30,
    };
    world.setFields([...world.getFields(), field]);
    inspector.selectField(field.id);
  }
  element('add-field').onclick = () =>
    action(() => {
      if (tool.value === 'select') throw new Error('Choose a field tool first');
      const settings = world.getSettings();
      addField(tool.value as Field['kind'], settings.width / 2, settings.height / 2);
    });
  function point(event: PointerEvent) {
    const rect = overlay.getBoundingClientRect(),
      settings = world.getSettings();
    return {
      x: Math.max(
        0,
        Math.min(settings.width, ((event.clientX - rect.left) / rect.width) * settings.width),
      ),
      y: Math.max(
        0,
        Math.min(settings.height, ((event.clientY - rect.top) / rect.height) * settings.height),
      ),
    };
  }
  overlay.onpointerdown = (event) =>
    action(() => {
      const p = point(event);
      if (tool.value !== 'select') {
        addField(tool.value as Field['kind'], p.x, p.y);
        tool.value = 'select';
        return;
      }
      const field = world.getFields().find((f) => Math.hypot(f.x - p.x, f.y - p.y) < 25);
      inspector.selectField(field?.id ?? null);
      dragId = field?.id ?? null;
      if (dragId) overlay.setPointerCapture(event.pointerId);
    });
  overlay.onpointermove = (event) => {
    if (!dragId || controller.locked) return;
    const p = point(event);
    world.setFields(world.getFields().map((f) => (f.id === dragId ? { ...f, ...p } : f)));
  };
  overlay.onpointerup = () => {
    if (dragId) inspector.selectField(dragId);
    dragId = null;
  };
  overlay.onpointercancel = () => {
    dragId = null;
  };
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      dragId = null;
      tool.value = 'select';
      setPanel(false);
      toggle.focus();
    }
    if (event.key === 'Tab' && panel.getAttribute('aria-modal') === 'true') {
      const controls = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ).filter((node) => node.offsetParent !== null);
      const first = controls[0],
        last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    if ((event.target as HTMLElement).closest('input, select, textarea, button, [contenteditable]'))
      return;
    if (event.code === 'Space') {
      event.preventDefault();
      action(() => controller.toggle());
    }
    if (event.key === '.') action(() => controller.step());
    if (event.key.toLowerCase() === 'r')
      action(() => {
        controller.reset();
        presentation.clear();
      });
    if (event.key === 'Delete' && inspector.getSelected())
      action(() => {
        world.setFields(world.getFields().filter((f) => f.id !== inspector.getSelected()));
        inspector.selectField(null);
      });
  });
  if (location.hash.startsWith('#scene='))
    action(() => {
      applyScene(parseSceneFragment(location.hash), controller);
      refreshScene();
    });
  return {
    capture(source: HTMLCanvasElement) {
      if (!captureRequested) return;
      captureRequested = false;
      if (controller.locked) return;
      const image = document.createElement('canvas');
      image.width = overlay.width;
      image.height = overlay.height;
      const context = image.getContext('2d')!;
      context.drawImage(source, 0, 0);
      context.drawImage(overlay, 0, 0);
      image.toBlob((blob) => {
        if (blob) download(blob, 'particle-scene.png');
        else report('PNG capture failed');
      });
    },
  };
}
