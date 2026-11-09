import { departmentRoleChecks } from '../tests/work/department-role-cases.mjs';
import { reportBuilderChecks, biReadChecks, biExportChecks, reportScheduleChecks } from '../tests/work/report-cases.mjs';
import { biAdapterChecks } from '../tests/work/bi-adapter-cases.mjs';
import { historyErasureChecks } from '../tests/work/history-erasure-cases.mjs';
import { departmentSpaceChecks } from '../tests/work/department-space-cases.mjs';
import { departmentOpsChecks } from '../tests/work/department-ops-cases.mjs';
import { departmentReportChecks } from '../tests/work/department-report-cases.mjs';
import { applicationChecks, catalogAudienceChecks } from '../tests/work/application-cases.mjs';
import { catalogQuoteChecks } from '../tests/work/catalog-quote-cases.mjs';
import { searchChecks } from '../tests/work/search-cases.mjs';
import { problemDetectionChecks } from '../tests/work/problem-detection-cases.mjs';
import { responseChecks } from '../tests/work/response-cases.mjs';
import { recurrenceChecks } from '../tests/work/recurrence-cases.mjs';
import { slaPolicyChecks, escalationChecks } from '../tests/work/sla-policy-cases.mjs';
import { deskFieldChecks } from '../tests/work/desk-field-cases.mjs';
import { deskGroupChecks } from '../tests/work/desk-group-cases.mjs';
import { deskRoutingChecks } from '../tests/work/desk-routing-cases.mjs';
import { deskScenarioChecks, deskActivityChecks } from '../tests/work/desk-scenario-cases.mjs';
import { projectChecks } from '../tests/work/project-cases.mjs';
import { relationshipChecks, sharingChecks, collaborationChecks } from '../tests/work/relationship-cases.mjs';
import { mailChannelChecks } from '../tests/work/mail-cases.mjs';
import { walkupPhoneChecks } from '../tests/work/walkup-cases.mjs';
import { handoffChecks } from '../tests/work/handoff-cases.mjs';
import { brandChecks } from '../tests/work/brand-cases.mjs';
import { assetFinancialChecks } from '../tests/work/asset-financial-cases.mjs';
import { timeChecks } from "../tests/work/time-cases.mjs";
import { problemChecks } from "../tests/work/problem-cases.mjs";
import { assetCustodyChecks, assetAuditChecks, assetStockChecks } from "../tests/work/asset-custody-cases.mjs";
import { assetContractChecks } from "../tests/work/asset-contract-cases.mjs";
import { classificationChecks, classificationEncryptionKey } from "../tests/work/classification-cases.mjs";
import { lifecycleEvidenceChecks } from "../tests/work/lifecycle-evidence-cases.mjs";
import { accessPolicyChecks } from "../tests/work/access-policy-cases.mjs";
import { lifecycleTemplateChecks } from "../tests/work/lifecycle-template-cases.mjs";
import { lifecycleReplayChecks, lifecycleIntegrationChecks, contractorSponsorChecks } from "../tests/work/lifecycle-regressions.mjs";
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = process.cwd();
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
async function api(path, body, headers = {}, method = body === undefined ? "GET" : "POST") {
  const response = await mf.dispatchFetch(`http://localhost${path}`, {
    method,
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
  await searchChecks(api,db);
  await projectChecks(api,db);
} finally {
  await mf.dispose();
  await rm(dir, { recursive: true, force: true });
}
