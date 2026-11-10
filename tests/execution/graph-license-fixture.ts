// Isolated Microsoft Graph network edge for license assignment: schema-shaped
// assignLicense and licenseDetails responses for one tenant, nothing else.
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const route = /^\/v1\.0\/users\/([^/]+)\/(assignLicense|licenseDetails)$/;
export const E3_SKU = "6fd2c87f-b296-42f0-b197-1e91e994b900";
export const E5_SKU = "c7df2760-2c81-4ef7-b578-5b5392b571df";
const partNumbers: Record<string, string> = {
  [E3_SKU]: "ENTERPRISEPACK",
  [E5_SKU]: "SPE_E5",
};
let assigned = new Map<string, string[]>();
let log: { op: "read" | "assign"; user: string; skus: string[] }[] = [];
let readback: "faithful" | "wrong-sku" = "faithful";

export function graphLicenseControl(b: any = {}) {
  if (b.reset) {
    assigned = new Map();
    log = [];
  }
  if (b.readback) readback = b.readback;
  return { log, assigned: Object.fromEntries(assigned) };
}

export async function graphLicenseEdge(
  u: URL,
  init: any = {},
): Promise<Response | undefined> {
  const m = u.hostname === "graph.microsoft.com" && route.exec(u.pathname);
  if (!m) return undefined;
  const user = decodeURIComponent(m[1]);
  const bearer = String(init.headers?.Authorization || "");
  if (!bearer.startsWith("Bearer "))
    return Response.json({ error: { code: "InvalidAuthenticationToken" } }, { status: 401 });
  const held = assigned.get(user) || [];
  if (m[2] === "licenseDetails") {
    if ((init.method || "GET") !== "GET") return new Response(null, { status: 405 });
    const shown =
      readback === "wrong-sku" && held.length ? [E5_SKU] : held;
    log.push({ op: "read", user, skus: [...shown] });
    return Response.json({
      "@odata.context": `https://graph.microsoft.com/v1.0/$metadata#users('${user}')/licenseDetails`,
      value: shown.map((skuId, i) => ({
        id: `synthetic-linen-license-${i}`,
        skuId,
        skuPartNumber: partNumbers[skuId] || "UNKNOWN",
        servicePlans: [],
      })),
    });
  }
  if (init.method !== "POST") return new Response(null, { status: 405 });
  const body = JSON.parse(String(init.body || "{}"));
  const add: string[] = (body.addLicenses || []).map((x: any) => x?.skuId);
  const remove: string[] = body.removeLicenses || [];
  if (
    !Array.isArray(body.addLicenses) ||
    !Array.isArray(body.removeLicenses) ||
    ![...add, ...remove].every((x) => typeof x === "string" && guid.test(x)) ||
    add.some((x) => held.includes(x))
  )
    return Response.json({ error: { code: "Request_BadRequest" } }, { status: 400 });
  assigned.set(user, [...held.filter((x) => !remove.includes(x)), ...add]);
  log.push({ op: "assign", user, skus: add });
  return Response.json({
    "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users/$entity",
    id: user,
    assignedLicenses: assigned.get(user)!.map((skuId) => ({ skuId, disabledPlans: [] })),
  });
}
