import { encryptSecret, decryptSecret } from "../../platform/crypto";
import { now } from "../../platform/http";
import { graph } from "./connectors";
import { assert } from "./authority";
import type { CoreContext, Step } from "./types";
export async function identityObserve(
  ctx: CoreContext,
  step: Step,
  operationId: string,
) {
  const request = await graph(ctx, step);
  const r = await request(
    `/users/${encodeURIComponent(step.target)}?$select=id,userPrincipalName,accountEnabled,onPremisesExtensionAttributes,signInSessionsValidFromDateTime`,
  );
  if (r.status === 404) {
    assert(step.action === "identity.create", "identity_missing", 409);
    return {
      matches: false,
      present: false,
      observedAt: now(),
      target: step.target,
      beneficiaryId: step.beneficiaryId,
    };
  }
  assert(r.ok, "identity_observation_failed", 503);
  const u: any = await r.json();
  let matches = false;
  if (step.action === "identity.create") {
    assert(
      u.userPrincipalName?.toLowerCase() === step.target.toLowerCase(),
      "identity_target_mismatch",
    );
    assert(
      u.onPremisesExtensionAttributes?.extensionAttribute15 ===
        `linen:${operationId}`,
      "preexisting_identity_not_owned",
      409,
    );
    matches = true;
  } else if (step.action === "identity.disable")
    matches = u.accountEnabled === false;
  else {
    const attempt: any = await ctx.env.DB.prepare(
      "SELECT started_at FROM execution_attempts WHERE operation_id=? AND workspace_id=? AND kind='dispatch' ORDER BY started_at DESC LIMIT 1",
    )
      .bind(operationId, ctx.principal.workspaceId)
      .first();
    matches =
      !!attempt &&
      Date.parse(u.signInSessionsValidFromDateTime) >=
        Date.parse(attempt.started_at);
  }
  return {
    matches,
    present: true,
    observedAt: now(),
    target: step.target,
    beneficiaryId: step.beneficiaryId,
  };
}
export async function identityWrite(
  ctx: CoreContext,
  step: Step,
  operationId: string,
) {
  const request = await graph(ctx, step, false, operationId);
  let response: Response;
  if (step.action === "identity.create") {
    const p = step.payload;
    assert(
      p &&
        typeof p.displayName === "string" &&
        p.displayName.length > 0 &&
        typeof p.mailNickname === "string" &&
        /^[a-zA-Z0-9._-]+$/.test(p.mailNickname) &&
        /^[^\s@]+@[^\s@]+$/.test(step.target),
      "identity_profile_required",
      422,
    );
    let secret = await ctx.env.DB.prepare(
      "SELECT ciphertext FROM execution_secrets WHERE operation_id=? AND workspace_id=?",
    )
      .bind(operationId, ctx.principal.workspaceId)
      .first<{
        ciphertext: string;
      }>();
    if (!secret) {
      const password = crypto.randomUUID() + crypto.randomUUID() + "aA1!";
      await ctx.env.DB.prepare(
        "INSERT OR IGNORE INTO execution_secrets VALUES(?,?,?,?)",
      )
        .bind(
          operationId,
          ctx.principal.workspaceId,
          await encryptSecret(ctx.env.ENCRYPTION_KEY, password),
          now(),
        )
        .run();
      secret = await ctx.env.DB.prepare(
        "SELECT ciphertext FROM execution_secrets WHERE operation_id=? AND workspace_id=?",
      )
        .bind(operationId, ctx.principal.workspaceId)
        .first<{
          ciphertext: string;
        }>();
    }
    assert(secret, "identity_secret_unavailable", 503);
    response = await request("/users", "POST", {
      accountEnabled: true,
      userPrincipalName: step.target,
      displayName: p.displayName,
      mailNickname: p.mailNickname,
      passwordProfile: {
        forceChangePasswordNextSignIn: true,
        password: await decryptSecret(
          ctx.env.ENCRYPTION_KEY,
          secret.ciphertext,
        ),
      },
      onPremisesExtensionAttributes: {
        extensionAttribute15: `linen:${operationId}`,
      },
    });
  } else if (step.action === "identity.disable")
    response = await request(
      `/users/${encodeURIComponent(step.target)}`,
      "PATCH",
      { accountEnabled: false },
    );
  else
    response = await request(
      `/users/${encodeURIComponent(step.target)}/revokeSignInSessions`,
      "POST",
      {},
    );
  return {
    accepted: response.ok,
    status: response.status,
    unknown:
      (response.status >= 300 && response.status < 400) ||
      response.status >= 500 ||
      response.status === 408,
  };
}
