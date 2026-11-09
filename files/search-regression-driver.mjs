import { departmentRoleChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/department-role-cases.mjs';
import { reportBuilderChecks, biReadChecks, biExportChecks, reportScheduleChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/report-cases.mjs';
import { biAdapterChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/bi-adapter-cases.mjs';
import { historyErasureChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/history-erasure-cases.mjs';
import { departmentSpaceChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/department-space-cases.mjs';
import { departmentOpsChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/department-ops-cases.mjs';
import { departmentReportChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/department-report-cases.mjs';
import { applicationChecks, catalogAudienceChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/application-cases.mjs';
import { catalogQuoteChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/catalog-quote-cases.mjs';
import { searchChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/search-cases.mjs';
import { problemDetectionChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/problem-detection-cases.mjs';
import { responseChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/response-cases.mjs';
import { recurrenceChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/recurrence-cases.mjs';
import { slaPolicyChecks, escalationChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/sla-policy-cases.mjs';
import { deskFieldChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/desk-field-cases.mjs';
import { deskGroupChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/desk-group-cases.mjs';
import { deskRoutingChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/desk-routing-cases.mjs';
import { deskScenarioChecks, deskActivityChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/desk-scenario-cases.mjs';
import { projectChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/project-cases.mjs';
import { relationshipChecks, sharingChecks, collaborationChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/relationship-cases.mjs';
import { mailChannelChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/mail-cases.mjs';
import { walkupPhoneChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/walkup-cases.mjs';
import { handoffChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/handoff-cases.mjs';
import { brandChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/brand-cases.mjs';
import { assetFinancialChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/asset-financial-cases.mjs';
import { timeChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/time-cases.mjs';
import { problemChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/problem-cases.mjs';
import { assetCustodyChecks, assetAuditChecks, assetStockChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/asset-custody-cases.mjs';
import { assetContractChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/asset-contract-cases.mjs';
import { classificationChecks, classificationEncryptionKey } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/classification-cases.mjs';
import { lifecycleEvidenceChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/lifecycle-evidence-cases.mjs';
import { accessPolicyChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/access-policy-cases.mjs';
import { lifecycleTemplateChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/lifecycle-template-cases.mjs';
import { lifecycleReplayChecks, lifecycleIntegrationChecks, contractorSponsorChecks } from '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen/tests/work/lifecycle-regressions.mjs';
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = '/home/agent/rer-consolidation/work/sx-linen-f19fix1/run-linen';
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
  if(path.includes('/search?q=synthetic-linen-20')) {
    console.log('SEARCH_DIAGNOSTIC',JSON.stringify({path,value}));
    const db=await mf.getD1Database('DB');
    for(const item of value.items??[])if(item.type==='ticket') {
      console.log('MATCHED_WORK',JSON.stringify(await db.prepare('SELECT * FROM work_records WHERE id=?').bind(item.id).first()));
      console.log('MATCHED_MESSAGES',JSON.stringify((await db.prepare('SELECT body,visibility FROM work_messages WHERE work_id=?').bind(item.id).all()).results));
    }
  }
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
  console.log('PASS focused application authority and lifecycle privacy');
} finally {
  await mf.dispose();
  await rm(dir, {recursive:true,force:true});
}
