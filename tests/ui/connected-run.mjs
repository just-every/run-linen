import { spawn } from "node:child_process";
import { mkdtemp, rm, mkdir, open, cp, writeFile } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { startWorker } from "./worker-server.mjs";
const root = resolve(import.meta.dirname, "../.."),
  scratch = await mkdtemp(join(tmpdir(), "linen-connected-ui-")),
  out = resolve(
    process.env.LINEN_TEST_OUTPUT ||
      join(root, ".wrangler", "ui-evidence", String(Date.now())),
  );
await mkdir(out, { recursive: true });
const log = await open(join(out, "worker.log"), "a");
let worker, workerOptions;
const liveReadOnly = process.argv[4] === '--live-read-only';
async function stopWorker() {
  await worker?.dispose();
  worker = undefined;
}
async function browserCheck(file,url) {
  await new Promise((yes,no)=>{const child=spawn(process.execPath,[file],{cwd:root,stdio:"inherit",env:{...process.env,HOME:userInfo().homedir,LINEN_TEST_URL:url,LINEN_TEST_OUTPUT:out}});child.on("error",no);child.on("exit",code=>code===0?yes():no(Error(`Browser acceptance exited ${code}`)));});
}
async function command(bin, args) {
  await new Promise((yes, no) => {
    const child = spawn(bin, args, {
      cwd: root,
      stdio: ["ignore", log.fd, log.fd],
    });
    child.on("error", no);
    child.on("exit", (code) =>
      code === 0
        ? yes()
        : no(
            Error(
              `${bin} ${args.join(" ")} exited ${code}; inspect ${out}/worker.log`,
            ),
          ),
    );
  });
}
async function port() {
  const socket = createServer();
  await new Promise((r) => socket.listen(Number(process.env.LINEN_TEST_PORT || 0), "127.0.0.1", r));
  const value = socket.address().port;
  await new Promise((r) => socket.close(r));
  return value;
}
try {
  let url = process.env.LINEN_TEST_URL;
  if (!url) {
    await command("pnpm", ["build"]);
    await cp(join(root, "dist"), join(scratch, "dist"), { recursive: true });
    if (!liveReadOnly) await cp(resolve(root, process.env.LINEN_TEST_PROVIDER_BOUNDARY || 'tests/ui/provider-boundary.mjs'), join(scratch, 'dist/server/provider-boundary.mjs'));
    await writeFile(join(scratch, 'dist/server/journey-wrapper.js'), `import product from './index.js';
${liveReadOnly ? '' : "import {bind, fixtureRequest} from './provider-boundary.mjs';"}
export default {...product, async fetch(request, env, ctx) { ${liveReadOnly ? '' : 'bind(env);'} if (new URL(request.url).pathname === '${liveReadOnly ? '/__journey/tick' : '/__fixture/tick'}') { await product.scheduled({scheduledTime:Date.now(),cron:'* * * * *'},env,ctx); return Response.json({ticked:true}); } return ${liveReadOnly ? '' : 'await fixtureRequest(request, env) || '}product.fetch(request, env, ctx); }};
`);
    const { readFile } = await import('node:fs/promises');
    const configPath = join(scratch, 'dist/server/wrangler.json');
    const config = JSON.parse(await readFile(configPath, 'utf8'));
    config.main = 'journey-wrapper.js';
    await writeFile(configPath, JSON.stringify(config));
    const value = await port();
    url = `http://127.0.0.1:${value}`;
    await command(process.execPath, [
      "node_modules/wrangler/bin/wrangler.js",
      "d1",
      "migrations",
      "apply",
      "DB",
      "--local",
      "--persist-to",
      join(scratch, "state"),
      "--config",
      "wrangler.jsonc",
    ]);
    workerOptions = {
      config: configPath,
      port: value,
      persistTo: join(scratch, "state"),
      vars: { AUTH_ORIGIN: url, APP_ORIGIN: url, AUTH_LOCAL: "true", MAIL_PROVIDER: "development",
        SESSION_SECRET: randomBytes(32).toString("hex"), ENCRYPTION_KEY: randomBytes(32).toString("base64") },
      logFd: log.fd,
    };
    worker = await startWorker(workerOptions);
    const r = await fetch(url + "/api/v1/setup");
    if (!r.ok) throw Error("Isolated worker did not become ready");
    if (!(await r.json()).required) throw Error("Isolated database is not empty");
  }
  if (!liveReadOnly) await fetch(url + "/__fixture/init", { method: "POST" });
  await browserCheck(process.argv[2] || "tests/ui/connected-browser.mjs",url);
  if(workerOptions && (!process.argv[2] || process.argv[3])) {
    await stopWorker();
    worker=await startWorker(workerOptions);
    const r=await fetch(url+'/api/v1/setup');
    if(!r.ok || (await r.json()).required)throw Error('Persisted worker failed to restart');
    await browserCheck(process.argv[3] || "tests/ui/connected-restart.mjs",url);
  }
  console.log(`UI evidence: ${out}`);
} finally {
  await stopWorker();
  await log.close();
  await rm(scratch, { recursive: true, force: true });
}
