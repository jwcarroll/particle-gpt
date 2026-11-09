import { build, preview } from 'vite';

export default async function setup() {
  await build({ mode: 'test', build: { outDir: 'dist-test' } });
  const server = await preview({
    build: { outDir: 'dist-test' },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, open: false },
  });
  return async () => {
    await new Promise<void>((resolve, reject) =>
      server.httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  };
}
