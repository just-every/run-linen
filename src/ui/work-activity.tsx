import { useEffect } from 'react';
import { date, humanize } from './api';
import { useRemote } from './state';
import { ErrorNotice, Loading } from './primitives';
import { Icon } from './icons';
import type { Conversation } from './work';
import type { ActivityEntry } from '../features/work/activity';

const value = (v: unknown) => v === null || v === undefined ? 'none' : typeof v === 'string' ? v : JSON.stringify(v);

/** Messages and scoped field changes share one timeline; message anchors still support search citations. */
export function WorkActivity({ conversation }: { conversation: Conversation }) {
  const remote = useRemote<{ items: ActivityEntry[] }>(`/work/${conversation.work.id}/activity`, 10000);
  useEffect(() => { remote.refresh(); }, [conversation]);
  const entries = remote.data?.items;
  if (!entries) return remote.error ? <ErrorNotice error={remote.error} retry={remote.refresh} /> : <Loading />;
  return <>
    <ErrorNotice error={remote.error} retry={remote.refresh} />
    <ActivityTimeline entries={entries} label="Ticket activity" />
  </>;
}

export function ActivityTimeline({ entries, label }: { entries: ActivityEntry[]; label: string }) {
  return <ol className="events conversation" aria-label={label}>
      {entries.map(event => <li data-message-id={event.kind === 'message' ? event.id : undefined}
        className={`event ${event.visibility === 'private' ? 'private-message' : ''}`} key={event.id}>
        <span className="event-icon"><Icon name={event.visibility === 'private' ? 'lock' : 'user'} size={18} /></span>
        <div className="event-copy">
          <div className="message-meta"><time dateTime={event.at}>{date(event.at)}</time>
            {(event.kind !== 'message' || event.actorKind === 'automation') && <span>{humanize(event.actorKind)} · {event.actor} · {humanize(event.action)}</span>}
            {event.visibility === 'private' && <span className="private-label">{event.kind === 'message' ? 'Private service note' : 'Internal activity'}</span>}
          </div>
          {event.initiatedBy && <p>Initiated by {event.initiatedBy}</p>}
          {event.body && <p className="message-body">{event.body}</p>}
          {event.changes.length > 0 && <ul className="message-body">{event.changes.map((change, i) => <li key={i}>{humanize(change.field)}: {value(change.before)} → {value(change.after)}</li>)}</ul>}
        </div>
      </li>)}
    </ol>;
}
