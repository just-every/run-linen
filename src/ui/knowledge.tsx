import { useState } from "react";
import { date, text, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { ActionForm } from "./forms";
import { audienceLabel } from "./labels";
import { Empty, ErrorNotice, Facts, Hero, Loading } from "./primitives";
export function KnowledgeSpace({ query: initial = "" }: { query?: string }) {
  const [query, setQuery] = useState(initial),
    [search, setSearch] = useState(initial),
    list = useRemote<{ items: RecordValue[] }>(
      `/knowledge?q=${encodeURIComponent(search)}`,
    ),
    { session } = useSession();
  return (
    <>
      <Hero title="Knowledge">
        <p className="lead">
          An answer with a source. Only reviewed, current articles within your permissions appear here.
          If the answer does not fit, keep its context in a request.
        </p>
      </Hero>
      <form
        className="knowledge-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(query);
        }}
      >
        <label>
          Search reviewed knowledge
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="action secondary">Search</button>
      </form>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} retry={list.refresh} />
      ) : list.data?.items.length ? (
        list.data.items.map((article) => (
          <article className="connection-record" key={text(article.id)}>
            <h2>{text(article.title)}</h2>
            <p className="detail-prose">{text(article.body)}</p>
            <Facts
              entries={[
                ["Reviewed", date(article.reviewed_at)],
                ["Review expires", date(article.expires_at)],
                ["Audience", audienceLabel(article.scope)],
              ]}
            />
            <ActionForm
              title="This does not solve it"
              path={`/knowledge/${text(article.id)}/escalate`}
              defaults={{ deduplicationKey: crypto.randomUUID() }}
              fields={[
                {
                  name: "question",
                  label: "What do you still need?",
                  type: "textarea",
                  required: true,
                },
              ]}
              explanation="The article and its revision follow your request. You do not need to explain the context again."
              onSaved={(r) => {
                location.hash = `/work/${r.id}`;
              }}
            />
          </article>
        ))
      ) : (
        <Empty
          title={
            search ? "No current answer matched." : "No reviewed articles yet."
          }
        >
          Ask in your own words in Your work. Missing or expired guidance never
          becomes an invented answer.
        </Empty>
      )}
      {session.principal.roles.some((r) =>
        ["owner", "operator", "hr"].includes(r),
      ) && (
        <ActionForm
          title="Publish reviewed knowledge"
          path="/knowledge"
          fields={[
            { name: "title", label: "Article title", required: true },
            {
              name: "body",
              label: "Guidance, source and limitations",
              type: "textarea",
              required: true,
            },
            {
              name: "scope",
              label: "Audience",
              type: "select",
              required: true,
              options: [
                { value: "employees", label: "Employees" },
                { value: "operators", label: "Service operators" },
                { value: "hr", label: "HR only" },
              ],
            },
            {
              name: "expiresAt",
              label: "Review expiry",
              type: "datetime-local",
              required: true,
            },
            {
              name: "review",
              label: "I have reviewed this guidance",
              type: "checkbox",
            },
          ]}
          onSaved={list.refresh}
        />
      )}
    </>
  );
}
