import type { Session } from "./api";

const prefix = "linen:conversation-draft:v1:";
export type Draft = { body: string; visibility: string; messageId?: string; attachmentName?: string;departmentId?:string };
export async function draftKey(session: Session, workId?: string) {
  const scope = JSON.stringify([
    session.principal.workspaceId,
    session.principal.userId,
    session.csrfToken,
    [...session.principal.roles].sort(),
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(scope));
  const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}${fingerprint}:${workId ?? "new"}`;
}
export function readDraft(storage: Storage, key: string, privateAllowed: boolean): Draft {
  const value = storage.getItem(key);
  if (!value) return { body: "", visibility: "public" };
  let draft: Draft;
  try { draft = JSON.parse(value); } catch { return { body: "", visibility: "public" }; }
  if (typeof draft?.body !== "string" || draft.body.length > 50000 ||
      !["public", "private"].includes(draft.visibility) ||
      (draft.attachmentName !== undefined && (typeof draft.attachmentName !== "string" || draft.attachmentName.length > 1024)) ||
      (draft.departmentId !== undefined && (typeof draft.departmentId !== 'string'||draft.departmentId.length>200)) ||
      (draft.messageId !== undefined && (typeof draft.messageId !== "string" || !/^[a-f0-9-]{36}$/i.test(draft.messageId))) ||
      (draft.visibility === "private" && !privateAllowed)) return { body: "", visibility: "public" };
  return draft;
}
export function writeDraft(storage: Storage, key: string, draft: Draft) {
  if (draft.body || draft.attachmentName || draft.departmentId) storage.setItem(key, JSON.stringify(draft));
  else storage.removeItem(key);
}
export function clearDrafts(storage: Storage) {
  for (let index = storage.length - 1; index >= 0; index--) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) storage.removeItem(key);
  }
}
