import {classificationEncryptionKey} from '/workspace/run-linen/tests/work/classification-cases.mjs';
import {applicationChecks} from '/workspace/run-linen/tests/work/application-cases.mjs';
import {lifecycleTemplateChecks} from '/workspace/run-linen/tests/work/lifecycle-template-cases.mjs';
import {searchChecks} from '/workspace/run-linen/tests/work/search-cases.mjs';
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire('/workspace/run-linen/package.json'),
  root = '/workspace/run-linen/';
const pnpm = await readdir(join(root, "node_modules/.pnpm"));
const { build } = require(
  join(
    root,
    "node_modules/.pnpm",
    pnpm.find((x) => x.startsWith("esbuild@")),
    "node_modules/esbuild",
  ),
);
const { Miniflare, convertV4MiniflareOptions } = require(
  join(
    root,
    "node_modules/.pnpm",
    pnpm.find((x) => x.startsWith("miniflare@")),
    "node_modules/miniflare",
  ),
);
const dir = await mkdtemp(join(tmpdir(), "linen-work-"));
const built = await build({
  entryPoints: [join(root, "tests/work/classification-worker.ts")],
  bundle: true,
  format: "esm",
  platform: "browser",
  write: false,
});
const options = {
  workers: [
    {
      name: "test",
      modules: true,
      script: built.outputFiles[0].text,
      compatibilityDate: "2026-09-01",
      d1Databases: { DB: "work-test" },
      r2Buckets: ["ATTACHMENTS"],
      bindings: { ENCRYPTION_KEY: classificationEncryptionKey, APP_ORIGIN: 'https://help.example.test', MAIL_PROVIDER: 'sendgrid', MAIL_API_KEY: 'synthetic-linen-2', MAIL_FROM: 'reports@example.test' },
    },
  ],
  d1Persist: join(dir, "d1"),
  r2Persist: join(dir, "r2"),
};
let mf = new Miniflare({
  ...convertV4MiniflareOptions({ ...options, port: Number(process.env.LINEN_TEST_WORKER_PORT || 0) }),
  resourcePersistencePath: dir,
});
async function api(path, body, headers = {}) {
  const response = await mf.dispatchFetch(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = (response.headers.get("content-type") || "").includes("json") ? await response.json() : await response.text();
  return { status: response.status, value, headers: response.headers };
}
async function uploadBytes(path, bytes, headers = {}) {
  const response = await mf.dispatchFetch(`http://localhost${path}`, { method: "POST", headers, body: bytes });
  return { status: response.status, value: await response.json() };
}
try {
  const db = await mf.getD1Database("DB");
  for (const file of (await readdir(join(root, "migrations")))
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(join(root, "migrations", file), "utf8");
    await db.exec(sql.replace(/^--.*$/gm, "").replace(/\n/g, " "));
  }
  await db.exec(
    `INSERT INTO workspaces VALUES('a','A','2026-01-01'); INSERT INTO users VALUES('owner','owner@test','Owner','unused','2026-01-01'); INSERT INTO users VALUES('employee','employee@test','Employee','unused','2026-01-01'); INSERT INTO users VALUES('stranger','stranger@test','Stranger','unused','2026-01-01'); INSERT INTO memberships VALUES('a','owner','["owner"]',1); INSERT INTO memberships VALUES('a','employee','["employee"]',1); INSERT INTO memberships VALUES('a','stranger','["employee"]',1);`,
  );
  await applicationChecks(api,db);
  console.log('PASS ACCESS-008 applicationChecks');
  await lifecycleTemplateChecks(api,db);
  console.log('PASS LIFE-002 lifecycleTemplateChecks');
  await searchChecks(api,db);
  console.log('PASS searchChecks including numeric identifier regression');
} finally { await mf.dispose(); await rm(dir,{recursive:true,force:true}); }
