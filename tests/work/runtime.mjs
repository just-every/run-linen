import { historyErasureChecks } from './history-erasure-cases.mjs';
import { departmentSpaceChecks } from './department-space-cases.mjs';
import { departmentOpsChecks } from './department-ops-cases.mjs';
import { departmentReportChecks } from './department-report-cases.mjs';
import { applicationChecks, catalogAudienceChecks } from './application-cases.mjs';
import { catalogQuoteChecks } from './catalog-quote-cases.mjs';
import { searchChecks } from './search-cases.mjs';
import { problemDetectionChecks } from './problem-detection-cases.mjs';
import { responseChecks } from './response-cases.mjs';
import { recurrenceChecks } from './recurrence-cases.mjs';
import { slaPolicyChecks, escalationChecks } from './sla-policy-cases.mjs';
import { deskFieldChecks } from './desk-field-cases.mjs';
import { deskGroupChecks } from './desk-group-cases.mjs';
import { deskRoutingChecks } from './desk-routing-cases.mjs';
import { deskScenarioChecks, deskActivityChecks } from './desk-scenario-cases.mjs';
import { projectChecks } from './project-cases.mjs';
import { relationshipChecks, sharingChecks, collaborationChecks } from './relationship-cases.mjs';
import { assetFinancialChecks } from './asset-financial-cases.mjs';
import { timeChecks } from "./time-cases.mjs";
import { problemChecks } from "./problem-cases.mjs";
import { assetCustodyChecks, assetAuditChecks, assetStockChecks } from "./asset-custody-cases.mjs";
import { assetContractChecks } from "./asset-contract-cases.mjs";
import { classificationChecks, classificationEncryptionKey } from "./classification-cases.mjs";
import { lifecycleEvidenceChecks } from "./lifecycle-evidence-cases.mjs";
import { accessPolicyChecks } from "./access-policy-cases.mjs";
import { lifecycleTemplateChecks } from "./lifecycle-template-cases.mjs";
import { lifecycleReplayChecks, lifecycleIntegrationChecks, contractorSponsorChecks } from "./lifecycle-regressions.mjs";
import assert from "node:assert/strict";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  root = new URL("../../", import.meta.url).pathname;
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
      bindings: { ENCRYPTION_KEY: classificationEncryptionKey },
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
  await historyErasureChecks(api,db);
  await departmentSpaceChecks(api,db,uploadBytes);
  await departmentReportChecks(api,db);
  await departmentOpsChecks(api,db);
  await catalogAudienceChecks(api,db);
  const collaborationProof=await collaborationChecks(api,db);
  await catalogQuoteChecks(api,db,uploadBytes,await mf.getR2Bucket('ATTACHMENTS'));
  await applicationChecks(api,db);
  const proposalProof=await problemDetectionChecks(api,db);
  await recurrenceChecks(api,db);
  await slaPolicyChecks(api,db);
  await escalationChecks(api,db);
  await deskFieldChecks(api,db);
  await deskGroupChecks(api,db);
  await deskRoutingChecks(api,db);
  await deskScenarioChecks(api,db);
  await deskActivityChecks(api);
  const cal = {
    timezone: "America/New_York",
    weekdays: [1, 2, 3, 4, 5],
    startHour: 9,
    endHour: 17,
    holidays: [],
  };
  assert.equal(
    (
      await api("/test/calendar", {
        start: "2026-10-30T20:00:00Z",
        minutes: 120,
        calendar: cal,
      })
    ).value.due,
    "2026-11-02T15:00:00.000Z",
  );
  assert.equal(
    (
      await api("/test/calendar", {
        start: "2026-10-30T20:00:00Z",
        minutes: 120,
        calendar: { ...cal, holidays: ["2026-11-02"] },
      })
    ).value.due,
    "2026-11-03T15:00:00.000Z",
  );
  const employee = { "x-user": "employee", "x-roles": '["employee"]' };
  const classifiedId=await classificationChecks({ api, db });
  await responseChecks({ api, db });
  const created = await api(
    "/work",
    { title: "Access", body: "Need access", deduplicationKey: "r1" },
    employee,
  );
  assert.equal(created.status, 201, JSON.stringify(created));
  const w = created.value.id;
  assert.equal(
    (
      await api(
        "/work",
        { title: "Access", body: "Need access", deduplicationKey: "r1" },
        employee,
      )
    ).value.id,
    w,
  );
  assert.equal(
    (
      await api(
        "/work",
        { title: "Different", body: "Need access", deduplicationKey: "r1" },
        employee,
      )
    ).status,
    409,
  );
  assert.equal(
    (await api(`/work/${w}`, undefined, { "x-workspace": "b" })).status,
    404,
  );
  assert.equal(
    (
      await api(`/work/${w}`, undefined, {
        "x-user": "stranger",
        "x-roles": '["employee"]',
      })
    ).status,
    404,
  );
  await api(`/work/${w}/messages`, {
    body: "Secret operator note",
    visibility: "private",
    sourceMessageId: "p1",
  });
  assert.equal(
    (await api(`/work/${w}`, undefined, employee)).value.messages.length,
    1,
  );
  assert.equal(
    (
      await api(
        `/work/${w}/messages`,
        {
          body: "Secret operator note",
          visibility: "public",
          sourceMessageId: "p1",
        },
        employee,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await api(
        `/work/${w}/commands`,
        { revision: 1, command: "reopen", reason: "Still broken" },
        employee,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        `/work/${w}/commands`,
        { revision: 1, command: "reopen", reason: "Concurrent" },
        employee,
      )
    ).status,
    409,
  );
  const confidential = await api(
    "/work",
    {
      title: "Restricted case",
      body: "Need confidential help",
      deduplicationKey: "restricted",
      sensitivity: "restricted",
    },
    employee,
  );
  assert.equal(confidential.status, 201);
  await db
    .prepare("UPDATE memberships SET roles_json=? WHERE user_id=?")
    .bind('["operator"]', "stranger")
    .run();
  const strangerOperator = { "x-user": "stranger", "x-roles": '["operator"]' };
  assert.equal(
    (await api(`/work/${confidential.value.id}`, undefined, strangerOperator))
      .status,
    404,
  );
  assert.ok(
    !(await api("/work", undefined, strangerOperator)).value.items.some(
      (x) => x.id === confidential.value.id,
    ),
  );
  await db
    .prepare("UPDATE memberships SET roles_json=? WHERE user_id=?")
    .bind('["employee"]', "stranger")
    .run();
  const intakeClaim = await api("/test/intake-port", { workId: w }, employee);
  assert.equal(intakeClaim.status, 200);
  assert.equal(intakeClaim.value.claimed, true);
  assert.equal(intakeClaim.value.concurrent, false);
  const person = await api("/people", {
    source: "hr",
    sourceId: "42",
    name: "Alex",
    effectiveAt: "2026-09-01T00:00:00Z",
    observedAt: "2026-09-01T00:00:00Z",
  });
  assert.equal(person.status, 201, JSON.stringify(person));
  const asset = await api("/assets", {
    serial: "SERIAL-1",
    source: "purchase",
  });
  assert.equal(asset.status, 201);
  assert.equal(
    (await api("/assets", { serial: "SERIAL-1", source: "mdm" })).status,
    409,
  );
  assert.equal(
    (
      await api(`/assets/${asset.value.id}/commands`, {
        revision: 1,
        command: "assign",
        personId: person.value.id,
        evidence: "IT physical allocation",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api(`/assets/${asset.value.id}/commands`, {
        revision: 2,
        command: "dispose",
        evidence: "Invalid disposal",
      })
    ).status,
    422,
  );
  await assetCustodyChecks(api, person.value.id);
  await assetAuditChecks(api, person.value.id);
  await assetStockChecks(api, person.value.id);
  await assetContractChecks(api,db);
  await assetFinancialChecks(api,(path,headers={})=>mf.dispatchFetch(`http://localhost${path}`,{headers}));
  const lifecycle = {
    personId: person.value.id,
    kind: "join",
    effectiveAt: "2026-11-01T01:30:00",
    timezone: "America/New_York",
    source: "hr",
    sourceRevision: 1,
    identityTarget: "alex@example.test",
    retained: [],
    added: ["engineering"],
    removed: [],
    deviceIds: [asset.value.id],
    ownerId: "owner",
  };
  assert.equal((await api("/lifecycle", lifecycle)).status, 422);
  lifecycle.effectiveAt = "2026-09-01T00:00:00Z";
  const life = await api("/lifecycle", lifecycle);
  assert.equal(life.status, 201, JSON.stringify(life));
  assert.equal(
    (await api(`/work/${life.value.work.id}`, undefined, employee)).status,
    404,
  );
  assert.equal(
    (await api("/lifecycle", lifecycle)).value.lifecycleId,
    life.value.lifecycleId,
  );
  await lifecycleReplayChecks(api, lifecycle, life.value.lifecycleId);
  const obligations = (await api(`/lifecycle/${life.value.lifecycleId}`)).value
    .obligations;
  assert.equal(obligations.length, 3);
  const due = await api("/work/process-due", {});
  assert.equal(due.status, 200, JSON.stringify(due));
  assert.equal(
    due.value.items.find(
      (o) => o.id === obligations.find((x) => x.kind === "identity.create").id,
    ).state,
    "blocked",
  );
  await db
    .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
    .bind("issuer", "issuer@test", "Issuer", "unused", new Date().toISOString())
    .run();
  await db
    .prepare("INSERT INTO memberships VALUES(?,?,?,1)")
    .bind("a", "issuer", '["owner"]')
    .run();
  await db
    .prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)")
    .bind(
      "identity-connection",
      "a",
      "entra",
      "Fixture identity",
      "{}",
      null,
      "unverified",
      new Date().toISOString(),
      new Date().toISOString(),
    )
    .run();
  const identityObligation = obligations.find(
    (x) => x.kind === "identity.create",
  );
  const payload = { displayName: "Alex", mailNickname: "alex" };
  const payloadHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(payload)),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  const grant = await api(
    "/test/grant",
    {
      id: "identity-grant",
      principalId: "owner",
      action: "identity.create",
      actionVersion: 1,
      target: "alex@example.test",
      beneficiaryId: person.value.id,
      connectionId: "identity-connection",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      maxUses: 10,
      conditions: { payloadHash },
    },
    { "x-user": "issuer" },
  );
  assert.equal(grant.status, 200, JSON.stringify(grant));
  assert.equal(
    (
      await api(`/obligations/${identityObligation.id}/execution`, {
        action: "identity.create",
        actionVersion: 1,
        target: "alex@example.test",
        beneficiaryId: person.value.id,
        connectionId: "identity-connection",
        grantId: "identity-grant",
        grantVersion: 1,
        payload,
      })
    ).status,
    200,
  );
  const processed = await api("/work/process-due", {});
  assert.equal(processed.status, 200, JSON.stringify(processed));
  const identityRow = await db
    .prepare("SELECT * FROM work_obligations WHERE id=?")
    .bind(identityObligation.id)
    .first();
  assert.equal(identityRow.state, "executing", JSON.stringify(identityRow));
  assert.ok(identityRow.operation_id);
  await api("/work/process-due", {});
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) count FROM execution_operations")
        .first()
    ).count,
    1,
  );
  const cancelled = await api(`/lifecycle/${life.value.lifecycleId}/amend`, {
    revision: 1,
    cancel: true,
  });
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled));
  const afterCancel = (await api(`/lifecycle/${life.value.lifecycleId}`)).value
    .obligations;
  assert.ok(afterCancel.some((o) => o.kind === "identity.disable"));
  assert.ok(afterCancel.some((o) => o.kind === "sessions.revoke"));
  assert.equal(
    (await api(`/work/${life.value.work.id}`)).value.work.revision,
    2,
  );
  await lifecycleReplayChecks(api, lifecycle, life.value.lifecycleId);
  await lifecycleIntegrationChecks(api, db, lifecycle);
  await contractorSponsorChecks(api, db, lifecycle);
  await lifecycleEvidenceChecks(api, db);
  await accessPolicyChecks(api, db);
  await lifecycleTemplateChecks(api, db);
  const catalog = await api("/catalog", {
    name: "Editor licence",
    kind: "software",
    target: "sku-editor",
    ownerId: "owner",
    capacity: 1,
  });
  assert.equal(catalog.status, 201);
  assert.equal(
    (
      await api(
        `/work/${w}/fulfilment`,
        {
          catalogId: catalog.value.id,
          beneficiaryId: "employee",
          purpose: "Code editing",
        },
        employee,
      )
    ).status,
    201,
  );
  const accessDuty = (await api(`/work/${w}/obligations`)).value.items.find(
    (x) => x.kind === "access.grant",
  );
  await db
    .prepare(
      "INSERT INTO execution_subject_mappings(id,workspace_id,connection_id,connection_revision,local_user_id,provider_subject,revision,active,observed_at,reviewed_by,local_kind,local_source_json) VALUES(?,?,?,?,?,?,1,1,?,?,?,?)",
    )
    .bind(
      "fixture-reviewed-map",
      "a",
      "identity-connection",
      1,
      "employee",
      "graph-distinct-subject",
      new Date().toISOString(),
      "issuer",
      "member",
      JSON.stringify({ userId: "employee" }),
    )
    .run();
  const mappedGrant = await api(
    "/test/grant",
    {
      id: "mapped-grant",
      principalId: "owner",
      action: "license.add",
      actionVersion: 1,
      target: "sku-editor",
      beneficiaryId: "graph-distinct-subject",
      localBeneficiaryId: "employee",
      connectionId: "identity-connection",
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: "2030-01-01T00:00:00.000Z",
      maxUses: 10,
      conditions: {},
    },
    { "x-user": "issuer" },
  );
  assert.equal(mappedGrant.status, 200, JSON.stringify(mappedGrant));
  const mappedStep = {
    action: "license.add",
    actionVersion: 1,
    target: "sku-editor",
    beneficiaryId: "graph-distinct-subject",
    localBeneficiaryId: "employee",
    connectionId: "identity-connection",
    grantId: "mapped-grant",
    grantVersion: 1,
    mappingId: "fixture-reviewed-map",
    mappingRevision: 1,
  };
  assert.equal(
    (await api(`/obligations/${accessDuty.id}/execution`, mappedStep)).status,
    200,
  );
  assert.equal(
    (
      await api(`/obligations/${accessDuty.id}/execution`, {
        ...mappedStep,
        localBeneficiaryId: "stranger",
      })
    ).status,
    422,
  );
  await api("/work/process-due", {});
  const accessOperation = await db
    .prepare(
      "SELECT e.step_json FROM execution_operations e JOIN work_obligations o ON o.operation_id=e.id WHERE o.id=?",
    )
    .bind(accessDuty.id)
    .first();
  assert.ok(accessOperation);
  assert.equal(
    JSON.parse(accessOperation.step_json).beneficiaryId,
    "graph-distinct-subject",
  );
  assert.equal(
    JSON.parse(accessOperation.step_json).localBeneficiaryId,
    "employee",
  );
  await timeChecks(api, db, w, accessDuty.id);
  const article = await api("/knowledge", {
    title: "VPN",
    body: "Reviewed network guidance",
    scope: "employees",
    expiresAt: "2030-01-01T00:00:00Z",
    review: true,
  });
  assert.equal(article.status, 201, JSON.stringify(article));
  assert.equal(
    (await api("/knowledge?q=VPN", undefined, employee)).value.items.length,
    1,
  );
  await api("/knowledge", {
    title: "HR private",
    body: "Private guidance",
    scope: "hr",
    expiresAt: "2030-01-01T00:00:00Z",
    review: true,
  });
  assert.equal(
    (await api("/knowledge", undefined, employee)).value.items.length,
    1,
  );
  const escalated = await api(
    `/knowledge/${article.value.id}/escalate`,
    { question: "Still failing", deduplicationKey: "escalate" },
    employee,
  );
  assert.equal(escalated.status, 201);
  assert.equal(JSON.parse(escalated.value.context_json).articleRevision, 1);
  const upload = await mf.dispatchFetch(
    `http://localhost/work/${w}/attachments`,
    {
      method: "POST",
      headers: { "X-Filename": "private.txt", "X-Visibility": "private" },
      body: "private bytes",
    },
  );
  assert.equal(upload.status, 201);
  const attachment = await upload.json();
  assert.equal(
    (
      await mf.dispatchFetch(`http://localhost/attachments/${attachment.id}`, {
        headers: employee,
      })
    ).status,
    404,
  );
  assert.equal(
    await (
      await mf.dispatchFetch(`http://localhost/attachments/${attachment.id}`)
    ).text(),
    "private bytes",
  );
  const sourceRecord = await db
    .prepare("SELECT * FROM work_records WHERE id=?")
    .bind(w)
    .first();
  const restoredId = crypto.randomUUID();
  const restored = { ...sourceRecord, id: restoredId, dedup_key: "restore-1" };
  assert.equal(
    (
      await api("/test/restore", {
        table: "work_records",
        row: restored,
        sourceId: "backup",
        sourceKey: "record",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api("/test/restore", {
        table: "work_messages",
        row: {
          id: crypto.randomUUID(),
          workspace_id: "a",
          work_id: restoredId,
          author_id: "owner",
          visibility: "private",
          body: "Restored secret",
          source_key: "old-private",
          created_at: new Date().toISOString(),
        },
        sourceId: "backup",
        sourceKey: "message",
      })
    ).status,
    200,
  );
  assert.equal(
    (await api(`/work/${restoredId}`, undefined, employee)).value.messages
      .length,
    0,
  );
  const oldAttachment = await db
    .prepare("SELECT * FROM work_attachments WHERE id=?")
    .bind(attachment.id)
    .first();
  const restoredAttachment = {
    ...oldAttachment,
    id: crypto.randomUUID(),
    work_id: restoredId,
  };
  assert.equal(
    (
      await api("/test/restore", {
        table: "work_attachments",
        row: restoredAttachment,
        sourceId: "backup",
        sourceKey: "attachment",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await mf.dispatchFetch(
        `http://localhost/attachments/${restoredAttachment.id}`,
        { headers: employee },
      )
    ).status,
    404,
  );
  const duty = {
    id: crypto.randomUUID(),
    workspace_id: "a",
    work_id: restoredId,
    kind: "access.revoke",
    target: "engineering",
    beneficiary_id: "employee",
    due_at: new Date().toISOString(),
    state: "executing",
    operation_id: "source-uncertain-operation",
    revision: 1,
  };
  assert.equal(
    (
      await api("/test/restore", {
        table: "work_obligations",
        row: duty,
        sourceId: "backup",
        sourceKey: "duty",
      })
    ).status,
    200,
  );
  const restoredDuty = (await api(`/work/${restoredId}/obligations`)).value
    .items[0];
  assert.equal(restoredDuty.state, "blocked");
  assert.equal(restoredDuty.operation_id, null);
  assert.match(restoredDuty.last_error, /source-uncertain-operation/);
  await problemChecks(api, db);
  await db
    .prepare("UPDATE memberships SET active=0 WHERE user_id=?")
    .bind("employee")
    .run();
  assert.equal((await api(`/work/${w}`, undefined, employee)).status, 404);
  await db
    .prepare("UPDATE memberships SET active=1 WHERE user_id=?")
    .bind("employee")
    .run();
  await searchChecks(api,db);
  const taskHistoryProof = await projectChecks(api, db);
  await relationshipChecks(api,db);
  await sharingChecks(api, db);
  await mf.dispose();
  mf = new Miniflare({
    ...convertV4MiniflareOptions({ ...options, port: Number(process.env.LINEN_TEST_WORKER_PORT || 0) }),
    resourcePersistencePath: dir,
  });
  assert.deepEqual((await api(taskHistoryProof.historyPath)).value.items, taskHistoryProof.items, 'DESK-017 original project-task history survives a Worker restart');
  assert.equal((await api(`/work/${w}`, undefined, employee)).value.work.id, w);
  const restartedProposals=(await api('/problem-proposals/detect',{})).value.items;
  assert.equal(restartedProposals.filter(p=>p.id===proposalProof.rejectedId).length,1,'PROB-002 rejected semantic cluster survives Worker restart');
  assert.equal(restartedProposals.find(p=>p.id===proposalProof.rejectedId).data.state,'rejected');
  assert.equal((await api(`/problems/${proposalProof.problemId}`)).value.data.sourceProposalId,proposalProof.acceptedId);
  const classificationHistoryBefore=(await api(`/work/${classifiedId}/classification`)).value.history;
  const erased = await api("/people/employee/erase", {
    revision: 1,
    reason: "Fixture member erasure without HR record",
  });
  assert.equal(erased.status, 200, JSON.stringify(erased));
  assert.equal(erased.value.state, "erased");
  assert.ok((await api(`/work/${collaborationProof.workId}`)).value.messages.every(m=>m.body==='[erased]'),'DESK-007 public erasure clears private mentions and both directions of side mail');
  const restartedDb = await mf.getD1Database('DB');
  assert.equal((await restartedDb.prepare('SELECT COUNT(*) n FROM work_watchers WHERE work_id=?').bind(collaborationProof.workId).first()).n,0);
  assert.equal((await restartedDb.prepare('SELECT COUNT(*) n FROM work_collaboration_notices WHERE work_id=?').bind(collaborationProof.workId).first()).n,0);
  assert.ok((await restartedDb.prepare('SELECT vendor_email,closed_at FROM work_side_conversations WHERE work_id=?').bind(collaborationProof.workId).all()).results.every(s=>s.vendor_email==='[erased]'&&s.closed_at),'DESK-007 erasure clears recipient metadata and withdraws mail authority');
  assert.equal((await api(`/work/${collaborationProof.workId}/collaboration`)).status,409);
  const erasedTaskHistory = (await api(taskHistoryProof.historyPath)).value.items;
  assert.deepEqual(erasedTaskHistory.map(e => e.id), taskHistoryProof.items.map(e => e.id), 'DESK-017 erasure retains every project-task event');
  assert.deepEqual(erasedTaskHistory,taskHistoryProof.items,'DESK-017 erasing an unrelated person leaves original task history unchanged');
  const erasedClassification=(await api(`/work/${classifiedId}/classification`)).value;
  assert.equal(erasedClassification.current,null,"DESK-002 authorized erasure clears classification content");
  assert.deepEqual(erasedClassification.history.map(e=>[e.id,e.created_at]),classificationHistoryBefore.map(e=>[e.id,e.created_at]),'DESK-017 erasure retains classification event identity and time');
  for(const original of classificationHistoryBefore){
    const entry=erasedClassification.history.find(e=>e.id===original.id);
    assert.equal(entry.redacted,'erasure');assert.ok(Number.isFinite(Date.parse(entry.redactedAt)));
    for(const c of original.changes.filter(c=>['type','category','subcategory','impact','urgency','priority'].includes(c.field)))
      assert.deepEqual(entry.changes.find(n=>n.field===c.field),c,'DESK-017 approved original classification facts survive erasure');
    assert.equal(entry.reason,'[erased]','Free-text classification reason is removed');
  }
  assert.equal((await api(`/work/${w}`)).value.work.title, "[erased]");
  assert.equal(
    (await mf.dispatchFetch(`http://localhost/attachments/${attachment.id}`))
      .status,
    404,
  );
  assert.equal(
    (
      await api("/test/restore", {
        table: "work_records",
        row: {
          ...sourceRecord,
          id: crypto.randomUUID(),
          dedup_key: "erasure-replay",
        },
        sourceId: "backup-after-erasure",
        sourceKey: "record",
      })
    ).status,
    409,
  );
  const erasedTaskActor = await api('/people/search-agent/erase', { revision: 0, reason: 'DESK-017 fixture actor erasure' });
  assert.equal(erasedTaskActor.status, 200, JSON.stringify(erasedTaskActor));
  const anonymizedTaskHistory = (await api(taskHistoryProof.historyPath)).value.items;
  assert.ok(anonymizedTaskHistory.some(e=>e.actor==='Erased person'&&!e.initiatedBy),'DESK-017 erased task actor is unlinkable');
  assert.deepEqual(anonymizedTaskHistory.map(e => e.id), taskHistoryProof.items.map(e => e.id));
  assert.deepEqual(anonymizedTaskHistory.map(e=>e.at),taskHistoryProof.items.map(e=>e.at),'Original event times remain unchanged');
  const creation=anonymizedTaskHistory.find(e=>e.id===taskHistoryProof.items[0].id);
  assert.equal(creation.redacted,'erasure');assert.ok(Number.isFinite(Date.parse(creation.redactedAt)));
  assert.equal(creation.changes.find(c=>c.field==='title').after,'[erased]','Free-text task title is removed');
  assert.equal(creation.changes.find(c=>c.field==='owner').after,'Erased person','Erased person-valued field is removed');
  for(const original of taskHistoryProof.items){
    const entry=anonymizedTaskHistory.find(e=>e.id===original.id);
    for(const c of original.changes.filter(c=>['state','dueDate','dependencies','asset link'].includes(c.field)))
      assert.deepEqual(entry.changes.find(n=>n.field===c.field),c,'Original approved task state, timing and link facts remain exact');
  }
  assert.ok(!JSON.stringify(anonymizedTaskHistory).includes('search-agent'),'Erased account identifier is absent from the public history projection');
  await restartedDb.prepare("UPDATE work_project_tasks SET title='synthetic-linen-91' WHERE id=(SELECT target FROM audit_events WHERE id=?)").bind(creation.id).run();
  assert.deepEqual((await api(taskHistoryProof.historyPath)).value.items,anonymizedTaskHistory,'Removed task title is never reconstructed from mutable current state');
  console.log(
    "WORK runtime passed: D1/R2 restart, scoped/revoked membership, restricted/HR/private data, dedup/CAS, custody, DST/holidays, JML dependencies/cancellation, identity and distinct mapped-subject intents, knowledge/escalation, leased intake, native held restore and member erasure/replay denial",
  );
} finally {
  await mf.dispose();
  await rm(dir, { recursive: true, force: true });
}
