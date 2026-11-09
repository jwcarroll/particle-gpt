import { chromium } from '@playwright/test';
import { build, preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
await build({ mode: 'test', build: { outDir: 'dist-test' } });
const server = await preview({
  build: { outDir: 'dist-test' },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true, open: false },
});
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  });
  await page.goto('http://127.0.0.1:4175');
  await page.waitForFunction(() => !!window.laboratory);
  const result = await page.evaluate(() => window.laboratory.profile());
  await mkdir('docs/evidence', { recursive: true });
  const name = process.argv[2] || 'profile';
  if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid evidence name');
  await writeFile('docs/evidence/' + name + '.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.runs));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
