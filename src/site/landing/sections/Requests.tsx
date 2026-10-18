import { Mark } from '../../../ui/Mark'
import { maya, priya } from '../october'
import { Check, Dot, Lines, SectionHead, Tick } from '../parts'

const LinenAvatar = () => <span className="avatar avatar-linen" aria-hidden="true"><Mark size={30} tone="light" /></span>

/** REQUESTS: Maya asks for Figma in a Slack DM and Linen does it under standing approval; Priya's lockout is fixed in #it-help. */
export function Requests() {
  return (
    <section className="section requests" aria-labelledby="requests-title">
      <div className="wrap requests-grid">
        <div className="requests-left">
          <SectionHead id="requests-title" eyebrow="Requests · Mon Oct 19 → Tue Oct 20" title={<Lines parts={['Asked in Slack.', 'Done in Slack.']} />}
            lede="Linen answers in the thread, does the work under your standing rules and checks that it worked." />
          <article className="card dm-card" aria-label="Slack direct message with Linen">
            <h3 className="dm-title"><strong>Linen</strong> · direct message</h3>
            <ol className="messages">
              <li><span className="avatar">{maya.initials}</span><div><p className="msg-meta"><strong>{maya.name}</strong> <time>9:11 AM</time></p><p>Can I get Figma for the launch deck?</p></div></li>
              <li><LinenAvatar /><div><p className="msg-meta"><strong>Linen</strong> <time>9:11 AM</time></p><p>Figma for Design is covered by {maya.manager}'s standing approval. All 40 seats are in use, so I'm reclaiming one unused for 64 days.</p></div></li>
              <li><LinenAvatar /><div><p className="msg-meta"><strong>Linen</strong> <time>9:14 AM</time></p>
                <div className="grant-box"><p className="grant-title">Figma · granted · seat 40 of 40</p><p className="grant-proof"><Check label="signed in" />You're signed in · 9:15 AM</p></div></div></li>
            </ol>
          </article>
        </div>
        <div className="requests-right">
          <article className="card req-card" aria-labelledby="req-title">
            <header className="req-head"><h3 className="card-title" id="req-title">REQ-5127 · Figma for {maya.name}</h3><span className="pill pill-green"><Dot tone="green" />Done</span></header>
            <dl className="facts">
              <div><dt>Channel</dt><dd>Slack DM</dd></div>
              <div><dt>Authority</dt><dd>Design standing approval</dd></div>
              <div><dt>Seat reclaimed</dt><dd>inactive since Aug 16 · read back <Tick /></dd></div>
              <div><dt>Seat assigned</dt><dd>read back <Tick /></dd></div>
              <div><dt>Verified</dt><dd>Maya signed in 9:15 AM <Tick /></dd></div>
              <div><dt>People involved</dt><dd className="strong">0</dd></div>
            </dl>
          </article>
          <article className="card help-card" aria-labelledby="help-title">
            <h3 className="card-title" id="help-title">#it-help · Tue Oct 20 · {priya.city}</h3>
            <ul className="dot-rows">
              <li><Dot tone="red" />{priya.name}: locked out of Okta</li>
              <li><Dot tone="amber" />Identity confirmed by her manager, {priya.manager}</li>
              <li><Dot tone="navy" />Reset {priya.resetAt} · no password in chat</li>
              <li><Dot tone="green" />Signed back in {priya.backAt} <Tick /></li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  )
}
