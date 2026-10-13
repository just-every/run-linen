import { id, now } from "../../platform/http";
import { assert, membership } from "./authority";
import { graph } from "./connectors";
import type { CoreContext, Step } from "./types";
export async function mapProviderSubject(
  ctx: CoreContext,
  input: {
    connectionId: string;
    localUserId: string;
    providerSubject: string;
    expectedRevision?: number;
  },
) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  const local = await localSubject(ctx, input.localUserId, true);
  assert(
    typeof input.providerSubject === "string" &&
      input.providerSubject.length > 0 &&
      input.providerSubject.length < 200,
    "provider_subject_required",
    422,
  );
  const connection: any = await ctx.env.DB.prepare(
    "SELECT revision,status FROM connections WHERE id=? AND workspace_id=? AND provider='microsoft-graph'",
  )
    .bind(input.connectionId, ctx.principal.workspaceId)
    .first();
  assert(connection?.status === "active", "connection_not_active", 503);
  const request = await graph(ctx, {
    connectionId: input.connectionId,
    connectionRevision: connection.revision,
  } as Step);
  const response = await request(
    `/users/${encodeURIComponent(input.providerSubject)}?$select=id`,
  );
  assert(response.ok, "provider_subject_not_observed", 422);
  const subject: any = await response.json();
  assert(
    subject.id === input.providerSubject,
    "canonical_provider_subject_required",
    422,
  );
  const existing: any = await ctx.env.DB.prepare(
    "SELECT id,revision FROM execution_subject_mappings WHERE workspace_id=? AND connection_id=? AND local_user_id=?",
  )
    .bind(ctx.principal.workspaceId, input.connectionId, input.localUserId)
    .first();
  assert(
    (existing?.revision || 0) === (input.expectedRevision || 0),
    "mapping_changed",
  );
  const key = existing?.id || id(),
    revision = (existing?.revision || 0) + 1;
  if (existing) {
    const result = await ctx.env.DB.prepare(
      "UPDATE execution_subject_mappings SET provider_subject=?,connection_revision=?,revision=revision+1,active=1,observed_at=?,reviewed_by=?,local_kind=?,local_source_json=? WHERE id=? AND workspace_id=? AND revision=?",
    )
      .bind(
        input.providerSubject,
        connection.revision,
        now(),
        ctx.principal.userId,
        local.kind,
        JSON.stringify(local.source),
        key,
        ctx.principal.workspaceId,
        existing.revision,
      )
      .run();
    assert(result.meta.changes, "mapping_changed");
  } else
    await ctx.env.DB.prepare(
      "INSERT INTO execution_subject_mappings VALUES(?,?,?,?,?,?,1,1,?,?,?,?)",
    )
      .bind(
        key,
        ctx.principal.workspaceId,
        input.connectionId,
        connection.revision,
        input.localUserId,
        input.providerSubject,
        now(),
        ctx.principal.userId,
        local.kind,
        JSON.stringify(local.source),
      )
      .run();
  await ctx.env.DB.prepare("INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)")
    .bind(
      id(),
      ctx.principal.workspaceId,
      ctx.principal.userId,
      "subject.mapping.reviewed",
      key,
      JSON.stringify({ revision, connectionRevision: connection.revision }),
      now(),
    )
    .run();
  return {
    id: key,
    revision,
    localUserId: input.localUserId,
    providerSubject: input.providerSubject,
    connectionId: input.connectionId,
    connectionRevision: connection.revision,
  };
}
export async function subjectMapping(ctx: CoreContext, step: Step) {
  assert(step.localBeneficiaryId, "local_beneficiary_required", 422);
  const mapping: any = await ctx.env.DB.prepare(
    "SELECT m.* FROM execution_subject_mappings m JOIN connections c ON c.id=m.connection_id AND c.workspace_id=m.workspace_id AND c.revision=m.connection_revision WHERE m.workspace_id=? AND m.connection_id=? AND m.local_user_id=? AND m.active=1",
  )
    .bind(ctx.principal.workspaceId, step.connectionId, step.localBeneficiaryId)
    .first();
  assert(
    mapping && mapping.provider_subject === step.beneficiaryId,
    "provider_subject_mapping_changed",
    403,
  );
  const local = await localSubject(
    ctx,
    step.localBeneficiaryId,
    step.action?.endsWith(".remove") ||
      ["identity.disable", "sessions.revoke", "effect.observe"].includes(
        step.action,
      ),
  );
  assert(
    mapping.local_kind === local.kind &&
      mapping.local_source_json === JSON.stringify(local.source),
    "local_subject_provenance_changed",
    403,
  );
  return mapping;
}

