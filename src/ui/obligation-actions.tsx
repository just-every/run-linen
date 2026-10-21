import { useState, type FormEvent } from 'react';
import { text, type RecordValue } from './api';
import { kindLabel } from './labels';
import { useMutation } from './state';
import { ErrorNotice } from './primitives';

/** CATALOG-003: the request's team tasks and waivers. The server decides who may act; these controls only appear when it says so. */
export const obligationTitle = (item: RecordValue) => item.kind === 'task.manual' ? text(item.title) : kindLabel(item.kind);
export function ObligationActions({ workId, item, onChanged }: { workId: string; item: RecordValue; onChanged: () => void }) {
  const { mutate, pending, error } = useMutation(), [reason, setReason] = useState(''), title = obligationTitle(item);
  if (item.can_complete !== true && item.can_waive !== true) return null;
  async function complete() {
    if (await mutate(`/work/${workId}/tasks/${text(item.id)}/complete`, { revision: item.revision })) onChanged();
  }
  async function waive(e: FormEvent) {
    e.preventDefault();
    if (await mutate(`/work/${workId}/obligations/${text(item.id)}/waive`, { revision: item.revision, reason })) { setReason(''); onChanged(); }
  }
  return <div className="obligation-actions">
    {item.can_complete === true && <>
      <button type="button" className="action primary" disabled={pending} onClick={() => void complete()}>Mark {title} done</button>
      <small>This records that your team did the task. It is not independent verification.</small></>}
    {item.can_waive === true && <form onSubmit={e => void waive(e)}>
      <label>Reason for waiving {title}<input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="action secondary" disabled={pending}>Waive {title}</button></form>}
    <ErrorNotice error={error} />
  </div>;
}
