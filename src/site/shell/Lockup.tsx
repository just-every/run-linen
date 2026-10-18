import { Mark } from '../../ui/Mark'

/** The mark beside "Linen" in the heading face, linking home. */
export function Lockup({ size = 44, tone = 'dark' }: { size?: number; tone?: 'dark' | 'light' }) {
  return <a className="site-brand" href="/" aria-label="Linen home"><Mark size={size} tone={tone} /><span>Linen</span></a>
}
