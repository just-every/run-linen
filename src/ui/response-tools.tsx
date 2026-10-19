import { useState } from 'react';
import { request, type RecordValue } from './api';
import { useMutation, useRemote, useSession } from './state';
import { ErrorNotice, Notice } from './primitives';

interface Template { id: string; title: string; body: string; revision: number }
interface Assistance { kind: string; text: string; citations: { id: string; title: string; href: string }[] }
export function ResponseTools({ workId, onInsert }: { workId: string; onInsert: (text: string) => void }) {
  const { session } = useSession(), templates = useRemote<{ items: Template[] }>('/canned-responses'),
    knowledge = useRemote<{ items: RecordValue[] }>('/knowledge'), mutation = useMutation();
  const [selected, setSelected] = useState(''), [title, setTitle] = useState(''), [body, setBody] = useState(''),
    [articleId, setArticleId] = useState(''), [assistance, setAssistance] = useState<Assistance | null>(null),
    [pending, setPending] = useState(false), [error, setError] = useState<unknown>(null);
  const template = templates.data?.items.find(t => t.id === selected);
  async function useTemplate() {
    if (!template) return;
    const result = await mutation.mutate<{ text: string }>(`/work/${workId}/canned-response`, { templateId: template.id, revision: template.revision });
    if (result) onInsert(result.text);
  }
  async function generate(kind: 'reply' | 'summary') {
    setPending(true); setError(null); setAssistance(null);
    try { setAssistance(await request<Assistance>(`/work/${workId}/response-assistance`, {
      method: 'POST', csrf: session.csrfToken, body: { kind, articleIds: articleId ? [articleId] : [] },
    })); } catch (e) { setError(e); } finally { setPending(false); }
  }
  async function save() {
    const result = await mutation.mutate('/canned-responses', { title, body, ...(template ? { id: template.id, revision: template.revision } : {}) });
    if (result) { templates.refresh(); setSelected(''); setTitle(''); setBody(''); }
  }
  async function remove() {
    if (!template) return;
    if (await mutation.mutate(`/canned-responses/${template.id}/delete`, { revision: template.revision })) {
      templates.refresh(); setSelected(''); setTitle(''); setBody('');
    }
  }
  return <details className="work-controls" aria-label="Responses and summaries">
    <summary>Responses and summaries</summary>
    <label>Canned response<select aria-label="Canned response" value={selected} onChange={e => {
      const next = templates.data?.items.find(t => t.id === e.target.value);
      setSelected(e.target.value); setTitle(next?.title ?? ''); setBody(next?.body ?? '');
    }}><option value="">New response…</option>{templates.data?.items.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    <button type="button" className="action secondary" disabled={!template || mutation.pending} onClick={useTemplate}>Insert canned response</button>
    <details><summary>Manage canned responses</summary>
      <label>Response title<input value={title} maxLength={200} onChange={e => setTitle(e.target.value)} /></label>
      <label>Response text<textarea value={body} maxLength={10000} onChange={e => setBody(e.target.value)} /></label>
      <small>Plain text. Placeholders: {'{{requester.name}}'}, {'{{ticket.title}}'}, {'{{ticket.id}}'}. Shared with service owners and operators.</small>
      <div className="button-row"><button type="button" className="action secondary" disabled={mutation.pending || !title.trim() || !body.trim()} onClick={save}>Save canned response</button>
      {template && <button type="button" className="action secondary" disabled={mutation.pending} onClick={remove}>Delete canned response</button>}</div>
    </details>
    <label>Knowledge to cite<select aria-label="Knowledge to cite" value={articleId} onChange={e => { setArticleId(e.target.value); setAssistance(null); }}>
      <option value="">Ticket history only</option>{knowledge.data?.items.filter(a => a.scope === 'employees').map(a => <option key={String(a.id)} value={String(a.id)}>{String(a.title)}</option>)}
    </select></label>
    <div className="button-row"><button type="button" className="action secondary" disabled={pending} onClick={() => generate('reply')}>Draft shared reply</button>
      <button type="button" className="action secondary" disabled={pending} onClick={() => generate('summary')}>Summarize ticket</button></div>
    {pending && <Notice>Generating from current permitted sources…</Notice>}
    {assistance && <section aria-label={assistance.kind === 'summary' ? 'Ticket summary' : 'Unsent assistant reply'}>
      <Notice>{assistance.kind === 'summary' ? 'Private working summary for you. It has not been posted to the conversation.' : 'Unsent draft. Review the text and sources before sending.'}</Notice>
      <p className="detail-prose">{assistance.text}</p>
      <ul>{assistance.citations.map(c => <li key={c.id}><a href={c.href}>{c.title}</a></li>)}</ul>
      {assistance.kind === 'reply' && <button type="button" className="action secondary" onClick={() => { onInsert(assistance.text); setAssistance(null); }}>Use reply draft</button>}
      <button type="button" className="text-button" onClick={() => setAssistance(null)}>Dismiss generated text</button>
    </section>}
    <ErrorNotice error={error} /><ErrorNotice error={mutation.error} /><ErrorNotice error={templates.error} retry={templates.refresh} />
    <ErrorNotice error={knowledge.error} retry={knowledge.refresh} />
  </details>;
}
