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
      <Hero eyebrow="Ownership & portability" title="Existing desk & backups">
        <p className="lead">
          Bring the history. Keep your choices. Check what an import means before you adopt it. Restored history never
          gives Linen permission to act on its own.
        </p>
      </Hero>
      <ErrorNotice error={action.error ?? record.error} />
      {selectedId ? (
        <>
          <Evidence title="Import progress and report" value={record.data} />
          <ImportFiles id={selectedId} onSaved={record.refresh} />
          <ActionForm
            title="Match an imported person to a current member"
            path={`/imports/${selectedId}/identities`}
            fields={[
              {
                name: "sourceUserId",
                label: "Person in the old system",
                hint: "Their ID in the desk the history came from, as shown in the import report.",
                required: true,
              },
              {
                name: "targetUserId",
                label: "Person in Linen",
                hint: "The member who should see their old conversations.",
                required: true,
              },
            ]}
            onSaved={record.refresh}
          />
          <ActionForm
            title="Check this import"
            path={`/imports/${selectedId}/dry-run`}
            fields={[]}
            submit="Check what will come across"
            onSaved={record.refresh}
          />
          <ActionForm
            title="Adopt the checked history"
            path={`/imports/${selectedId}/apply`}
            fields={[
              {
                name: "acceptSemanticLoss",
                label: "I have read what will not come across and accept it",
                type: "checkbox",
              },
            ]}
            submit="Adopt this import"
            onSaved={record.refresh}
          />
          <Notice>
            Imported work that was still in progress stays on hold until an owner
            confirms what really happened and releases it.
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
              <p>Your snapshot is being prepared.</p>
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
                    Download snapshot summary
                  </button>
                  {Array.isArray(exportResult.chunks) &&
                    exportResult.chunks.map((chunk: any) => (
                      <p key={chunk.ordinal}>
                        <a
                          href={`/api/v1/exports/${exportId}/chunks/${chunk.ordinal}`}
                          download
                        >
                          Download file {chunk.ordinal + 1}
                        </a>
                      </p>
                    ))}
                </>
              )}
              <Evidence value={exportResult} />
            </section>
          )}
          <ActionForm
            title="Import a Linen snapshot"
            path="/imports"
            defaults={{ idempotencyKey: crypto.randomUUID() }}
            fields={[
              {
                name: "manifest",
                label: "Snapshot summary",
                hint: "Paste the contents of the summary file you downloaded with the snapshot.",
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
        <h2>Existing desks</h2>
        {sources.data?.map((s) => (
          <section key={text(s.id)}>
            <p>Freshservice workspace {text(s.source_workspace)}</p>
            <Badge value={s.state} />
            <ActionForm
              title="Read the next batch from this desk"
              path={`/adoption/sources/${s.id}/poll`}
              fields={[]}
              onSaved={sources.refresh}
            />
          </section>
        ))}
        <ErrorNotice error={connections.error} retry={connections.refresh} />
        {connections.data && (freshservice.length ? (
          <ActionForm
            title="Connect an existing desk"
            path="/adoption/sources"
            fields={[
              {
                name: "connectionId",
                label: "Freshservice connection",
                type: "select",
                required: true,
                options: freshservice.map((c) => ({ value: text(c.id), label: text(c.name) })),
                value: freshservice.length === 1 ? text(freshservice[0].id) : undefined,
              },
              {
                name: "sourceWorkspace",
                label: "Freshservice workspace number",
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
        <h2>Work on hold</h2>
        <ErrorNotice error={holds.error} />
        {holds.data && !holds.data.length && (
          <Empty title="Nothing is held.">
            Imported work that was in progress waits here until you confirm
            what really happened and release it.
          </Empty>
        )}
        {holds.data?.map((h) => (
          <section key={text(h.id)}>
            <p>{text(h.reason ?? h.id)}</p>
            <Badge value={h.state} />
            <ActionForm
              title="Confirm what really happened"
              path={`/adoption/holds/${h.id}/reconcile`}
              fields={[
                { name: "historyId", label: "Imported item", hint: "The item’s ID from the import report.", required: true },
                {
                  name: "evidence",
                  label: "What you checked",
                  hint: "Describe what you found in the live system, not in the import.",
                  type: "json",
                  required: true,
                },
              ]}
              onSaved={holds.refresh}
            />
            <ActionForm
              title="Release this work"
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
