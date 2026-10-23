import { useState, type FormEvent } from "react";
import { text, type RecordValue } from "./api";
import { useMutation } from "./state";
import { ErrorNotice, Notice } from "./primitives";
import { Fields, readFields, type Field } from "./forms";
export const providers = [
  { value: "microsoft-graph", label: "Microsoft identity & licenses" },
  { value: "freshservice", label: "Freshservice existing desk" },
  { value: "workflow-probe", label: "Independent workflow verifier" },
  { value: "openai", label: "OpenAI reasoning" },
  { value: "controlled-deployment", label: "Owned release endpoint" },
  { value: "notification-webhook", label: "Notification delivery" },
  { value: "sendgrid", label: "SendGrid email delivery" },
  { value: "gmail", label: "Gmail support mailbox" },
  { value: "exchange-online", label: "Exchange Online support mailbox" },
  { value: "monitoring-webhook", label: "Monitoring events" },
];
export function ConnectionForm({
  onSaved,
  onCancel,
  existing,
}: {
  onSaved: () => void;
  onCancel: () => void;
  existing?: RecordValue;
}) {
  const [savedConnection, setSavedConnection] = useState<RecordValue | null>(
    null,
  );
  const [provider, setProvider] = useState(
      text(existing?.provider, "microsoft-graph"),
    ),
    mutation = useMutation(),
    old = existing ? JSON.parse(text(existing.config_json, "{}")) : {},
    required = !existing;
  const fields: Field[] =
    provider === "microsoft-graph"
      ? [
          {
            name: "tenantId",
            label: "Microsoft tenant ID",
            required: true,
            value: old.tenantId,
          },
          { name: "clientId", label: "Application client ID", required },
          {
            name: "clientSecret",
            label: "Application client secret",
            type: "password",
            required,
          },
        ]
      : provider === "freshservice"
        ? [
            {
              name: "domain",
              label: "Freshservice domain",
              required: true,
              value: old.domain,
              hint: "Your exact tenant.freshservice.com hostname.",
            },
            { name: "apiKey", label: "API key", type: "password", required },
          ]
        : provider === "gmail" || provider === "exchange-online"
          ? [
              { name: "mailbox", label: "Support mailbox address", type: "email", required: true, value: old.mailbox,
                hint: "The one address employees write to, in lower case." },
              { name: "mode", label: "How Linen receives its mail", type: "select", required: true, value: old.mode ?? "oauth",
                options: [{ value: "oauth", label: "Read the mailbox with a sign-in" }, { value: "forwarding", label: "A forwarding rule delivers each message" }] },
              ...(provider === "exchange-online" ? [{ name: "tenantId", label: "Microsoft tenant ID", required: true, value: old.tenantId }] : []),
              { name: "clientId", label: "Application client ID", hint: "Needed to read the mailbox; leave blank for forwarding." },
              { name: "clientSecret", label: "Application client secret", type: "password" },
              ...(provider === "gmail" ? [{ name: "refreshToken", label: "Refresh token", type: "password" as const, hint: "Granted by the mailbox owner for read-only mail and sending." }] : []),
            ]
        : provider === "sendgrid"
          ? [
              { name: "from", label: "Exact verified sender", required: true, value: old.from,
                hint: "Use the exact verified sender email in your global SendGrid account, optionally Name <email>. Domain verification alone is not sufficient." },
              { name: "webhookPublicKey", label: "Signed Event Webhook public key", required: true, value: old.webhookPublicKey,
                hint: "Base64 P-256 SPKI verification key from SendGrid, without PEM headers. Keep the matching signing configuration enabled." },
              { name: "apiKey", label: "SendGrid API key", type: "password", required,
                hint: "A direct global-account key with mail.send and read access to scopes, account identity and verified senders. No impersonation or EU regional endpoint." },
            ]
        : provider === "openai"
          ? [
              {
                name: "model",
                label: "Available model identifier",
                required: true,
                value: old.model,
                hint: "Use a model enabled in your provider account. Linen validates its exact identity.",
              },
              { name: "apiKey", label: "API key", type: "password", required },
            ]
          : provider === "monitoring-webhook"
            ? [
                {
                  name: "signingSecret",
                  label: "Webhook signing secret",
                  type: "password",
                  required,
                },
              ]
            : [
                {
                  name: "baseUrl",
                  label: "Owned provider endpoint",
                  required: true,
                  value: old.baseUrl ?? old.url,
                  hint: "HTTPS endpoint implementing Linen’s declared provider protocol.",
                },
                {
                  name: "allowedHosts",
                  label: "Exact allowed hostnames",
                  type: "list",
                  required: true,
                  value: old.allowedHosts?.join("\n"),
                },
                {
                  name: "token",
                  label: "Scoped access token",
                  type: "password",
                  required,
                },
              ];
  if (provider === "controlled-deployment")
    fields.push({
      name: "targets",
      label: "Exact permitted deployment targets",
      type: "list",
      required: true,
      value: old.targets?.join("\n"),
    });
  const costFields: Field[] = [
    {
      name: "inputUsdPerMillion",
      label: "Input price estimate · USD / million tokens",
      type: "number",
      required: true,
      value: old.inputUsdPerMillion,
    },
    {
      name: "cachedInputUsdPerMillion",
      label: "Cached input estimate · USD / million",
      type: "number",
      required: true,
      value: old.cachedInputUsdPerMillion,
    },
    {
      name: "outputUsdPerMillion",
      label: "Output price estimate · USD / million",
      type: "number",
      required: true,
      value: old.outputUsdPerMillion,
    },
    {
      name: "maxOutputTokens",
      label: "Maximum output tokens per attempt",
      type: "number",
      required: true,
      value: old.maxOutputTokens ?? 4000,
    },
    {
      name: "maxAttemptUsd",
      label: "Maximum estimated cost per attempt · USD",
      type: "number",
      required: true,
      value: old.maxAttemptUsd,
    },
    {
      name: "limitUsd",
      label: "Total reasoning budget · USD",
      type: "number",
      required: true,
      hint: "Failed attempts and uncertain charges count. Reconciliation and expiry obligations remain visible when discretionary reasoning stops.",
    },
  ];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = readFields(event.currentTarget, [
        ...fields,
        ...(provider === "openai" ? costFields : []),
      ]),
      name = String(
        new FormData(event.currentTarget).get("name") ||
          providers.find((p) => p.value === provider)?.label,
      );
    let config: RecordValue, secret: unknown;
    if (provider === "microsoft-graph") {
      config = { tenantId: values.tenantId };
      secret = values.clientSecret
        ? JSON.stringify({
            clientId: values.clientId,
            clientSecret: values.clientSecret,
          })
        : undefined;
    } else if (provider === "freshservice") {
      config = { domain: values.domain };
      secret = values.apiKey;
    } else if (provider === "gmail" || provider === "exchange-online") {
      config = { mailbox: String(values.mailbox ?? "").trim().toLowerCase(), mode: values.mode, ...(provider === "exchange-online" ? { tenantId: values.tenantId } : {}) };
      secret = values.clientSecret ? JSON.stringify({ clientId: values.clientId, clientSecret: values.clientSecret, ...(provider === "gmail" ? { refreshToken: values.refreshToken } : {}) }) : undefined;
    } else if (provider === "sendgrid") {
      config = { ...old, from: values.from, webhookPublicKey: values.webhookPublicKey };
      secret = values.apiKey ? JSON.stringify({ apiKey: values.apiKey }) : undefined;
    } else if (provider === "openai") {
      const { apiKey, limitUsd, ...settings } = values;
      config = settings;
      secret = apiKey ? JSON.stringify({ apiKey }) : undefined;
    } else if (provider === "monitoring-webhook") {
      config = {};
      secret = values.signingSecret
        ? JSON.stringify({ signingSecret: values.signingSecret })
        : undefined;
    } else {
      config = {
        url: values.baseUrl,
        allowedHosts: values.allowedHosts,
        ...(provider === "controlled-deployment"
          ? { targets: values.targets }
          : {}),
      };
      secret = values.token
        ? JSON.stringify({ token: values.token })
        : undefined;
    }
    const result =
      savedConnection ??
      (await mutation.mutate<RecordValue>(
        existing ? `/connections/${existing.id}` : "/connections",
        {
          name,
          provider,
          config,
          ...(secret ? { secret } : {}),
          ...(existing ? { revision: existing.revision } : {}),
        },
        existing ? "PATCH" : "POST",
      ));
    if (!result) return;
    setSavedConnection(result);
    if (provider === "openai") {
      const budget = await mutation.mutate(
        "/intelligence/budget",
        { limitUsd: values.limitUsd },
        "PUT",
      );
      if (!budget) return;
    }
    onSaved();
  }
  return (
    <form className="inline-form" onSubmit={save}>
      <h2>
        {existing
          ? "Update this connection"
          : "What would you like to connect?"}
      </h2>
      <label>
        Connection
        <select
          value={provider}
          disabled={Boolean(existing)}
          onChange={(event) => setProvider(event.target.value)}
        >
          {providers.map((p) => (
            <option value={p.value} key={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      <p>
        {provider === "microsoft-graph"
          ? "Use your administrator-approved application. Linen reads the supported directory facts before you review actual service ownership."
          : provider === "sendgrid"
            ? "Save the sender and signing key, then check the connection. The check only reads account, scopes and exact verified sender; it sends no email. Signed delivery events are separate evidence."
          : provider === "openai"
            ? "Connect a real model, set a spending boundary, then validate it before making it the default."
            : "Connect the actual source. A read-only check establishes what is available before discovery or action."}
      </p>
      <details open className="evidence">
        <summary>Connection details</summary>
        <label>
          Display name
          <input
            key={provider}
            name="name"
            defaultValue={text(
              existing?.name,
              providers.find((p) => p.value === provider)?.label,
            )}
            maxLength={120}
          />
        </label>
        <Fields fields={fields} />
        {existing && (
          <small>
            Leave the credential fields blank to keep the stored secret.
          </small>
        )}
      </details>
      {provider === "openai" && (
        <details open className="evidence">
          <summary>Spending boundary and price estimates</summary>
          <p className="fact-note">
            Use your current provider prices or contract rates. These are
            estimates; actual token usage and uncertain charges remain recorded.
          </p>
          <div className="field-grid">
            <Fields fields={costFields} />
          </div>
        </details>
      )}
      <ErrorNotice error={mutation.error} />
      {savedConnection && Boolean(mutation.error) && (
        <Notice>
          The connection was saved, but its spending limit was not. Correct the
          budget and save again; the connection will not be created twice.
        </Notice>
      )}
      <div className="button-row">
        <button className="action primary" disabled={mutation.pending}>
          {mutation.pending
            ? "Saving privately…"
            : existing
              ? "Save changes"
              : "Save connection"}
        </button>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <small>
        Credentials are stored privately. Saving does not perform a provider
        write or grant service authority.
      </small>
    </form>
  );
}
