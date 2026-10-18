import { useState } from "react";
import { date, text, type RecordValue } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import {
  Badge,
  Empty,
  ErrorNotice,
  Evidence,
  Facts,
  Hero,
  Loading,
  Notice,
} from "./primitives";
import { ActionForm } from "./forms";
import { ConnectionForm } from "./connection-form";
import { DiscoveryReview } from "./discovery";
import { IdentityReview } from "./identity-review";
import { objectFacts, providerLabel } from "./labels";
import { Icon } from "./icons";
export function Connections() {
  const connections = useRemote<RecordValue[]>("/connections"),
    settings = useRemote<{ settings: RecordValue; revision: number }>(
      "/settings",
    ),
    [adding, setAdding] = useState(false),
    [editing, setEditing] = useState<RecordValue | null>(null),
    [version, setVersion] = useState(0),
    { session } = useSession();
  function refresh() {
    connections.refresh();
    settings.refresh();
    setVersion((v) => v + 1);
    setAdding(false);
    setEditing(null);
  }
  return (
    <div className="layout">
      <main>
        <Hero title="Connections & setup">
          <p className="lead">
            Let’s make it your workspace. Connect the systems you use. Linen gathers the available facts, then
            brings the meaningful gaps and choices into one review.
          </p>
        </Hero>
        <section className="history">
          <div className="section-heading">
            <h2>Your connections</h2>
            {session.principal.roles.includes("owner") && (
              <button
                className="action secondary"
                onClick={() => {
                  setAdding(!adding);
                  setEditing(null);
                }}
              >
                Connect a service
              </button>
            )}
          </div>
          {connections.loading ? (
            <Loading label="Reading connections…" />
          ) : connections.error ? (
            <ErrorNotice
              error={connections.error}
              retry={connections.refresh}
            />
          ) : connections.data?.length ? (
            connections.data.map((connection) => (
              <ConnectionCard
                key={text(connection.id)}
                connection={connection}
                settings={settings.data}
                refresh={refresh}
                onEdit={() => {
                  setEditing(connection);
                  setAdding(false);
                }}
              />
            ))
          ) : (
            <Empty title="Bring your real world into view.">
              Start with your identity provider, existing desk or reasoning
              connection. Your conversations are ready in the meantime.
            </Empty>
          )}
        </section>
        {(adding || editing) && (
          <ConnectionForm
            existing={editing ?? undefined}
            onSaved={refresh}
            onCancel={() => {
              setAdding(false);
              setEditing(null);
            }}
          />
        )}
        <DiscoveryReview revision={version} onChanged={refresh} />
        <IdentityReview key={version} />
      </main>
      <aside className="context-rail">
        <section className="rail-section">
          <h2>A small, considered start.</h2>
          <p>
            One source at a time. Provider sign-in and consent stay with the
            people who hold that authority.
          </p>
          <a href="#/grants">Review standing grants</a>
          <a href="#/members">People & permissions</a>
          <a href="#/services">Service ownership</a>
          <a href="#/imports">Existing desk & backups</a>
        </section>
        <details className="evidence">
          <summary>What this setup establishes</summary>
          <p>
            A validated connection proves only its declared read check.
            Discovery cannot invent approval ownership, grant write authority or
            verify an employee outcome.
          </p>
        </details>
        <ActionForm
          title="Reasoning spending limit"
          path="/intelligence/budget"
          method="PUT"
          fields={[
            {
              name: "limitUsd",
              label: "Total budget · USD",
              type: "number",
              required: true,
            },
          ]}
          explanation="Estimates, failed attempts and reserved uncertain charges count. This does not hide unresolved service obligations."
        />
      </aside>
    </div>
  );
}
const providerIcons: Record<string, string> = {
  "microsoft-graph": "users",
  freshservice: "monitor",
  openai: "file",
  sendgrid: "mail",
};
function ConnectionCard({
  connection,
  settings,
  refresh,
  onEdit,
}: {
  connection: RecordValue;
  settings: { settings: RecordValue; revision: number } | null;
  refresh: () => void;
  onEdit: () => void;
}) {
  const action = useMutation(),
    [result, setResult] = useState<RecordValue | null>(null),
    [snapshot, setSnapshot] = useState<RecordValue | null>(null);
  async function run(command: string) {
    const body =
      command === "discover"
        ? {
            revision: connection.revision,
            ...(snapshot?.canResume
              ? {
                  snapshotId: snapshot.snapshotId,
                  snapshotRevision: snapshot.snapshotRevision,
                }
              : {}),
          }
        : { revision: connection.revision };
    const next = await action.mutate<RecordValue>(
      `/connections/${connection.id}/${command}`,
      body,
    );
    if (next) {
      setResult(next);
      if (command === "discover") setSnapshot(next);
      refresh();
    }
  }
  async function makeDefault() {
    const next = await action.mutate<RecordValue>("/connection-default-model", {
      connectionId: connection.id,
      connectionRevision: connection.revision,
      settingsRevision: settings?.revision,
    });
    if (next) {
      setResult(next);
      refresh();
    }
  }
  return (
    <section className="connection-record">
      <div className="section-heading">
        <span className="event-icon"><Icon name={providerIcons[text(connection.provider)] ?? "nodes"} /></span>
        <h3>{text(connection.name)}</h3>
        <Badge value={connection.status} />
      </div>
      <p className="fact-note">
        {providerLabel(connection.provider)} · Updated {date(connection.updated_at)}
      </p>
      <div className="button-row">
        <button
          className="action secondary"
          disabled={action.pending}
          onClick={() => run("test")}
        >
          {action.pending
            ? "Checking…"
            : connection.status === "active"
              ? "Check again"
              : "Check connection"}
        </button>
        {connection.status === "active" &&
          ["microsoft-graph", "freshservice"].includes(
            text(connection.provider),
          ) && (
            <button
              className="action primary"
              disabled={action.pending}
              onClick={() => run("discover")}
            >
              {snapshot?.canResume
                ? "Continue discovery"
                : "Discover available facts"}
            </button>
          )}
        {connection.provider === "openai" &&
          connection.status === "active" &&
          (settings?.settings.defaultModelConnectionId === connection.id ? (
            <span className="chip">Default reasoning connection</span>
          ) : (
            <button
              className="action primary"
              onClick={makeDefault}
              disabled={action.pending || !settings}
            >
              Use for service reasoning
            </button>
          ))}
      </div>
      <ErrorNotice error={action.error} />
      {result && (
        <Evidence value={result} title="Latest check and its limits" />
      )}
      <details className="evidence manage">
        <summary>Manage</summary>
        <button className="text-button" onClick={onEdit}>
          Edit connection
        </button>
        <Facts entries={objectFacts(connection.config_json)} />
        {connection.provider === "sendgrid" && (
          <Notice>
            <strong>Configure signed delivery events</strong>
            <p>In SendGrid’s Event Webhook settings, enable signature verification and use this exact endpoint on your publicly reachable Linen deployment:</p>
            <p style={{ overflowWrap: "anywhere" }}><code>{`${window.location.origin}/api/v1/notifications/webhooks/${encodeURIComponent(text(connection.id))}`}</code></p>
            <p>Enable delivered, bounce and dropped events. A local preview address is not reachable by SendGrid; use the deployed HTTPS origin when configuring the provider.</p>
            <p>{connection.status === "active" ? "Read check passed for the account, mail.send scope and exact verified sender." : "The read check has not established an active connection."} No email is sent by this check. Delivery remains unverified until a signed event is correlated with an actual notification; saving or checking this connection does not establish delivery.</p>
            <p>This connection is not selectable as the workspace notification default; that setting currently supports the existing notification webhook only.</p>
          </Notice>
        )}
        <ActionForm
          title="Disconnect this source"
          path={`/connections/${connection.id}/disconnect`}
          defaults={{ revision: connection.revision }}
          fields={[]}
          submit="Disconnect and remove credential"
          explanation="Future credential acquisition stops. Any in-flight effects remain for reconciliation."
          onSaved={refresh}
        />
      </details>
    </section>
  );
}
