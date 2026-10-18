import type { ReactNode } from 'react'

type Source = { name: string; widths: number[]; media?: string; sizes?: string }

/** A painted plate from public/site/ as AVIF with WebP beside it, at each width; `phone` swaps in a tighter crop. */
export function Painting({ name, widths, sizes, width, height, className, eager = false, phone, alt = '' }: Source & {
  width: number; height: number; className?: string; eager?: boolean; phone?: Source & { width: number; height: number }; alt?: string
}) {
  const set = (source: Source, type: string) => source.widths.map(w => `/site/${source.name}-${w}.${type} ${w}w`).join(', ')
  return (
    <picture className={className}>
      {phone ? <source type="image/avif" media={phone.media} srcSet={set(phone, 'avif')} sizes={phone.sizes ?? '100vw'} width={phone.width} height={phone.height} /> : null}
      {phone ? <source type="image/webp" media={phone.media} srcSet={set(phone, 'webp')} sizes={phone.sizes ?? '100vw'} width={phone.width} height={phone.height} /> : null}
      <source type="image/avif" srcSet={set({ name, widths }, 'avif')} sizes={sizes} />
      <img src={`/site/${name}-${widths[widths.length - 1]}.webp`} srcSet={set({ name, widths }, 'webp')} sizes={sizes} width={width} height={height} alt={alt}
        loading={eager ? 'eager' : 'lazy'} decoding={eager ? 'sync' : 'async'} {...(eager ? { fetchPriority: 'high' as const } : {})} />
    </picture>
  )
}

/** Eyebrow, heading and lede of a section; `id` labels the section. */
export function SectionHead({ id, eyebrow, title, lede, className = '' }: { id: string; eyebrow: string; title: ReactNode; lede: ReactNode; className?: string }) {
  return (
    <header className={`section-head ${className}`}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id}>{title}</h2>
      <p className="lede">{lede}</p>
    </header>
  )
}

/** A heading broken where the desk breaks it; each part stays whole on wide screens and wraps on narrow ones. */
export const Lines = ({ parts }: { parts: string[] }) => <>{parts.map((part, i) => <span className="line" key={i}>{part}{i < parts.length - 1 ? ' ' : ''}</span>)}</>

export type Tone = 'green' | 'red' | 'amber' | 'navy' | 'slate' | 'marigold'

export const Dot = ({ tone, label }: { tone: Tone; label?: string }) => <span className={`dot dot-${tone}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />

/** The green check disc the desk puts beside every proven item. */
export const Check = ({ label = 'done' }: { label?: string }) => (
  <svg className="check" viewBox="0 0 24 24" role="img" aria-label={label}><circle cx="12" cy="12" r="12" /><path d="M6.8 12.4l3.4 3.3 7-7.2" /></svg>
)

/** A plain check mark set after a read-back ("read back ✓"). */
export const Tick = () => <svg className="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 8.5l3.5 3.5 7.5-8" /></svg>

export const Plus = () => <svg className="sign sign-plus" viewBox="0 0 24 24" role="img" aria-label="added"><circle cx="12" cy="12" r="12" /><path d="M12 7v10M7 12h10" /></svg>
export const Minus = () => <svg className="sign sign-minus" viewBox="0 0 24 24" role="img" aria-label="removed"><circle cx="12" cy="12" r="12" /><path d="M7 12h10" /></svg>

/** An arrow drawn rather than typed, so it never falls back to another face. */
export const To = () => <svg className="to" viewBox="0 0 16 10" aria-label="to" role="img"><path d="M1 5h13M10 1.5L14 5l-4 3.5" /></svg>

/** Text from the records with each "→" drawn as an arrow. */
export const Words = ({ text }: { text: string }) => <>{text.split('→').map((part, i) => <span key={i}>{i ? <To /> : null}{part}</span>)}</>
