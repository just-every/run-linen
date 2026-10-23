import { date } from './api';
import { Badge, ErrorNotice, Loading } from './primitives';
import { useRemote } from './state';

interface SoftwareNotice {
  workId: string; title: string; publisher: string; reason: 'prohibited' | 'unlicensed'; availableAt: string; state: string;
}

/** The endpoint filters these authenticated notices to the affected person and their current work access. */
export function SoftwareLicenseNotices() {
  const notices = useRemote<{ items: SoftwareNotice[] }>('/software-license-notices');
  return <section className="connection-record" aria-label="Your software notices">
    <h2>Your software notices</h2>
    <p>If an installed application needs attention, its follow-up appears here with the reason and the IT team’s next step.</p>
    {notices.loading ? <Loading label="Reading your software notices…" /> : notices.error ? <ErrorNotice error={notices.error} retry={notices.refresh} />
      : notices.data?.items.length ? notices.data.items.map(notice => <article key={notice.workId}>
        <div className="section-heading"><h3>{notice.title}</h3><Badge value={notice.state} /></div>
        <p>{notice.publisher} · {notice.reason === 'prohibited' ? 'This title is prohibited by your organization’s software policy.' : 'This installation needs a license review.'}</p>
        <p><a href={`#/work/${notice.workId}`}>Open your software follow-up</a> · {date(notice.availableAt)}</p>
      </article>) : <p className="muted">No software notices are recorded for you.</p>}
  </section>;
}
