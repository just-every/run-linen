// What people read for Linen's internal keys: roles, obligation kinds and connection providers.
import { humanize, text } from "./api";
import { providers } from "./connection-form";

export const roleLabels: Record<string, string> = {
  owner: "Owner",
  operator: "Service team",
  employee: "Employee",
  approver: "Approver",
  hr: "HR",
  auditor: "Auditor",
  integration: "Integration",
};
export const roleLabel = (role: unknown) => roleLabels[text(role)] ?? humanize(role);

/** Roles are stored as a JSON list; people read them as words. */
export function roleList(value: unknown) {
  try {
    const roles = JSON.parse(String(value));
    return Array.isArray(roles) ? roles.map(roleLabel).join(", ") : text(value);
  } catch {
    return text(value);
  }
}

const kindLabels: Record<string, string> = {
  "access.grant": "Access grant",
  "access.revoke": "Access removal",
};
export const kindLabel = (kind: unknown) => kindLabels[text(kind)] ?? humanize(kind);

export const providerLabel = (provider: unknown) =>
  providers.find((p) => p.value === provider)?.label ?? humanize(provider);

/** A recorded object (request context, connection scope) as fact rows; nothing when it is empty or not an object. */
export function objectFacts(json: unknown): [string, unknown][] {
  try {
    const value = JSON.parse(String(json ?? ""));
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).map(([key, item]) => [humanize(key), Array.isArray(item) ? item.join(", ") : item])
      : [];
  } catch {
    return [];
  }
}
