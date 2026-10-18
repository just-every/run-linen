// What people read for Linen's internal keys: roles, obligation kinds, audiences, visibility, connection
// providers and the field names of recorded objects.
import { humanize, text } from "./api";
import { recordFacts } from "./record-facts";
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
  "device.deliver": "Device delivery",
  "device.return": "Device return",
  "identity.create": "Account creation",
  "identity.disable": "Account deactivation",
  "sessions.revoke": "Sign-out everywhere",
};
export const kindLabel = (kind: unknown) => kindLabels[text(kind)] ?? humanize(kind);

/** Who an article is for, as the Knowledge form offers it. */
const audienceLabels: Record<string, string> = { employees: "Employees", operators: "Service operators", hr: "HR only" };
export const audienceLabel = (scope: unknown) => audienceLabels[text(scope)] ?? humanize(scope);

/** Who may see a service record, as its form offers it. */
const visibilityLabels: Record<string, string> = { workspace: "Everyone in this workspace", operators: "Service operators", restricted: "Owner and named participants" };
export const visibilityLabel = (value: unknown) => visibilityLabels[text(value)] ?? humanize(value);

export const providerLabel = (provider: unknown) =>
  providers.find((p) => p.value === provider)?.label ?? humanize(provider);

/** A recorded object (request context, connection scope) as fact rows; nothing when it is empty or not an object. */
export function objectFacts(json: unknown): [string, unknown][] {
  try {
    const value = JSON.parse(String(json ?? ""));
    return value && typeof value === "object" && !Array.isArray(value) ? recordFacts(value) : [];
  } catch {
    return [];
  }
}
