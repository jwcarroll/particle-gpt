import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const profile = JSON.parse(
  readFileSync(new URL('../../docs/evidence/profile-before.json', import.meta.url), 'utf8'),
);
import { withCompatibilityFingerprint } from '../../src/benchmark/BenchmarkManifest';

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => !!(window as any).laboratory);
  await page.evaluate(() => (window as any).laboratory.freeze());
}
async function state(page: Page) {
  return page.evaluate(() => (window as any).laboratory.snapshot());
}

test('transport, seeded reset, narrow setting changes after resize', async ({ page }) => {
  await ready(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  const stepped = await state(page);
  expect(stepped.clock.totalPhysicsSteps).toBe(1);
  expect(stepped.particles).not.toEqual(before.particles);
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  expect((await state(page)).particles).toEqual(before.particles);
  await page.setViewportSize({ width: 1100, height: 750 });
  const resized = await state(page);
  const target = page
    .locator('.tp-lblv')
    .filter({ hasText: /^max Count/ })
    .locator('input');
  await target.fill('500');
  await target.press('Enter');
  const changed = await state(page);
  expect(changed.scene.world.width).toBe(resized.scene.world.width);
  expect(changed.scene.world.height).toBe(resized.scene.world.height);
});

test('benchmark locks controls and cancellation restores the paused scene', async ({ page }) => {
  await ready(page);
  const before = await state(page);
  await page.getByRole('button', { name: 'Benchmark', exact: true }).click();
  await page.getByRole('button', { name: 'Run Benchmark', exact: true }).click();
  await expect(page.locator('#reset')).toBeDisabled();
  expect((await state(page)).locked).toBe(true);
  await page.getByRole('button', { name: 'Cancel benchmark', exact: true }).click();
  await expect(page.locator('#reset')).toBeEnabled();
  const after = await state(page);
  expect(after.particles).toEqual(before.particles);
  expect(after.paused).toBe(true);
  expect(after.clock).toEqual(before.clock);
});

test('completion, timeout and resize invalidation unlock and restore', async ({ page }) => {
  await ready(page);
  const before = await state(page);
  await page.evaluate(() => (window as any).laboratory.benchmark(0.2));
  await expect.poll(async () => (await state(page)).benchmark).toBe('complete');
  expect((await state(page)).particles).toEqual(before.particles);
  await page.evaluate(() => (window as any).laboratory.benchmark(0.1, true));
  await expect.poll(async () => (await state(page)).benchmark).toBe('invalid');
  expect((await state(page)).particles).toEqual(before.particles);
  await page.evaluate(() => (window as any).laboratory.benchmark(10));
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(async () => (await state(page)).benchmark).toBe('invalid');
  expect((await state(page)).locked).toBe(false);
});

test('field editing, presets, sharing and PNG capture do not advance paused physics', async ({
  page,
}) => {
  await ready(page);
  await page.locator('#tool').selectOption('vortex');
  await page.locator('#add-field').click();
  expect((await state(page)).scene.fields).toHaveLength(1);
  await page.locator('#preset').selectOption('Attractor');
  const before = await state(page);
  expect(before.scene.fields[0].kind).toBe('attractor');
  const download = page.waitForEvent('download');
  await page.locator('#capture').click();
  expect((await download).suggestedFilename()).toBe('particle-scene.png');
  expect((await state(page)).particles).toEqual(before.particles);
  await page.locator('#share').click();
  expect(page.url()).toContain('#scene=');
  const url = page.url();
  await page.goto(url);
  await page.waitForFunction(() => !!(window as any).laboratory);
  await page.evaluate(() => (window as any).laboratory.freeze());
  expect((await state(page)).scene).toEqual(before.scene);
});

for (const width of [390, 360]) {
  test('mobile controls, keyboard and DPR at ' + width, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await ready(page);
    await expect(page.locator('#inspector')).toHaveClass(/closed/);
    await page.locator('#step').focus();
    await page.keyboard.press('Enter');
    expect((await state(page)).clock.totalPhysicsSteps).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const sizes = await page.locator('#canvas').evaluate((c: HTMLCanvasElement) => ({
      width: c.width,
      css: c.getBoundingClientRect().width,
    }));
    expect(sizes.width).toBe(Math.round(sizes.css * 2));
    await page.locator('#inspector-toggle').click();
    await expect(page.locator('#inspector')).not.toHaveClass(/closed/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#inspector-toggle')).toBeFocused();
    await page.screenshot({ path: 'test-results/mobile-' + width + '.png' });
    await context.close();
  });
}

test('renderer parity and context-loss invalidation', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => (window as any).laboratory.fixture());
  const before = await state(page);
  const pixels = async (renderer: string) =>
    page.evaluate((type) => (window as any).laboratory.pixels(type), renderer);
  const buffered = await pixels('DoubleBuffered');
  const direct = await pixels('Direct');
  expect(direct).toEqual(buffered);
  const webgl = await pixels('WebGL');
  test.skip((await state(page)).renderer !== 'WebGL', 'WebGL unavailable on this browser host');
  let different = 0;
  let canvasForeground = 0;
  let webglForeground = 0;
  const background = [17, 24, 32];
  for (let i = 0; i < buffered.length; i += 4) {
    if (background.some((channel, c) => Math.abs(buffered[i + c] - channel) > 20))
      canvasForeground++;
    if (background.some((channel, c) => Math.abs(webgl[i + c] - channel) > 20)) webglForeground++;
    if (Math.max(...[0, 1, 2].map((c) => Math.abs(buffered[i + c] - webgl[i + c]))) > 20)
      different++;
  }
  expect(different / (640 * 480)).toBeLessThan(0.015);
  // Sparse scenes must not pass merely because their background dominates.
  expect(canvasForeground).toBeGreaterThan(100);
  expect(webglForeground / canvasForeground).toBeGreaterThan(0.75);
  expect(webglForeground / canvasForeground).toBeLessThan(1.25);
  expect(different / canvasForeground).toBeLessThan(0.5);
  expect((await state(page)).particles).toEqual(before.particles);
  await page.screenshot({ path: 'test-results/webgl-desktop.png' });
  await page.evaluate(() => {
    (window as any).laboratory.benchmark(10);
    const canvas = document.querySelector('#webgl-canvas') as HTMLCanvasElement;
    canvas.getContext('webgl')!.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect.poll(async () => (await state(page)).renderer).toBe('DoubleBuffered');
  expect((await state(page)).benchmark).toBe('invalid');
});

test('unavailable WebGL retains Canvas2D and particle state', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      if (type === 'webgl') return null;
      return original.call(this, type as any, ...args);
    } as any;
  });
  await ready(page);
  const before = await state(page);
  await page.evaluate(() => (window as any).laboratory.renderer('WebGL'));
  const after = await state(page);
  expect(after.renderer).toBe('DoubleBuffered');
  expect(after.particles).toEqual(before.particles);
  await expect(page.locator('#message')).toContainText('WebGL');
});

