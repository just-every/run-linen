import { oktaObserve, oktaWrite } from "./okta";
import { providerFetch } from "./transport";
import { deploymentWrite, deploymentObserve } from "./deployment";
import { identityObserve, identityWrite } from "./identity";
import { decryptSecret } from "../../platform/crypto";
import { ApiError } from "../../platform/http";
import { assert } from "./authority";
import type { CoreContext, Step } from "./types";
export async function connection(
  ctx: CoreContext,
  id: string,
  provider: string,
  requireActive = true,
  revision?: number,
) {
  const row: any = await ctx.env.DB.prepare(
    "SELECT * FROM connections WHERE id=? AND workspace_id=?",
  )
    .bind(id, ctx.principal.workspaceId)
    .first();
  if (!row || row.provider !== provider || !row.secret_ciphertext)
    throw new ApiError(
      503,
      "needs_configuration",
      "Configure the scoped connection",
    );
  assert(
    !requireActive || row.status === "active",
    "connection_not_active",
    503,
  );
  assert(
    revision === undefined || revision === row.revision,
    "connection_changed",
    409,
  );
  return {
    config: JSON.parse(row.config_json),
    secret: JSON.parse(
      await decryptSecret(ctx.env.ENCRYPTION_KEY, row.secret_ciphertext),
    ),
  };
}
export async function graph(
  ctx: CoreContext,
  step: Step,
  discovery = false,
  operationId?: string,
) {
  const { config, secret } = await connection(
    ctx,
    step.connectionId,
    "microsoft-graph",
    !discovery,
    step.connectionRevision,
  );
  assert(
    /^[a-zA-Z0-9-]+$/.test(config.tenantId) &&
      secret.clientId &&
      secret.clientSecret,
    "needs_configuration",
    503,
  );
  const response = await providerFetch(
    ctx,
    step.connectionId,
    "oauth",
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      redirect: "manual",
      body: new URLSearchParams({
        client_id: secret.clientId,
        client_secret: secret.clientSecret,
        grant_type: "client_credentials",
        scope: "https://graph.microsoft.com/.default",
      }),
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw new ApiError(
      503,
      "provider_auth_failed",
      "Provider authentication failed",
    );
  const token: any = await response.json();
  assert(typeof token.access_token === "string", "provider_auth_failed", 503);
  return async (path: string, method = "GET", body?: unknown) =>
    providerFetch(
      ctx,
      step.connectionId,
      method === "GET" ? "observe" : "effect",
      "https://graph.microsoft.com/v1.0" + path,
      {
        method,
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(20000),
      },
      method === "GET" ? undefined : operationId,
    );
}
export async function observeEffect(
  ctx: CoreContext,
  step: Step,
  operationId = "",
) {
  if (step.action.startsWith("okta.")) return oktaObserve(ctx, step, operationId);
  if (step.action.startsWith("deployment."))
    return deploymentObserve(ctx, step, operationId);
  if (
    ["identity.create", "identity.disable", "sessions.revoke"].includes(
      step.action,
    )
  )
    return identityObserve(ctx, step, operationId);
  const request = await graph(ctx, step);
  let r: Response;
  let present: boolean;
  if (step.action.startsWith("group.")) {
    r = await request(
      `/groups/${encodeURIComponent(step.target)}/members/${encodeURIComponent(step.beneficiaryId)}`,
    );
    if (r.status === 404) present = false;
    else {
      assert(r.ok, "provider_observation_failed", 503);
      const v: any = await r.json();
      assert(v.id === step.beneficiaryId, "provider_target_mismatch");
      present = true;
    }
  } else {
    r = await request(
      `/users/${encodeURIComponent(step.beneficiaryId)}/licenseDetails`,
    );
    assert(r.ok, "provider_observation_failed", 503);
    const v: any = await r.json();
    assert(
      Array.isArray(v.value) && !v["@odata.nextLink"],
      "provider_observation_incomplete",
      503,
    );
    present = v.value.some((x: any) => x.skuId === step.target);
  }
  return {
    matches: present === step.action.endsWith(".add"),
    present,
    observedAt: new Date().toISOString(),
    target: step.target,
    beneficiaryId: step.beneficiaryId,
  };
}
export async function applyEffect(
  ctx: CoreContext,
  step: Step,
  operationId = "",
) {
  if (step.action.startsWith("okta.")) return oktaWrite(ctx, step, operationId);
  if (step.action.startsWith("deployment."))
    return deploymentWrite(ctx, step, operationId);
  if (
    ["identity.create", "identity.disable", "sessions.revoke"].includes(
      step.action,
    )
  )
    return identityWrite(ctx, step, operationId);
  const request = await graph(ctx, step, false, operationId);
  const user = encodeURIComponent(step.beneficiaryId),
    target = encodeURIComponent(step.target);
  const add = step.action.endsWith(".add");
  const r = step.action.startsWith("group.")
    ? await request(
        `/groups/${target}/members/${add ? "$ref" : user + "/$ref"}`,
        add ? "POST" : "DELETE",
        add
          ? {
              "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${user}`,
            }
          : undefined,
      )
    : await request(`/users/${user}/assignLicense`, "POST", {
        addLicenses: add ? [{ skuId: step.target }] : [],
        removeLicenses: add ? [] : [step.target],
      });
  return {
    accepted: r.ok,
    status: r.status,
    unknown:
      (r.status >= 300 && r.status < 400) ||
      r.status >= 500 ||
      r.status === 408,
  };
}
export async function observeWorkflow(ctx: CoreContext, step: Step) {
  assert(
    step.verifierConnectionId &&
      step.verifierConnectionId !== step.connectionId,
    "verifier_configuration_required",
    503,
  );
  const { config, secret } = await connection(
    ctx,
    step.verifierConnectionId,
    "workflow-probe",
    true,
    step.verifierConnectionRevision,
  );
  assert(
    Array.isArray(config.allowedHosts) &&
      typeof config.url === "string" &&
      secret.token,
    "verifier_configuration_required",
    503,
  );
  const url = new URL(config.url);
  assert(
    url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      config.allowedHosts.includes(url.hostname) &&
      !/^([\d.]+|\[.*\]|localhost|.*\.local)$/.test(url.hostname),
    "probe_host_denied",
    403,
  );
  const nonce = crypto.randomUUID();
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("target", step.target);
  url.searchParams.set("beneficiary", step.beneficiaryId);
  const desired =
    step.action.endsWith(".add") ||
    step.action === "identity.create" ||
    step.action.startsWith("deployment.")
      ? "usable"
      : "denied";
  url.searchParams.set("desired", desired);
  const start = Date.now();
  const r = await providerFetch(
    ctx,
    step.verifierConnectionId!,
    "workflow_probe",
    url,
    {
      headers: {
        Authorization: `Bearer ${secret.token}`,
        "Cache-Control": "no-cache",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    },
  );
  assert(r.ok, "probe_failed", 503);
  const v: any = await r.json();
  assert(
    v.nonce === nonce &&
      v.target === step.target &&
      v.beneficiaryId === step.beneficiaryId &&
      v.verifierVersion === 1 &&
      v.actionVersion === 1 &&
      Date.parse(v.observedAt) >= start &&
      Date.parse(v.observedAt) <= Date.now() + 1000 &&
      v.expectedOutcome === desired &&
      v.negativeControl === true &&
      v.usableWorkflow === true,
    "probe_evidence_invalid",
  );
  const cohort = step.cohort || [step.beneficiaryId];
  assert(
    Array.isArray(v.cohort) &&
      cohort.length === v.cohort.length &&
      cohort.every((x) => v.cohort.includes(x)),
    "probe_cohort_mismatch",
  );
  return {
    nonce,
    observedAt: v.observedAt,
    cohort,
    negativeControl: true,
    usableWorkflow: true,
  };
}
export async function discoverMicrosoft(
  ctx: CoreContext,
  connectionId: string,
) {
  const step = { connectionId } as Step;
  const request = await graph(ctx, step, true);
  const resources = [
    "users?$select=id,displayName,userPrincipalName,accountEnabled&$top=100",
    "groups?$select=id,displayName&$top=100",
    "subscribedSkus",
  ];
  const observations = [];
  for (const path of resources) {
    const r = await request("/" + path);
    assert(r.ok, "discovery_failed", 503);
    const value: any = await r.json();
    assert(Array.isArray(value.value), "discovery_invalid", 503);
    observations.push({
      resource: path.split("?")[0],
      items: value.value,
      complete: !value["@odata.nextLink"],
      observedAt: new Date().toISOString(),
    });
  }
  return {
    observations,
    coverage: observations.every((x) => x.complete) ? "complete" : "partial",
    writeConsent: "Grants are separate from discovery",
  };
}
