import { useCallback, useEffect, useRef, useState } from "react";
import { ApiFailure, date, errorText, request, text } from "./api";
import { useSession } from "./state";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";
import type { FulfilmentDecision } from "../features/work/fulfilment-decisions";

export type { FulfilmentDecision } from "../features/work/fulfilment-decisions";

type DecisionList = { items: FulfilmentDecision[] };
export type FulfilmentQueueStatus = "loading" | "error" | "empty" | "items";
type Banner = { tone: "info" | "warning" | "error"; message: string };

function decisionIdentity(item: FulfilmentDecision) {
  return `${item.workId}:${item.catalogId}`;
}

function reviewKey(item: FulfilmentDecision) {
  return JSON.stringify([
    item.workId, item.catalogId, item.expectedWorkRevision, item.expectedFulfilmentRevision,
    item.expectedCatalogRevision, item.expectedPersonId, item.expectedPersonRevision,
    item.expectedBindingId, item.holderId,
  ]);
}

function idempotencyKey(item: FulfilmentDecision) {
  return `fulfilment-approval:${reviewKey(item)}`;
}

export function FulfilmentDecisions({
  onQueueStatus,
}: {
  onQueueStatus: (status: FulfilmentQueueStatus) => void;
}) {
  const { session } = useSession();
  const [queue, setQueue] = useState<DecisionList | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [reviewRequired, setReviewRequired] = useState<Record<string, boolean>>(
    {},
  );
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<Banner | null>(null);
  const [submissionError, setSubmissionError] = useState<unknown>(null);
  const requestRef = useRef<AbortController | null>(null);
  const queueRef = useRef<DecisionList | null>(null);

  const refreshQueue = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!queueRef.current) setLoading(true);
    setRefreshing(true);
    setLoadError(null);
    try {
      const next = await request<DecisionList>("/fulfilment-decisions", {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return null;
      queueRef.current = next;
      setQueue(next);
      return next;
    } catch (error) {
      if (!controller.signal.aborted) setLoadError(error);
      return null;
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
    return () => requestRef.current?.abort();
  }, [refreshQueue]);

  const status: FulfilmentQueueStatus = loading
    ? "loading"
    : loadError
      ? "error"
      : queue?.items.length
        ? "items"
        : "empty";

  useEffect(() => onQueueStatus(status), [onQueueStatus, status]);

  async function approve(item: FulfilmentDecision) {
    const identity = decisionIdentity(item);
    const key = reviewKey(item);
    setPending((current) => ({ ...current, [key]: true }));
    setBanner(null);
    setSubmissionError(null);
    try {
      await request(`/work/${encodeURIComponent(item.workId)}/fulfilment/approve`, {
        method: "POST",
        csrf: session.csrfToken,
        body: {
          catalogId: item.catalogId,
          expectedWorkRevision: item.expectedWorkRevision,
          expectedFulfilmentRevision: item.expectedFulfilmentRevision,
          expectedCatalogRevision: item.expectedCatalogRevision,
          expectedPersonId: item.expectedPersonId,
          expectedPersonRevision: item.expectedPersonRevision,
          expectedBindingId: item.expectedBindingId,
          expectedHolderId: item.holderId,
          idempotencyKey: idempotencyKey(item),
        },
      });
      setBanner({
        tone: "info",
        message:
          "Business approval recorded. Linen will continue only under current provider permissions; this does not confirm a provider grant or completed work.",
      });
      await refreshQueue();
    } catch (error) {
      if (error instanceof ApiFailure && error.status === 409) {
        const current = await refreshQueue();
        setReviewRequired((values) => ({ ...values, [identity]: true }));
        setBanner({
          tone: "warning",
          message: current?.items.some((candidate) => decisionIdentity(candidate) === identity)
            ? "The request changed since you reviewed it. The latest details are shown below. Review them before approving."
            : "The request changed or is no longer waiting for this approval. The current list was refreshed; no provider outcome is confirmed.",
        });
      } else if (error instanceof ApiFailure && error.status === 403) {
        await refreshQueue();
        setBanner({
          tone: "warning",
          message:
            "Linen no longer accepts this approval under your current authority. The approval list was refreshed.",
        });
      } else if (
        error instanceof ApiFailure &&
        (error.status === 0 || error.status >= 500)
      ) {
        const current = await refreshQueue();
        if (current?.items.some((candidate) => decisionIdentity(candidate) === identity))
          setReviewRequired((values) => ({ ...values, [identity]: true }));
        setBanner({
          tone: "warning",
          message: current
            ? current.items.some((candidate) => decisionIdentity(candidate) === identity)
              ? "The approval outcome was uncertain. The latest list still shows this request. Nothing was resubmitted; review the current details before deciding again."
              : "The request no longer appears in the current approval list. The provider effect and completed work remain unconfirmed."
            : "The approval outcome was uncertain and the current list could not be checked. No retry was sent; refresh the list before deciding again.",
        });
      } else {
        setSubmissionError(error);
        await refreshQueue();
        setBanner({
          tone: "error",
          message: `Approval was not confirmed. ${errorText(error)}`,
        });
      }
    } finally {
      setPending((current) => ({ ...current, [key]: false }));
    }
  }

  if (loading && !queue) return <Loading label="Checking catalogue approvals…" />;
  if (loadError && !queue)
    return <ErrorNotice error={loadError} retry={() => void refreshQueue()} />;
  if (!queue?.items.length) {
    return (
      <>
        {Boolean(loadError) && <ErrorNotice error={loadError} retry={() => void refreshQueue()} />}
        {banner && (
          <Notice tone={banner.tone}>
            <p>{banner.message}</p>
          </Notice>
        )}
      </>
    );
  }

  return (
    <section aria-labelledby="catalogue-approval-heading">
      <div className="section-heading">
        <h2 id="catalogue-approval-heading">Catalogue approvals</h2>
      </div>
      <p className="detail-prose section-intro">
        These requests need a business decision. Work already covered by standing
        policy continues without asking you again.
      </p>
      {refreshing && <Loading label="Refreshing current approvals…" />}
      {Boolean(loadError) && <ErrorNotice error={loadError} retry={() => void refreshQueue()} />}
      {banner && (
        <Notice tone={banner.tone}>
          <p>{banner.message}</p>
        </Notice>
      )}
      {Boolean(submissionError) && (
        <ErrorNotice error={submissionError} retry={() => void refreshQueue()} />
      )}
      <div>
        {queue.items.map((item) => {
          const identity = decisionIdentity(item);
          const key = reviewKey(item);
          const needsReview = Boolean(reviewRequired[identity]);
          const hasReviewed = reviewed[identity] === key;
          const disabled =
            Boolean(pending[key]) || refreshing || Boolean(loadError) || (needsReview && !hasReviewed);
          return (
            <article className="decision" key={key}>
              <div className="section-heading">
                <h3>{text(item.title)}</h3>
                <Badge value={item.state} />
              </div>
              <div className="resource-details">
                <Facts
                  entries={[
                    ["For", item.beneficiaryName],
                    ["Service", item.catalogName],
                    ["Purpose", item.purpose],
                    ["Access ends", item.expiresAt ? date(item.expiresAt) : "No expiry recorded"],
                  ]}
                />
              </div>
              {item.reason && (
                <Notice tone="warning">
                  <strong>Why this needs your decision</strong>
                  <p>{text(item.reason)}</p>
                </Notice>
              )}
              <Notice>
                <strong>What approval allows</strong>
                <p>
                  Linen can continue this catalogue request if a separate current
                  provider permission allows it. Approval does not grant that
                  permission or confirm that access is in place.
                </p>
              </Notice>
              {needsReview && (
                <label>
                  <input
                    type="checkbox"
                    checked={hasReviewed}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setReviewed((values) => ({
                        ...values,
                        [identity]: checked ? key : "",
                      }));
                    }}
                  />{" "}
                  I have reviewed the updated request details above.
                </label>
              )}
              <button
                className="action primary"
                type="button"
                disabled={disabled}
                onClick={() => void approve(item)}
              >
                {pending[key]
                  ? "Recording approval…"
                  : "Approve this request"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
