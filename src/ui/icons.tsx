export function Icon({
  name = "file",
  className = "",
  size = 22,
}: {
  name?: string;
  className?: string;
  size?: number;
}) {
  const paths: Record<string, React.ReactNode> = {
    check: <path d="m5 12 5 5L20 6" />,
    arrow: <path d="M5 12h14m-6-7 6 7-6 7" />,
    back: <path d="M19 12H5m6-7-6 7 6 7" />,
    chevron: <path d="m6 9 6 6 6-6" />,
    book: <path d="M12 6.5C10 5 7 4.5 3 5v13c4-.5 7 0 9 1.5m0-13c2-1.5 5-2 9-1.5v13c-4-.5-7 0-9 1.5m0-13v13" />,
    laptop: <path d="M5 6h14v9H5ZM3 18h18" />,
    monitor: <path d="M3 5h18v11H3ZM9 20h6M12 16v4" />,
    wifi: <path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10 16.5a3 3 0 0 1 4 0M12 19.5h.01" />,
    refresh: <path d="M20 11a8 8 0 0 0-14.5-4.5M4 4v3h3M4 13a8 8 0 0 0 14.5 4.5M20 20v-3h-3" />,
    gear: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.06 10.57 21.42 10.77 21.42 13.23 19.06 13.43 18 15.98 19.53 17.79 17.79 19.53 15.98 18 13.43 19.06 13.23 21.42 10.77 21.42 10.57 19.06 8.02 18 6.21 19.53 4.47 17.79 6 15.98 4.94 13.43 2.58 13.23 2.58 10.77 4.94 10.57 6 8.02 4.47 6.21 6.21 4.47 8.02 6 10.57 4.94 10.77 2.58 13.23 2.58 13.43 4.94 15.98 6 17.79 4.47 19.53 6.21 18 8.02Z" />
      </>
    ),
    grid: <path d="M4 4h6v6H4ZM14 4h6v6h-6ZM4 14h6v6H4ZM14 14h6v6h-6Z" />,
    nodes: (
      <>
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="5" cy="19" r="2.5" />
        <circle cx="19" cy="19" r="2.5" />
        <path d="m10.8 7.2-4.6 9.6M13.2 7.2l4.6 9.6" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c0-4.5 13-4.5 13 0M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 14.5c2 .6 3.5 2 3.5 5.5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    mail: <path d="M3 6h18v12H3ZM3 7l9 6.5L21 7" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 6v6l5 3" />
      </>
    ),
    shield: (
      <>
        <path d="m12 2 8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M3 22v-3c0-6 18-6 18 0v3" />
      </>
    ),
    search: (
      <>
        <circle cx="10" cy="10" r="7" />
        <path d="m15 15 5 5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 4v16M4 12h16" />,
    attachment: <path d="m9 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7l9-9" />,
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="16" cy="17" r="3" />
      </>
    ),
    alert: (
      <>
        <path d="m12 3 10 18H2Z" />
        <path d="M12 9v5M12 17h.01" />
      </>
    ),
    file: (
      <>
        <path d="M6 2.5h8.5L19 7v14.5H6ZM14 2.5V7.5h5M9 12h7M9 15.5h7M9 19h4" />
      </>
    ),
  };
  return (
    <svg
      aria-hidden="true"
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
    >
      {paths[name] ?? paths.file}
    </svg>
  );
}