async function localSubject(
  ctx: CoreContext,
  identity: string,
  allowInactive = false,
) {
  const member: any = await ctx.env.DB.prepare(
    "SELECT active FROM memberships WHERE workspace_id=? AND user_id=?",
  )
    .bind(ctx.principal.workspaceId, identity)
    .first();
  if (member) {
    assert(member.active || allowInactive, "local_subject_inactive", 403);
    return { kind: "member", source: { userId: identity } };
  }
  const person: any = await ctx.env.DB.prepare(
    "SELECT id,source,source_id,active,merged_into FROM work_people WHERE workspace_id=? AND id=?",
  )
    .bind(ctx.principal.workspaceId, identity)
    .first();
  assert(
    person && ((person.active && !person.merged_into) || allowInactive),
    "local_subject_missing",
    403,
  );
  return {
    kind: "person",
    source: {
      personId: person.id,
      source: person.source,
      sourceId: person.source_id,
    },
  };
}

/** Setup reads are authority-holder only and recheck persisted membership on every call. */
export async function listSubjectMappings(ctx: CoreContext) {
  assert((await membership(ctx)).includes("owner"), "owner_required", 403);
  const rows = (await ctx.env.DB.prepare(`
    SELECT m.id,m.revision,m.local_user_id,m.provider_subject,m.connection_id,
      m.connection_revision,m.active,m.observed_at,m.local_kind,m.local_source_json,
      c.revision current_connection_revision,c.status connection_status,c.name connection_name,
      u.name member_name,u.email member_email,ms.active member_active,
      p.name person_name,p.active person_active,p.merged_into,p.source,p.source_id
    FROM execution_subject_mappings m
    JOIN connections c ON c.id=m.connection_id AND c.workspace_id=m.workspace_id
    LEFT JOIN memberships ms ON ms.user_id=m.local_user_id AND ms.workspace_id=m.workspace_id
    LEFT JOIN users u ON u.id=ms.user_id
    LEFT JOIN work_people p ON p.id=m.local_user_id AND p.workspace_id=m.workspace_id
    WHERE m.workspace_id=? ORDER BY m.observed_at DESC
  `).bind(ctx.principal.workspaceId).all<any>()).results;
  return rows.map(r => {
    const member = r.local_kind === "member";
    const localActive = member ? r.member_active === 1 : r.person_active === 1 && !r.merged_into;
    const source = member ? { userId: r.local_user_id } : { personId: r.local_user_id, source: r.source, sourceId: r.source_id };
    const provenanceCurrent = member === (r.member_active !== null) && r.local_source_json === JSON.stringify(source);
    return {
      id: r.id, revision: r.revision, localUserId: r.local_user_id,
      localName: member ? r.member_name : r.person_name,
      localEmail: member ? r.member_email : null, localKind: r.local_kind,
      providerSubject: r.provider_subject, connectionId: r.connection_id,
      connectionName: r.connection_name, connectionRevision: r.connection_revision,
      currentConnectionRevision: r.current_connection_revision, connectionStatus: r.connection_status,
      active: r.active === 1, localActive, observedAt: r.observed_at,
      current: r.active === 1 && localActive && provenanceCurrent && r.connection_status === "active" && r.connection_revision === r.current_connection_revision,
    };
  });
}
