import { Actions } from '../../shell/Actions'
import { Painting } from '../parts'

/** "Ready for Monday." over the dusk street, one lit window and laptop in every home (painted plate, copy in HTML). */
export function Closing() {
  return (
    <section className="closing" aria-labelledby="closing-title">
      <Painting className="closing-art" name="closing" widths={[768, 1152, 1536]} sizes="100vw" width={1536} height={922}
        phone={{ name: 'closing-phone', widths: [640, 960], media: '(max-width: 760px)', width: 960, height: 794 }} />
      <div className="closing-copy">
        <h2 id="closing-title">Ready for Monday.</h2>
        <p className="closing-sub">Open source IT service desk for growing US companies.</p>
        <Actions demoLink={false} />
        <p className="closing-free">100% free · MIT licensed</p>
      </div>
    </section>
  )
}
