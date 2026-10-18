import { Check, Painting } from '../parts'

/** The Denver IT room on Wed Oct 28, the afternoon Wes Calloway's MacBook Air comes back (painted plate, the pill in HTML). */
export function Interlude() {
  return (
    <section className="interlude" aria-label="The Denver IT room">
      <Painting className="interlude-art" name="interlude" widths={[768, 1152, 1536]} sizes="100vw" width={1536} height={1024}
        phone={{ name: 'interlude-phone', widths: [640, 900], media: '(max-width: 760px)', width: 900, height: 900 }} />
      <p className="interlude-pill"><Check label="" />Every laptop accounted for</p>
    </section>
  )
}
