import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { readdir } from 'node:fs/promises';
import { writeSync } from 'node:fs';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';

// Serve the emitted Worker with the Miniflare that the pinned wrangler runs, without
// `wrangler dev`'s ProxyWorker hop. That hop pools keep-alive connections to the Worker
// with the same 5s idle limit the Worker's server closes them at, and only retries GET
// and HEAD, so a POST that lands on a closing connection reaches the client as a 500
// "Error: Network connection lost." the application never saw. Production has no such hop.
const { Miniflare, Log, LogLevel, convertV4MiniflareOptions } = createRequire(import.meta.resolve('wrangler'))('miniflare');

class FileLog extends Log {
  constructor(fd) { super(LogLevel.INFO); this.fd = fd; }
  log(message) { writeSync(this.fd, message + '\n'); }
}

export async function startWorker({ config, port, persistTo, vars, logFd }) {
  const { workerOptions: { modulesRules, ...workerOptions }, main } = unstable_getMiniflareWorkerOptions(config);
  // The emitted output is unbundled (`no_bundle`): load the entry first, then every other
  // ES module beside it, as wrangler does for its `**/*.js` and `**/*.mjs` module rules.
  const entry = resolve(dirname(config), main), modulesRoot = dirname(entry);
  const others = (await readdir(modulesRoot, { recursive: true }))
    .filter(name => /\.m?js$/.test(name)).map(name => join(modulesRoot, name)).filter(path => path !== entry);
  const worker = new Miniflare(convertV4MiniflareOptions({
    host: '127.0.0.1',
    port,
    resourcePersistencePath: join(persistTo, 'v3'),
    log: new FileLog(logFd),
    logRequests: true,
    handleStructuredLogs: ({ level, message }) => writeSync(logFd, `[${level}] ${message}\n`),
    workers: [{
      ...workerOptions,
      name: 'linen',
      modulesRoot,
      modules: [entry, ...others].map(path => ({ type: 'ESModule', path })),
      bindings: { ...workerOptions.bindings, ...vars },
    }],
  }));
  await worker.ready;
  return worker;
}
