import { useState, type FormEvent } from 'react';
import { request } from './api';
import { Fields, readFields, type Field } from './forms';
import { ErrorNotice } from './primitives';
import { useSession } from './state';

/** A failed provider request can still have a durable effect. Refresh its ledger even on error. */
export function SoftwareLicenseEffect({ title, path, fields = [], defaults, submit, explanation, onSettled }: {
  title: string; path: string; fields?: Field[]; defaults: Record<string, unknown>; submit: string;
  explanation: string; onSettled: (error?: unknown) => void;
}) {
  const { session } = useSession(), [pending, setPending] = useState(false), [error, setError] = useState<unknown>(null);
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let body: Record<string, unknown>;
    try { body = { ...defaults, ...readFields(event.currentTarget, fields) }; }
    catch (error) { setError(error); return; }
    setPending(true); setError(null);
    try {
      await request(path, { method: 'POST', body, csrf: session.csrfToken });
      onSettled();
    } catch (error) { onSettled(error); }
    finally { setPending(false); }
  }
  return <details className="action-disclosure" data-action-path={path}><summary>{title}</summary>
    <form className="inline-form" onSubmit={send}>
      <p>{explanation}</p><div className="field-grid"><Fields fields={fields} /></div>
      <ErrorNotice error={error} />
      <button className="action primary" disabled={pending}>{pending ? 'Checking provider outcome…' : submit}</button>
    </form>
  </details>;
}
