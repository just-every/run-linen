import { date } from './api';
import { useRemote } from './state';
import { ErrorNotice } from './primitives';
interface Suggestion {id:string;title:string;body:string;revision:number;expires_at:string;reviewed_at:string;matchedTerms:string[]}
export function WorkaroundSuggestions({workId}:{workId:string}) {
  const found = useRemote<{items:Suggestion[]}>(`/work/${workId}/workarounds`,10000);
  if (found.error || found.backgroundError) return <ErrorNotice error={found.error || found.backgroundError} retry={found.refresh} />;
  if (!found.data?.items.length) return null;
  return <section aria-label="Suggested workarounds">
    <h3>A reviewed workaround may help</h3>
    {found.data.items.map(article=><article className="connection-record" key={article.id}>
      <h4>{article.title}</h4><p className="detail-prose">{article.body}</p>
      <p>Matches your report: {article.matchedTerms.join(', ')}. Review expires {date(article.expires_at)}.</p>
      <a href={`#/knowledge?q=${encodeURIComponent(article.title)}`}>Read in Knowledge</a>
      <p>If it does not fit, reply in this request. Your request stays open while the preventive change is tracked.</p>
    </article>)}
  </section>;
}
