import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url), wrangler = createRequire(require.resolve("wrangler/package.json"));
const { build } = wrangler("esbuild");
const compiled = await build({ entryPoints: [fileURLToPath(new URL("../../src/ui/drafts.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "neutral", logLevel: "silent" });
const { draftKey, readDraft, writeDraft, clearDrafts } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

const values = new Map();
const storage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { values.set(key, value); },
  removeItem(key) { values.delete(key); },
};
const session = {
  principal: { workspaceId: "fixture-workspace", userId: "fixture-owner", roles: ["owner"] },
  csrfToken: "fixture-session-one",
};
const first = await draftKey(session, "request-one"), second = await draftKey(session, "request-two");
const draft = { body: "Unsent first request", visibility: "private", messageId: crypto.randomUUID() };
writeDraft(storage, first, draft);
writeDraft(storage, second, { body: "Different request", visibility: "public" });
assert.deepEqual(readDraft(storage, first, true), draft);
assert.equal(readDraft(storage, second, true).body, "Different request");
writeDraft(storage, first, { body: "", visibility: "public", attachmentName: "synthetic.txt" });
assert.equal(readDraft(storage, first, true).attachmentName, "synthetic.txt", "File-only draft retains its reselection reminder");
writeDraft(storage, first, { body: "Keep this text", visibility: "public", attachmentName: "synthetic.txt" });
writeDraft(storage, first, { body: "Keep this text", visibility: "public", attachmentName: "" });
assert.equal(readDraft(storage, first, true).body, "Keep this text", "Removing the missing attachment does not remove text");
writeDraft(storage, first, draft);
assert.equal(await draftKey(session, "request-one"), first, "Reload scope is stable");
for (const altered of [
  { ...session, csrfToken: "fixture-session-two" },
  { ...session, principal: { ...session.principal, userId: "other-user" } },
  { ...session, principal: { ...session.principal, workspaceId: "other-workspace" } },
  { ...session, principal: { ...session.principal, roles: ["employee"] } },
]) {
  const changedKey = await draftKey(altered, "request-one");
  assert.notEqual(changedKey, first);
  assert.equal(readDraft(storage, changedKey, true).body, "");
}
assert.equal(readDraft(storage, first, false).body, "", "Private draft cannot become a public reply after loss of role");
assert.ok(!first.includes(session.csrfToken), "Storage key contains no session credential");
writeDraft(storage, first, { body: "", visibility: "public" });
assert.equal(storage.getItem(first), null, "Successful send removes its draft only");
assert.equal(readDraft(storage, second, true).body, "Different request");
for (const invalid of ["{", JSON.stringify({ body: "x", visibility: "other" }), JSON.stringify({ body: "x".repeat(50001), visibility: "public" })]) {
  storage.setItem(first, invalid);
  assert.equal(readDraft(storage, first, true).body, "");
}
storage.setItem("unrelated-preference", "keep");
clearDrafts(storage);
assert.equal(storage.getItem(second), null, "Logout clears owned drafts");
assert.equal(storage.getItem("unrelated-preference"), "keep");
assert.throws(() => readDraft({ getItem() { throw Error("Storage blocked"); } }, first, true));
console.log("PASS per-request draft retention, session/user/workspace/role isolation, message identity, private-role denial, send/logout cleanup, malformed data and storage failure");
