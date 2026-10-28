import { applyMigrations } from '../sql-migrations.mjs';
import { notificationRuleChecks } from './notification-rule-cases.mjs';
import { createServer as createHttpServer } from "node:http";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url),
  wr = createRequire(require.resolve("wrangler/package.json"));
const { build } = wr("esbuild"),
  { Miniflare, convertV4MiniflareOptions } = wr("miniflare");
const dir = await mkdtemp(join(tmpdir(), "linen-execution-"));
let mf, nativeServer;
try {
  await build({
    entryPoints: ["tests/execution/worker.ts"],
    outfile: join(dir, "worker.mjs"),
    bundle: true,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({ port: Number(process.env.LINEN_TEST_WORKER_PORT || 0),
      modules: true,
      script: await readFile(join(dir, "worker.mjs"), "utf8"),
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      r2Buckets: ["ATTACHMENTS"],
      bindings: {
        ENCRYPTION_KEY: btoa("x".repeat(32)),
        SESSION_SECRET: "test-only",
      },
    }),
  );
  const db = await mf.getD1Database("DB");
  await applyMigrations(db);
  const time = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO workspaces VALUES('w','Fixture',?)").bind(time),
    ...["issuer", "actor", "other"].map((u) =>
      db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .bind(u, u + "@example.test", u, "none", time),
    ),
    ...["issuer", "actor", "other"].map((u) =>
      db
        .prepare("INSERT INTO memberships VALUES(?,?,?,1)")
        .bind("w", u, JSON.stringify([u === "issuer" ? "owner" : "operator"])),
    ),
    db.prepare("INSERT INTO workspace_settings VALUES('w','{}',1)"),
    db
      .prepare(
        "INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,created_at,updated_at,dedup_key) VALUES('work','w','actor','person','request','Fixture',?,?,'first')",
      )
      .bind(time, time),
  ]);
  async function call(path, body, user = "actor", workspace = "w") {
    const r = await mf.dispatchFetch("http://localhost" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        "Test-User": user,
        "Test-Workspace": workspace,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: r.status, body: await r.json() };
  }
  for (const [id, provider, config, secret] of [
    [
      "graph",
      "microsoft-graph",
      { tenantId: "tenant" },
      { clientId: "id", clientSecret: "test-only" },
    ],
    [
      "probe",
      "workflow-probe",
      {
        url: "https://probe.example.test/check",
        allowedHosts: ["probe.example.test"],
      },
      { token: "test-only" },
    ],
  ]) {
    const encrypted = (await call("/fixture/secret", secret)).body.secret;
    await db
      .prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)")
      .bind(
        id,
        "w",
        provider,
        id,
        JSON.stringify(config),
        encrypted,
        "active",
        time,
        time,
      )
      .run();
  }
  const oktaSecret = (await call('/fixture/secret', { apiToken: 'synthetic-linen-6' })).body.secret;
  await db.prepare("INSERT INTO connections VALUES('okta','w','okta','Okta',?,?, 'active',1,?,?)")
    .bind(JSON.stringify({orgUrl:'https://synthetic-linen-1.okta.com'}),oktaSecret,time,time).run();
  async function oktaOperation(action,target,beneficiaryId='synthetic-linen-2',revoke=false) {
    const payload = {}, payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    const grant = await call('/grants', {principalId:'actor',beneficiaryId,action,actionVersion:1,target,connectionId:'okta',validFrom:new Date(Date.now()-60000).toISOString(),validUntil:new Date(Date.now()+3600000).toISOString(),maxUses:10,conditions:{payloadHash}},'issuer');
    assert.equal(grant.status,201,JSON.stringify(grant));
    const plan = await call('/plans',{workId:'work',revision:1,idempotencyKey:crypto.randomUUID(),steps:[{action,actionVersion:1,target,beneficiaryId,connectionId:'okta',grantId:grant.body.id,grantVersion:grant.body.version,payload}]});
    assert.equal(plan.status,201,JSON.stringify(plan));
    const dispatched = await call(`/plans/${plan.body.id}/dispatch`,{expectedRevision:1});
    assert.equal(dispatched.status,200,JSON.stringify(dispatched));
    if(revoke) assert.equal((await call(`/grants/${grant.body.id}/revoke`,{version:grant.body.version},'issuer')).status,200);
    await call('/execution/process',{});
    return (await call('/operations')).body.find(o=>o.id===dispatched.body[0].id);
  }
  for(const [action,target,beneficiary] of [
    ['okta.group.add','synthetic-linen-5','synthetic-linen-2'],
    ['okta.app.assign','synthetic-linen-7','synthetic-linen-5'],
    ['okta.user.suspend','synthetic-linen-2','synthetic-linen-2'],
    ['okta.user.activate','synthetic-linen-2','synthetic-linen-2'],
  ]) assert.equal((await oktaOperation(action,target,beneficiary)).state,'effect_verified',action);
  await call('/fixture',{oktaWrongLog:true});
  const clearing = await oktaOperation('okta.sessions.clear','synthetic-linen-2');
  assert.equal(clearing.state,'unknown','an unrelated provider event cannot certify session clearing');
  const clearWrites=(await call('/fixture',{})).body.oktaWrites;
  await call('/execution/process',{});
  assert.equal((await call('/fixture',{})).body.oktaWrites,clearWrites,'unknown session clearing reconciles without repeat');
  await call('/fixture',{oktaWrongLog:false});
  await call(`/operations/${clearing.id}/reconcile`,{});
  assert.equal((await call('/operations')).body.find(o=>o.id===clearing.id).state,'effect_verified');
  const beforeRevoked=(await call('/fixture',{})).body.oktaWrites;
  await oktaOperation('okta.group.remove','synthetic-linen-5','synthetic-linen-2',true);
  assert.equal((await call('/fixture',{})).body.oktaWrites,beforeRevoked,'revoked Okta authority cannot send an effect');
  const grant = {
    principalId: "actor",
    beneficiaryId: "person",
    action: "group.add",
    actionVersion: 1,
    target: "group",
    connectionId: "graph",
    validFrom: new Date(Date.now() - 60000).toISOString(),
    validUntil: new Date(Date.now() + 3600000).toISOString(),
    maxUses: 100,
    conditions: {},
  };
  assert.equal(
    (await call("/grants", { ...grant, principalId: "issuer" }, "issuer"))
      .status,
    403,
    "self approval",
  );
  const granted = await call("/grants", grant, "issuer");
  assert.equal(granted.status, 201, JSON.stringify(granted));
  const g = granted.body;
  const step = {
    action: "group.add",
    actionVersion: 1,
    target: "group",
    beneficiaryId: "person",
    connectionId: "graph",
    verifierConnectionId: "probe",
    grantId: g.id,
    grantVersion: g.version,
  };
  async function plan(key, overrides = {}) {
    const result = await call("/plans", {
      workId: "work",
      revision: 1,
      idempotencyKey: key,
      steps: [{ ...step, ...overrides }],
    });
    assert.equal(result.status, 201, JSON.stringify(result));
    return result.body;
  }
  const p = await plan("one");
  assert.equal((await plan("one")).id, p.id, "idempotent plan");
  assert.equal(
    (
      await call("/plans", {
        workId: "work",
        revision: 1,
        idempotencyKey: "one",
        steps: [{ ...step, target: "different" }],
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`/plans/${p.id}/dispatch`, { expectedRevision: 99 })).status,
    409,
  );
  assert.equal(
    (await call(`/plans/${p.id}/dispatch`, { expectedRevision: 1 }, "other"))
      .status,
    403,
  );
  const dispatch = await call(`/plans/${p.id}/dispatch`, {
    expectedRevision: 1,
  });
  assert.equal(dispatch.status, 200, JSON.stringify(dispatch));
  const op = dispatch.body[0];
  await call("/fixture", { lost: true });
  await call("/execution/process", {});
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_operations WHERE id=?")
        .bind(op.id)
        .first()
    ).state,
    "unknown",
    "lost receipt stays unknown",
  );
  assert.equal((await call("/fixture", {})).body.writes, 1);
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.writes,
    1,
    "reconcile never repeats write",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_operations WHERE id=?")
        .bind(op.id)
        .first()
    ).state,
    "effect_verified",
  );
  await call("/fixture", { invalidProbe: true });
  assert.equal(
    (await call(`/operations/${op.id}/verify`, { verifierVersion: 1 })).status,
    409,
    "replayed probe rejected",
  );
  for (const probeMutation of ["stale", "target", "cohort", "negative"]) {
    await call("/fixture", { probeMutation });
    assert.equal(
      (await call(`/operations/${op.id}/verify`, { verifierVersion: 1 }))
        .status,
      409,
      "invalid independent " + probeMutation + " evidence rejected",
    );
  }
  await call("/fixture", {});
  assert.equal(
    (await call(`/operations/${op.id}/verify`, { verifierVersion: 1 })).body
      .state,
    "verified",
  );
  assert.equal(
    (await call("/operations", undefined, "actor", "foreign")).status,
    403,
    "foreign workspace membership denied",
  );
  const p2 = await plan("two");
  const ops2 = await call(`/plans/${p2.id}/dispatch`, { expectedRevision: 1 });
  await db
    .prepare(
      "UPDATE workspace_settings SET settings_json='{\"executionHeld\":true}' WHERE workspace_id='w'",
    )
    .run();
  await call("/fixture", { reset: true });
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.writes,
    0,
    "restore hold stops effects",
  );
  await db
    .prepare(
      "UPDATE workspace_settings SET settings_json='{}' WHERE workspace_id='w'",
    )
    .run();
  // Execution records follow the ticket's readers; only the operation's actor or service staff stop it.
  for (const [user, role] of [
    ["approver", "approver"],
    ["auditor", "auditor"],
    ["automation", "integration"],
  ])
    await db.batch([
      db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .bind(user, user + "@example.test", user, "none", time),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,?,1)")
        .bind("w", user, JSON.stringify([role])),
    ]);
  for (const user of ["approver", "auditor", "automation"])
    for (const path of ["/plans", "/operations", "/authority-decisions"])
      assert.deepEqual(
        (await call(path, undefined, user)).body,
        [],
        `${user} outside the ticket lists no ${path.slice(1)}`,
      );
  assert.equal(
    (
      await call(
        `/operations/${ops2.body[0].id}/cancel`,
        { expectedRevision: 3, reason: "synthetic-linen-1" },
        "automation",
      )
    ).status,
    404,
    "integration account cannot cancel an operation on a ticket it cannot read",
  );
  await db
    .prepare(
      "INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,created_at,updated_at,dedup_key) VALUES('automation-work','w','automation','person','request','Integration request',?,?,'automation')",
    )
    .bind(time, time)
    .run();
  const requested = await call("/plans", {
    workId: "automation-work",
    revision: 1,
    idempotencyKey: "automation-requested",
    steps: [step],
  });
  assert.equal(requested.status, 201, JSON.stringify(requested));
  const [requestedOp] = (
    await call(`/plans/${requested.body.id}/dispatch`, { expectedRevision: 1 })
  ).body;
  assert.equal(
    (
      await call(
        `/operations/${requestedOp.id}/takeover`,
        { expectedRevision: requestedOp.revision, reason: "synthetic-linen-2" },
        "automation",
      )
    ).status,
    403,
    "integration requester cannot take over another actor's operation",
  );
  assert.equal(
    (
      await call(`/operations/${requestedOp.id}/cancel`, {
        expectedRevision: requestedOp.revision,
        reason: "synthetic-linen-3",
      })
    ).body.state,
    "cancelled",
    "the operation's own actor still cancels it",
  );
  const cancel = await call(`/operations/${ops2.body[0].id}/cancel`, {
    expectedRevision: 3,
    reason: "fixture",
  });
  assert.equal(cancel.status, 200, JSON.stringify(cancel));
  assert.equal(cancel.body.state, "cancelled");
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.writes,
    0,
    "cancelled queued effect never dispatched",
  );
  await call(`/grants/${g.id}/revoke`, { version: 1 }, "issuer");
  const p3 = await plan("revoked");
  assert.equal(
    (await call(`/plans/${p3.id}/dispatch`, { expectedRevision: 1 })).status,
    403,
    "revoked grant denied",
  );

  // Expiry removal owns independent authority, persists before dispatch and survives addition revocation.
  const addGrant = (await call("/grants", grant, "issuer")).body;
  const removeGrant = (
    await call("/grants", { ...grant, action: "group.remove" }, "issuer")
  ).body;
  const temporary = await plan("temporary", {
    grantId: addGrant.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    revocationGrantId: removeGrant.id,
  });
  const tempDispatch = await call(`/plans/${temporary.id}/dispatch`, {
    expectedRevision: 1,
  });
  assert.equal(tempDispatch.status, 200, JSON.stringify(tempDispatch));
  assert.equal(
    tempDispatch.body.length,
    2,
    "revocation durable before remote effect",
  );
  await call("/execution/process", {});
  assert.equal((await call("/fixture", {})).body.present, true);
  await call(`/grants/${addGrant.id}/revoke`, { version: 1 }, "issuer");
  await db
    .prepare(
      "UPDATE execution_operations SET due_at=? WHERE plan_id=? AND parent_id!='initial'",
    )
    .bind(new Date(Date.now() - 1000).toISOString(), temporary.id)
    .run();
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.present,
    false,
    "due removal survives provision authority expiry/revocation",
  );
  const removal = await db
    .prepare(
      "SELECT * FROM execution_operations WHERE plan_id=? AND parent_id!='initial'",
    )
    .bind(temporary.id)
    .first();
  assert.equal(removal.state, "effect_verified");
  assert.equal(
    (await call(`/operations/${removal.id}/verify`, { verifierVersion: 1 }))
      .body.state,
    "verified",
    "independent denial probe",
  );
  // Cancelling an applied temporary grant advances its separately authorized compensation and verifies denial.
  const compensationGrant = (await call("/grants", grant, "issuer")).body;
  const compensationPlan = await plan("compensation", {
    grantId: compensationGrant.id,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    revocationGrantId: removeGrant.id,
    compensationGrantId: removeGrant.id,
  });
  const compensationOps = await call(`/plans/${compensationPlan.id}/dispatch`, {
    expectedRevision: 1,
  });
  assert.equal(compensationOps.status, 200, JSON.stringify(compensationOps));
  await call("/execution/process", {});
  const applied = await db
    .prepare(
      "SELECT * FROM execution_operations WHERE plan_id=? AND parent_id='initial'",
    )
    .bind(compensationPlan.id)
    .first();
  assert.equal(applied.state, "effect_verified");
  assert.equal(
    (
      await call(`/operations/${applied.id}/cancel`, {
        expectedRevision: applied.revision,
        reason: "Employee cancelled temporary access",
      })
    ).status,
    200,
  );
  await call("/execution/process", {});
  const compensated = await db
    .prepare(
      "SELECT * FROM execution_operations WHERE plan_id=? AND parent_id!='initial'",
    )
    .bind(compensationPlan.id)
    .first();
  assert.equal(compensated.state, "effect_verified");
  assert.equal(
    (await call(`/operations/${compensated.id}/verify`, { verifierVersion: 1 }))
      .body.state,
    "verified",
    "compensation independently proves denied workflow",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT COUNT(*) n FROM execution_operations WHERE plan_id=?")
        .bind(compensationPlan.id)
        .first()
    ).n,
    2,
    "cancellation does not duplicate scheduled removal",
  );
  // Competing workers cannot both pass a stale snapshot claim.
  await call("/fixture", { reset: true });
  const cg = (await call("/grants", grant, "issuer")).body;
  const concurrentPlan = await plan("concurrent", { grantId: cg.id });
  await call(`/plans/${concurrentPlan.id}/dispatch`, { expectedRevision: 1 });
  await Promise.all([
    call("/execution/process", {}),
    call("/execution/process", {}),
  ]);
  assert.equal(
    (await call("/fixture", {})).body.writes,
    1,
    "only winning conditional claim dispatches",
  );
  // A grant revoked while the provider mints the write token cannot admit the subsequent mutation.
  const raceGrant = (await call("/grants", grant, "issuer")).body;
  const racePlan = await plan("oauth-race", { grantId: raceGrant.id });
  const raceOps = await call(`/plans/${racePlan.id}/dispatch`, {
    expectedRevision: 1,
  });
  await call("/fixture", { reset: true, oauthRevoke: raceGrant.id });
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.writes,
    0,
    "revocation during OAuth prevents service write",
  );
  assert.notEqual(
    (
      await db
        .prepare("SELECT state FROM execution_operations WHERE id=?")
        .bind(raceOps.body[0].id)
        .first()
    ).state,
    "verified",
  );
  // Identity ownership marker rejects a preexisting account; lost create receipt is reconciled without creating twice.
  const profile = {
    displayName: "Fixture Person",
    mailNickname: "fixture.person",
  };
  const identityGrant = (
    await call(
      "/grants",
      {
        ...grant,
        action: "identity.create",
        target: "new@example.test",
        conditions: {
          payloadHash: createHash("sha256")
            .update(JSON.stringify(profile))
            .digest("hex"),
        },
      },
      "issuer",
    )
  ).body;
  await call("/fixture", { identityCollision: true });
  const identityPlan = await plan("identity", {
    action: "identity.create",
    target: "new@example.test",
    grantId: identityGrant.id,
    payload: profile,
  });
  const identityOps = await call(`/plans/${identityPlan.id}/dispatch`, {
    expectedRevision: 1,
  });
  const beforeCollision = (await call("/fixture", {})).body.writes;
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.writes,
    beforeCollision,
    "existing account never adopted or overwritten",
  );
  await call("/fixture", { identityReset: true, lost: true });
  await call("/execution/process", {});
  const identityWrites = (await call("/fixture", {})).body.writes;
  await call("/execution/process", {});
  assert.equal(
    (await call("/fixture", {})).body.writes,
    identityWrites,
    "unknown identity create never blind repeats",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_operations WHERE id=?")
        .bind(identityOps.body[0].id)
        .first()
    ).state,
    "effect_verified",
  );
  const secret = await db
    .prepare("SELECT ciphertext FROM execution_secrets WHERE operation_id=?")
    .bind(identityOps.body[0].id)
    .first();
  assert.ok(secret.ciphertext && !secret.ciphertext.includes("password"));

  for (const action of ["identity.disable", "sessions.revoke"]) {
    const identityActionGrant = (
      await call(
        "/grants",
        { ...grant, action, target: "new@example.test" },
        "issuer",
      )
    ).body;
    const actionPlan = await plan(action, {
      action,
      target: "new@example.test",
      grantId: identityActionGrant.id,
    });
    const actionOps = await call(`/plans/${actionPlan.id}/dispatch`, {
      expectedRevision: 1,
    });
    await call("/execution/process", {});
    assert.equal(
      (
        await db
          .prepare("SELECT state FROM execution_operations WHERE id=?")
          .bind(actionOps.body[0].id)
          .first()
      ).state,
      "effect_verified",
      action + " independent provider readback",
    );
    assert.equal(
      (
        await call(`/operations/${actionOps.body[0].id}/verify`, {
          verifierVersion: 1,
        })
      ).body.state,
      "verified",
      action + " fresh denial workflow",
    );
  }
  await db
    .prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)")
    .bind(
      "missing",
      "w",
      "microsoft-graph",
      "Missing configuration",
      "{}",
      null,
      "active",
      time,
      time,
    )
    .run();
  const missingGrant = (
    await call("/grants", { ...grant, connectionId: "missing" }, "issuer")
  ).body;
  const missingPlan = await plan("missing", {
    connectionId: "missing",
    grantId: missingGrant.id,
  });
  const missingOps = await call(`/plans/${missingPlan.id}/dispatch`, {
    expectedRevision: 1,
  });
  const missingBefore = (await call("/fixture", {})).body.writes;
  await call("/execution/process", {});
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_operations WHERE id=?")
        .bind(missingOps.body[0].id)
        .first()
    ).state,
    "needs_configuration",
  );
  assert.equal(
    (await call("/fixture", {})).body.writes,
    missingBefore,
    "no fake fallback effect when configuration absent",
  );
  // An ordinary employee requests their work under existing independent automation grants.
  for (const [user, role] of [["employee", "employee"]])
    await db.batch([
      db
        .prepare("INSERT INTO users VALUES(?,?,?,?,?)")
        .bind(user, user + "@example.test", user, "none", time),
      db
        .prepare("INSERT INTO memberships VALUES(?,?,?,1)")
        .bind("w", user, JSON.stringify([role])),
    ]);
  await db
    .prepare(
      "INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,created_at,updated_at,dedup_key) VALUES('employee-work','w','employee','employee','request','Employee request',?,?,'employee')",
    )
    .bind(time, time)
    .run();
  const automation = await call(
    "/automation-principals",
    { name: "Linen automation", idempotencyKey: "setup-automation" },
    "issuer",
  );
  assert.equal(automation.status, 201, JSON.stringify(automation));
  const automationId = automation.body.id;
  assert.equal(automation.body.interactiveLogin, false);
  assert.equal(
    (
      await call(
        "/automation-principals",
        { name: "Linen automation", idempotencyKey: "setup-automation" },
        "issuer",
      )
    ).body.id,
    automationId,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT password_hash FROM users WHERE id=?")
        .bind(automationId)
        .first()
    ).password_hash,
    "!non-interactive-automation",
  );
  const mapping = await call(
    "/subject-mappings",
    {
      connectionId: "graph",
      localUserId: "employee",
      providerSubject: "provider-employee",
    },
    "issuer",
  );
  assert.equal(mapping.status, 201, JSON.stringify(mapping));
  const automationGrant = (
    await call(
      "/grants",
      {
        ...grant,
        principalId: automationId,
        beneficiaryId: "provider-employee",
        localBeneficiaryId: "employee",
        verifierConnectionId: "probe",
      },
      "issuer",
    )
  ).body;
  const resolved = await call(
    "/fixture/resolve",
    {
      workId: "employee-work",
      target: "group",
      beneficiaryId: "employee",
      kind: "access",
    },
    "employee",
  );
  assert.equal(resolved.body.actorId, automationId, JSON.stringify(resolved));
  assert.equal(resolved.body.step.beneficiaryId, "provider-employee");
  await call("/fixture", { reset: true, memberId: "provider-employee" });
  const employeeRequest = await call(
    "/plans/granted",
    {
      workId: "employee-work",
      revision: 1,
      idempotencyKey: "employee-request",
      steps: [resolved.body.step],
    },
    "employee",
  );
  assert.equal(employeeRequest.status, 201, JSON.stringify(employeeRequest));
  await call("/execution/process", {}, "issuer");
  const employeeOp = employeeRequest.body.operations[0];
  assert.equal(
    (
      await call(
        `/operations/${employeeOp.id}/verify`,
        { verifierVersion: 1 },
        "issuer",
      )
    ).body.state,
    "verified",
    "ordinary employee useful verified work without routine owner decision",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT actor_id FROM execution_operations WHERE id=?")
        .bind(employeeOp.id)
        .first()
    ).actor_id,
    automationId,
  );
  assert.equal(
    (
      await call(
        "/plans/granted",
        {
          workId: "employee-work",
          revision: 1,
          idempotencyKey: "impersonate",
          steps: [
            {
              ...step,
              beneficiaryId: "someone-else",
              grantId: automationGrant.id,
            },
          ],
        },
        "employee",
      )
    ).status,
    403,
    "employee cannot substitute beneficiary",
  );
  assert.equal(
    (
      await call(
        "/subject-mappings",
        {
          connectionId: "graph",
          localUserId: "employee",
          providerSubject: "provider-employee",
        },
        "issuer",
        "foreign",
      )
    ).status,
    403,
    "wrong tenant mapping rejected",
  );
  const remap = await call(
    "/subject-mappings",
    {
      connectionId: "graph",
      localUserId: "employee",
      providerSubject: "provider-employee",
      expectedRevision: 1,
    },
    "issuer",
  );
  assert.equal(remap.status, 201);
  assert.equal(
    (
      await call(
        `/operations/${employeeOp.id}/verify`,
        { verifierVersion: 1 },
        "issuer",
      )
    ).status,
    403,
    "reviewed mapping revision drift invalidates prior grant",
  );
  // Mail acceptance is not delivery; lost submission remains unknown and cannot resend.
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const publicKey = keys.publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64");
  const mailSecret = (await call("/fixture/secret", { apiKey: "fixture-only" }))
    .body.secret;
  await db
    .prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)")
    .bind(
      "mail",
      "w",
      "sendgrid",
      "Mail",
      JSON.stringify({
        from: "linen@example.test",
        webhookPublicKey: publicKey,
      }),
      mailSecret,
      "active",
      time,
      time,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO work_messages VALUES('message','w','work','actor','public','Fixture public update','fixture',?)",
    )
    .bind(time)
    .run();
  const notify = {
    workId: "work",
    messageId: "message",
    recipientId: "actor",
    connectionId: "mail",
    idempotencyKey: "mail1",
  };
  const mail1 = await call("/notifications", notify);
  assert.equal(mail1.status, 201, JSON.stringify(mail1));
  await call("/fixture", { mailLost: true });
  await call("/notifications/process", {});
  await call("/notifications/process", {});
  assert.equal(
    (await call("/fixture", {})).body.mailWrites,
    1,
    "unknown non-idempotent mail not retried",
  );
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_outbox WHERE id=?")
        .bind(mail1.body.id)
        .first()
    ).state,
    "unknown",
  );
  const mail2 = await call("/notifications", {
    ...notify,
    idempotencyKey: "mail2",
  });
  await call("/notifications/process", {});
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_outbox WHERE id=?")
        .bind(mail2.body.id)
        .first()
    ).state,
    "accepted",
  );
  const raw = JSON.stringify([
      {
        event: "delivered",
        sg_event_id: "event1",
        rer_delivery_id: mail2.body.id,
        email: "actor@example.test",
      },
    ]),
    timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(
    "sha256",
    Buffer.from(timestamp + raw),
    keys.privateKey,
  ).toString("base64");
  const delivery = await mf.dispatchFetch(
    "http://localhost/fixture/webhook/mail",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Twilio-Email-Event-Webhook-Timestamp": timestamp,
        "X-Twilio-Email-Event-Webhook-Signature": signature,
      },
      body: raw,
    },
  );
  assert.equal(delivery.status, 200, await delivery.text());
  assert.equal(
    (
      await db
        .prepare("SELECT state FROM execution_outbox WHERE id=?")
        .bind(mail2.body.id)
        .first()
    ).state,
    "delivered",
  );
  const activity = await call('/work/work/activity');
  assert.equal(activity.status, 200, 'DESK-017 notification timeline public door');
  const notifications = activity.body.items.filter(e => e.kind === 'notification');
  assert.ok(notifications.some(e => e.body === 'Delivery state: unknown'), 'DESK-017 lost receipt remains unknown');
  assert.ok(notifications.some(e => e.body === 'Delivery state: delivered'), 'DESK-017 signed delivery observation appears beside message');
  assert.ok(activity.body.items.some(e => e.kind === 'message' && e.body === 'Fixture public update'));
  const forged = await call("/fixture/webhook/mail", []);
  assert.equal(forged.status, 403, "forged delivery rejected");
  await notificationRuleChecks({call,db,time});

  // Reconnection invalidates prior intent and approval even when the connector ID is unchanged.
  const reconnectGrant = (await call("/grants", grant, "issuer")).body;
  const reconnectPlan = await plan("reconnect", { grantId: reconnectGrant.id });
  await db
    .prepare(
      "UPDATE connections SET revision=revision+1,status='unverified' WHERE id='graph'",
    )
    .run();
  assert.equal(
    (await call(`/plans/${reconnectPlan.id}/dispatch`, { expectedRevision: 1 }))
      .status,
    403,
    "connection revision is immutable authority input",
  );
  assert.equal(
    (await call(`/automation-principals/${automationId}/revoke`, {}, "issuer"))
      .body.remoteStopped,
    false,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT active FROM memberships WHERE user_id=?")
        .bind(automationId)
        .first()
    ).active,
    0,
    "automation revocation stops membership",
  );

  // Native workerd fetch (not the provider fixture override) never forwards credentials through redirects.
  let redirected = 0;
  nativeServer = createHttpServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "/must-not-follow" });
      res.end();
    } else {
      redirected++;
      res.end("unexpected");
    }
  });
  await new Promise((resolve) => nativeServer.listen(Number(process.env.LINEN_TEST_PROVIDER_PORT || 0), "127.0.0.1", resolve));
  const nativePort = nativeServer.address().port;
  const nativeFetch = await call("/fixture/native-fetch", {
    url: `http://127.0.0.1:${nativePort}/redirect`,
  });
  assert.equal(nativeFetch.status, 200, JSON.stringify(nativeFetch));
  assert.equal(nativeFetch.body.status, 302);
  assert.equal(
    redirected,
    0,
    "native workerd manual redirect prevents credential forwarding",
  );
  // Native restore preserves unknown obligations, never imported authority or fresh recovery.
  await db
    .prepare(
      "UPDATE workspace_settings SET settings_json='{\"executionHeld\":true}' WHERE workspace_id='w'",
    )
    .run();
  const storedPlan = await db
    .prepare("SELECT * FROM execution_plans WHERE id=?")
    .bind(p.id)
    .first();
  const restoredPlan = {
    ...storedPlan,
    id: "restored-plan",
    idempotency_key: "restored-plan",
  };
  assert.equal(
    (
      await call(
        "/fixture/restore",
        {
          table: "execution_plans",
          row: restoredPlan,
          sourceId: "fixture-archive",
          sourceKey: "plan",
        },
        "issuer",
      )
    ).status,
    200,
  );
  const storedOperation = await db
    .prepare("SELECT * FROM execution_operations WHERE id=?")
    .bind(op.id)
    .first();
  const restoredOperation = {
    ...storedOperation,
    id: "restored-operation",
    plan_id: "restored-plan",
    state: "verified",
  };
  assert.equal(
    (
      await call(
        "/fixture/restore",
        {
          table: "execution_operations",
          row: restoredOperation,
          sourceId: "fixture-archive",
          sourceKey: "operation",
        },
        "issuer",
      )
    ).status,
    200,
  );
  const restored = await db
    .prepare("SELECT * FROM execution_operations WHERE id='restored-operation'")
    .first();
  assert.equal(restored.state, "unknown");
  assert.equal(restored.cancel_requested, 1);
  assert.equal(restored.fence, 0);
  assert.equal(
    (
      await call(
        "/fixture/restore",
        {
          table: "execution_grants",
          row: { id: "never-active" },
          sourceId: "fixture",
          sourceKey: "grant",
        },
        "issuer",
      )
    ).status,
    422,
  );
  await db
    .prepare("INSERT INTO adoption_tombstones VALUES(?,?,?)")
    .bind("w", createHash("sha256").update("person").digest("hex"), time)
    .run();
  assert.equal(
    (await call("/fixture/erase", { identity: "person" }, "issuer")).status,
    409,
    "unresolved remote effects cannot be falsely erased",
  );
  assert.equal(
    (
      await call(
        "/fixture/restore",
        {
          table: "execution_operations",
          row: { ...restoredOperation, id: "replayed-erased" },
          sourceId: "fixture",
          sourceKey: "erased",
        },
        "issuer",
      )
    ).status,
    409,
    "nested step identity cannot resurrect after tombstone",
  );
  console.log(
    "Execution workerd/D1 fixtures passed: immutable scope, self-approval, deduplication, stale revisions, foreign actor/workspace, persisted lost effect, reconcile-before-repeat, fresh independent verifier/replay rejection, restore hold, cancellation, grant revocation, durable expiry/denial, identity ownership/crash, encrypted secret custody, SendGrid unknown/accepted/signed delivered",
  );
} finally {
  await mf?.dispose();
  if (nativeServer) await new Promise((resolve) => nativeServer.close(resolve));
  await rm(dir, { recursive: true, force: true });
}