test('legacy history persists and can be inspected and exported through controls', async ({
  page,
}) => {
  await ready(page);
  const manifest: any = structuredClone(profile.manifest);
  manifest.schemaVersion = 1;
  delete manifest.world.colors;
  delete manifest.world.fields;
  delete manifest.presentation;
  const legacy = {
    id: 'legacy-example',
    timestamp: '2026-11-08T00:00:00Z',
    scenario: manifest.scenario,
    manifest: withCompatibilityFingerprint(manifest),
    stats: {
      avgFps: 60,
      minFps: 50,
      maxFps: 61,
      avgFrameTime: 16.7,
      p95FrameTime: 20,
      avgUpdateTime: 1,
      avgRenderTime: 1,
      framesDropped: 1,
      frameDropRate: 1,
      totalFrames: 100,
    },
    environment: {
      userAgent: 'legacy',
      screenWidth: 1280,
      screenHeight: 800,
      devicePixelRatio: 1,
      hardwareConcurrency: 8,
      timestamp: '2026-11-08T00:00:00Z',
    },
  };
  await page.evaluate(
    (value) => (window as any).laboratory.importHistory(JSON.stringify([value])),
    legacy,
  );
  await page.reload();
  await page.waitForFunction(() => !!(window as any).laboratory);
  expect(await page.evaluate(() => (window as any).laboratory.history())).toEqual([legacy]);
  await page.getByRole('button', { name: 'Benchmark', exact: true }).click();
  await page.getByRole('button', { name: 'View history', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Legacy history');
  await page.getByText('Workload and results', { exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('legacy-example');
  await page.getByRole('button', { name: 'Close history', exact: true }).click();
  await page.getByRole('button', { name: 'Import/Export', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Results', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^benchmark-results/);
});

test('WebGL effects render at zero, one, and maximum supported population', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.evaluate(() => (window as any).laboratory.renderer('WebGL'));
  test.skip((await state(page)).renderer !== 'WebGL', 'WebGL unavailable on this browser host');
  for (const count of [0, 1, 50000]) {
    await page.evaluate((value) => (window as any).laboratory.fixture(value), count);
    await expect(page.locator('#status')).toContainText(
      count.toLocaleString('en-US') + ' particles',
    );
  }
  await page.evaluate(() => {
    const lab = (window as any).laboratory;
    lab.fixture(100);
    const scene = lab.snapshot().scene;
    for (const plugin of Object.values(scene.plugins) as any[])
      if (plugin.kind === 'effect') plugin.state.enabled = true;
    scene.presentation.trails = true;
    scene.presentation.arrows = true;
    lab.scene(scene);
  });
  const download = page.waitForEvent('download');
  await page.locator('#capture').click();
  await download;
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/effects-desktop.png' });
});
