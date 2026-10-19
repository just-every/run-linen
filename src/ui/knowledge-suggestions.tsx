import { text, type RecordValue } from "./api";
import { useMutation } from "./state";
import { ErrorNotice } from "./primitives";

export interface OfferedArticles { id: string; items: RecordValue[] }

/** KB-003: reviewed answers offered before a new request is sent. Confirming one files nothing. */
export function KnowledgeSuggestions({ offer, onSolved, onSendAnyway, sending }: {
  offer: OfferedArticles;
  onSolved: (title: string) => void;
  onSendAnyway: () => void;
  sending: boolean;
}) {
  const mutation = useMutation();
  async function solved(article: RecordValue) {
    const result = await mutation.mutate(`/knowledge/suggestions/${offer.id}/confirm`, { articleId: article.id });
    if (result) onSolved(text(article.title));
  }
  return (
    <section className="knowledge-suggestions" aria-label="Reviewed answers before you send">
      <h2>Before you send: these reviewed answers may help</h2>
      {offer.items.map((article) => (
        <article className="connection-record" key={text(article.id)}>
          <h3>{text(article.title)}</h3>
          <p className="detail-prose">{text(article.body)}</p>
          <button type="button" className="action secondary small" disabled={mutation.pending || sending} onClick={() => solved(article)}>
            This solved it
          </button>
        </article>
      ))}
      <p>Only your confirmation counts as solved. Sending your request anyway is always fine.</p>
      <button type="button" className="action primary small" disabled={mutation.pending || sending} onClick={onSendAnyway}>
        Send my request anyway
      </button>
      <ErrorNotice error={mutation.error} />
    </section>
  );
}
