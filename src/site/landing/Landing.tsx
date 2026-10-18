import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { Hero } from './Hero'
import { Change } from './sections/Change'
import { Closing } from './sections/Closing'
import { DayOne } from './sections/DayOne'
import { Device } from './sections/Device'
import { Interlude } from './sections/Interlude'
import { Join } from './sections/Join'
import { Leave } from './sections/Leave'
import { Move } from './sections/Move'
import { MovingIn } from './sections/MovingIn'
import { Report } from './sections/Report'
import { Requests } from './sections/Requests'
import '../styles/site.css'
import '../styles/cards.css'
import '../styles/landing.css'

/**
 * run-linen.com's homepage, built from the design desk's approved page s1 (17 Oct 2026): one 212-person company's
 * October in IT, in date order. Hero; join; device; day one; requests; the change band; the interlude; leave; move;
 * the October report; moving in; the closing with the footer. Painted art only in the hero, the interlude, the
 * closing and the small shipping box beside the stock card; every product card is HTML and CSS.
 */
export function Landing() {
  return (
    <div className="site">
      <SiteHeader />
      <main id="main">
        <Hero />
        <Join />
        <Device />
        <DayOne />
        <Requests />
        <Change />
        <Interlude />
        <Leave />
        <Move />
        <Report />
        <MovingIn />
        <Closing />
      </main>
      <SiteFooter />
    </div>
  )
}
