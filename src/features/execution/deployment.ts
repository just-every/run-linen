import { providerFetch } from "./transport";
import { connection } from "./connectors";
import { assert } from "./authority";
import type { CoreContext, Step } from "./types";
async function endpoint(ctx: CoreContext, step: Step) {
  const c = await connection(
    ctx,
    step.connectionId,
    "controlled-deployment",
    true,
    step.connectionRevision,
  );
  const u = new URL(c.config.url);
  assert(
    u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      Array.isArray(c.config.allowedHosts) &&
      c.config.allowedHosts.includes(u.hostname) &&
      !/^([\d.]+|\[.*\]|localhost|.*\.local)$/.test(u.hostname) &&
      c.secret.token,
    "deployment_configuration_invalid",
    503,
  );
  assert(
    Array.isArray(c.config.targets) && c.config.targets.includes(step.target),
    "deployment_target_denied",
    403,
  );
  return { ...c, url: u };
}
export async function deploymentWrite(
  ctx: CoreContext,
  step: Step,
  operationId: string,
) {
  const c = await endpoint(ctx, step);
  const r = await providerFetch(
    ctx,
    step.connectionId,
    "deployment",
    c.url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${c.secret.token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": operationId,
      },
      body: JSON.stringify({
        operationId,
        action: step.action,
        target: step.target,
        beneficiaryId: step.beneficiaryId,
        payload: step.payload,
      }),
      redirect: "manual",
      signal: AbortSignal.timeout(20000),
    },
    operationId,
  );
  return {
    accepted: r.ok,
    status: r.status,
    unknown:
      (r.status >= 300 && r.status < 400) ||
      r.status >= 500 ||
      r.status === 408,
  };
}
export async function deploymentObserve(
  ctx: CoreContext,
  step: Step,
  operationId: string,
) {
  const c = await endpoint(ctx, step);
  c.url.searchParams.set("operationId", operationId);
  c.url.searchParams.set("target", step.target);
  const nonce = crypto.randomUUID();
  c.url.searchParams.set("nonce", nonce);
  const start = Date.now();
  const r = await providerFetch(ctx, step.connectionId, "deployment", c.url, {
    headers: {
      Authorization: `Bearer ${c.secret.token}`,
      "Cache-Control": "no-cache",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  assert(r.ok, "deployment_observation_failed", 503);
  const v: any = await r.json();
  assert(
    v.operationId === operationId &&
      v.target === step.target &&
      v.nonce === nonce &&
      Date.parse(v.observedAt) >= start &&
      Date.parse(v.observedAt) <= Date.now() + 1000,
    "deployment_observation_invalid",
  );
  return {
    terminal: v.terminal === true && v.state === "not_applied",
    matches: v.state === "applied",
    present: v.state === "applied",
    observedAt: v.observedAt,
    target: step.target,
    beneficiaryId: step.beneficiaryId,
  };
}
