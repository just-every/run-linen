import { useState, type FormEvent } from "react";
import { date, type RecordValue } from "./api";
import { useMutation, useRemote } from "./state";
import { Badge, Empty, ErrorNotice, Facts, Notice } from "./primitives";
interface Snapshot {
  id: string;
  revision: number;
  connectionId: string;
  source: string;
  state: string;
  fresh: boolean;
  observedAt: string;
  items: {
    itemId: string;
    kind: string;
    name: string;
    ambiguities: string[];
    details: { sourceId: string };
  }[];
  gaps: string[];
}
export function DiscoveryReview({ revision, onChanged }: { revision: number; onChanged: () => void }) {
  const review = useRemote<{ snapshots: Snapshot[]; gaps: string[] }>(
    `/connection-discovery?view=${revision}`,
  );
  if (review.error)
    return <ErrorNotice error={review.error} retry={review.refresh} />;
  if (!review.data?.snapshots.length) return null;
  return (
    <section className="history">
      <h2>One review, grounded in your sources.</h2>
      <p>
        Discovered facts are prefilled below. Choose the facts to keep and
        correct only what the source could not establish.
      </p>
      {review.data.snapshots.map((snapshot) => (
        <SnapshotReview
          key={snapshot.id}
          snapshot={snapshot}
          refresh={() => { review.refresh(); onChanged(); }}
        />
      ))}
    </section>
  );
}
function SnapshotReview({
  snapshot,
  refresh,
}: {
  snapshot: Snapshot;
  refresh: () => void;
}) {
  const connection = useRemote<RecordValue[]>("/connections"),
    action = useMutation(),
    [saved, setSaved] = useState(false),
    current = connection.data?.find((c) => c.id === snapshot.connectionId);
  async function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      items = form
        .getAll("itemId")
        .map((itemId) => ({ itemId: String(itemId) }));
    const result = await action.mutate(
      `/connection-discovery/${snapshot.id}/apply`,
      { revision: snapshot.revision, items },
    );
    if (result) {
      setSaved(true);
      refresh();
    }
  }
  return (
    <section className="connection-record">
      <div className="section-heading">
        <h3>{snapshot.source}</h3>
        <Badge value={snapshot.fresh ? snapshot.state : "stale"} />
      </div>
      <p className="fact-note">Observed {date(snapshot.observedAt)}</p>
      {snapshot.gaps.map((gap) => (
        <Notice key={gap} tone="warning">
          {gap}
        </Notice>
      ))}
      {snapshot.state !== "complete" && snapshot.fresh && (
        <button
          className="action"
          // Continuing needs the connection's current revision; wait for it rather than drop the click.
          disabled={action.pending || !current}
          onClick={async () => {
            if (
              current &&
              (await action.mutate(
                `/connections/${snapshot.connectionId}/discover`,
                {
                  revision: current.revision,
                  snapshotId: snapshot.id,
                  snapshotRevision: snapshot.revision,
                },
              ))
            )
              refresh();
          }}
        >
          Continue remaining discovery
        </button>
      )}
      <form onSubmit={apply}>
        {snapshot.items.map((item) => (
          <label className="review-item" key={item.itemId}>
            <input
              type="checkbox"
              name="itemId"
              value={item.itemId}
              disabled={
                !snapshot.fresh ||
                snapshot.state !== "complete" ||
                Boolean(item.ambiguities.length) ||
                item.kind === "devices"
              }
            />
            <span>
              <strong>{item.name}</strong>
              <small>
                {item.kind} · Source {item.details.sourceId}
              </small>
              {item.ambiguities.map((x) => (
                <small key={x}>{x}</small>
              ))}
            </span>
          </label>
        ))}
        <ErrorNotice error={action.error} />
        {saved && (
          <Notice>
            Reviewed source facts were recorded. No remote writes or grants were
            created.
          </Notice>
        )}
        {snapshot.state === "complete" && snapshot.fresh && (
          <button className="action primary" disabled={action.pending}>
            Keep selected facts
          </button>
        )}
      </form>
    </section>
  );
}
