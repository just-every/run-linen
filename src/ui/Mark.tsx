/**
 * Linen's mark (design desk, 17 Oct 2026): a navy laptop with a cream screen, two dot eyes and a small smile on a
 * rounded base. `tone="light"` lifts the outline to pale denim for dark grounds. Same shapes as public/brand/mark.svg.
 */
export function Mark({ size = 32, tone = 'dark', className = 'mark' }: { size?: number; tone?: 'dark' | 'light'; className?: string }) {
  const outline = tone === 'light' ? '#b3c6e0' : '#1d2e45'
  return (
    <svg className={className} width={size} height={Math.round(size * 492 / 752)} viewBox="0 0 752 492" aria-hidden="true" focusable="false">
      <rect x="61" width="631" height="460" rx="50" fill={outline} />
      <rect x="111" y="51" width="531" height="380" rx="16" fill="#f6eedd" />
      <rect y="411" width="752" height="81" rx="40.5" fill={outline} />
      <circle cx="260" cy="228" r="27" fill="#1d2e45" />
      <circle cx="492" cy="228" r="27" fill="#1d2e45" />
      <path d="M332 284Q376 320 420 284" fill="none" stroke="#1d2e45" strokeWidth="30" strokeLinecap="round" />
    </svg>
  )
}
