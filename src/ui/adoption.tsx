import { AdoptionChoices } from "./adoption-choices";
import { ImportFiles } from "./import-files";
import { useState } from "react";
import { useMutation, useRemote } from "./state";
import { ActionForm } from "./forms";
import { date, text, type RecordValue } from "./api";
import { Hero, ErrorNotice, Evidence, Notice, Badge, Empty } from "./primitives";
export function AdoptionSpace({ selectedId }: { selectedId?: string }) {
  const action = useMutation(),
    [exportId, setExportId] = useState(""),
    [exportResult, setExportResult] = useState<RecordValue | null>(null),
    record = useRemote<RecordValue>(
      selectedId ? `/imports/${selectedId}` : null,
    ),
    holds = useRemote<RecordValue[]>("/adoption/holds"),
    sources = useRemote<RecordValue[]>("/adoption/sources"),
    imports = useRemote<RecordValue[]>(selectedId ? null : "/imports"),
    connections = useRemote<RecordValue[]>("/connections"),
    freshservice = (connections.data ?? []).filter(
      (c) => c.provider === "freshservice" && c.status === "active",
    );
  async function advance() {
    const result = await action.mutate<RecordValue>(
      `/exports/${exportId}/advance`,
      {},
    );
    if (result) setExportResult(result);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportResult, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linen-manifest.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <Hero
        eyebrow="Ownership & portability"
        title="Bring the history. Keep your choices."
      >
        <p className="lead">
          Review imported meaning before adopting it. Restored history never
          silently restores permission to act.
        </p>
      </Hero>
      <ErrorNotice error={action.error ?? record.error} />
      {selectedId ? (
        <>
          <Evidence title="Import state and report" value={record.data} />
          <ImportFiles id={selectedId} onSaved={record.refresh} />
          <ActionForm
            title="Map an imported principal to a reviewed current member"
            path={`/imports/${selectedId}/identities`}
            fields={[
              {
                name: "sourceUserId",
                label: "Source identity",
                required: true,
              },
              {
                name: "targetUserId",
                label: "Reviewed current identity",
                required: true,
              },
            ]}
            onSaved={record.refresh}
          />
          <ActionForm
            title="Check this import"
            path={`/imports/${selectedId}/dry-run`}
            fields={[]}
            submit="Check meaning and references"
            onSaved={record.refresh}
          />
          <ActionForm
            title="Adopt reviewed history"
            path={`/imports/${selectedId}/apply`}
            fields={[
              {
                name: "acceptSemanticLoss",
                label: "I reviewed and accept the losses listed in the dry run",
                type: "checkbox",
              },
            ]}
            submit="Apply reviewed import"
            onSaved={record.refresh}
          />
          <Notice>
            Imported execution remains held until a current owner reconciles
            evidence and explicitly releases the hold.
          </Notice>
        </>
      ) : (
        <>
          <AdoptionChoices />
          <ActionForm
            title="Create a portable snapshot"
            path="/exports"
            defaults={{ idempotencyKey: crypto.randomUUID() }}
            fields={[]}
            submit="Start snapshot"
            onSaved={(r) => {
              setExportId(text(r.id));
              setExportResult(r);
            }}
          />
          {exportId && (
            <section>
              <h2>Your snapshot</h2>
              <p>Snapshot {exportId}</p>
              <button
                className="action"
                disabled={action.pending}
                onClick={advance}
              >
                Continue snapshot
              </button>
              {exportResult?.state === "ready" && (
                <>
                  <button className="action" onClick={download}>
                    Download manifest
                  </button>
                  {Array.isArray(exportResult.chunks) &&
                    exportResult.chunks.map((chunk: any) => (
                      <p key={chunk.ordinal}>
                        <a
                          href={`/api/v1/exports/${exportId}/chunks/${chunk.ordinal}`}
                          download
                        >
                          Download chunk {chunk.ordinal}
                        </a>
                      </p>
                    ))}
                </>
              )}
              <Evidence value={exportResult} />
            </section>
          )}
          <ActionForm
            title="Import a native manifest"
            path="/imports"
            defaults={{ idempotencyKey: crypto.randomUUID() }}
            fields={[
              {
                name: "manifest",
                label: "Export manifest",
                type: "json",
                required: true,
              },
            ]}
            onSaved={(r) => {
              location.hash = `/imports/${r.id}`;
            }}
          />
          {Boolean(imports.data?.length) && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                location.hash = `/imports/${new FormData(e.currentTarget).get("id")}`;
              }}
            >
              <label>
                Resume an import
                <select name="id" required defaultValue="">
                  <option value="">Choose…</option>
                  {imports.data!.map((i) => (
                    <option key={text(i.id)} value={text(i.id)}>
                      Started {date(i.created_at)} · {text(i.state)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="action secondary">Open import</button>
            </form>
          )}
        </>
      )}
      <section className="history">
        <h2>Incumbent sources</h2>
        {sources.data?.map((s) => (
          <section key={text(s.id)}>
            <p>Freshservice workspace {text(s.source_workspace)}</p>
            <Badge value={s.state} />
            <ActionForm
              title="Read the next source page"
              path={`/adoption/sources/${s.id}/poll`}
              fields={[]}
              onSaved={sources.refresh}
            />
          </section>
        ))}
        <ErrorNotice error={connections.error} retry={connections.refresh} />
        {connections.data && (freshservice.length ? (
          <ActionForm
            title="Connect an incumbent source"
            path="/adoption/sources"
            fields={[
              {
                name: "connectionId",
                label: "Validated Freshservice connection",
                type: "select",
                required: true,
                options: freshservice.map((c) => ({ value: text(c.id), label: text(c.name) })),
                value: freshservice.length === 1 ? text(freshservice[0].id) : undefined,
              },
              {
                name: "sourceWorkspace",
                label: "Source workspace number",
                type: "number",
                required: true,
              },
              {
                name: "since",
                label: "Read changes since",
                type: "datetime-local",
                hint: "Optional. Leave empty to read the whole history.",
              },
            ]}
            onSaved={sources.refresh}
          />
        ) : (
          <Notice>
            Connect and check a Freshservice existing desk in{" "}
            <a href="#/connections">Connections &amp; setup</a> first. Its validated
            connection is then offered here.
          </Notice>
        ))}
      </section>
      <section className="history">
        <h2>Execution holds</h2>
        <ErrorNotice error={holds.error} />
        {holds.data && !holds.data.length && (
          <Empty title="Nothing is held.">
            Imported work that was in flight waits here until you reconcile and
            release it.
          </Empty>
        )}
        {holds.data?.map((h) => (
          <section key={text(h.id)}>
            <p>{text(h.reason ?? h.id)}</p>
            <Badge value={h.state} />
            <ActionForm
              title="Reconcile current evidence"
              path={`/adoption/holds/${h.id}/reconcile`}
              fields={[
                { name: "historyId", label: "History identity", required: true },
                {
                  name: "evidence",
                  label: "Independent current evidence",
                  type: "json",
                  required: true,
                },
              ]}
              onSaved={holds.refresh}
            />
            <ActionForm
              title="Release reconciled hold"
              path={`/adoption/holds/${h.id}/release`}
              defaults={{ revision: h.revision }}
              fields={[]}
              onSaved={holds.refresh}
            />
          </section>
        ))}
      </section>
    </>
  );
}
