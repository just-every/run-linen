import type { ReactNode } from "react";
import { ApiFailure, errorText, humanize, text } from "./api";
import { Icon } from "./icons";
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon name={tone === "error" ? "alert" : "shield"} />
      <div>{children}</div>
    </div>
  );
}
export function ErrorNotice({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  return (
    <Notice tone="error">
      <strong>
        {error instanceof ApiFailure && error.status === 403
          ? "This needs different authority"
          : error instanceof ApiFailure && error.status === 401
            ? "Your session has ended"
            : "This needs another look"}
      </strong>
      <p>{errorText(error)}</p>
      {retry && (
        <button className="text-button" onClick={retry}>
          Try again
        </button>
      )}
      {error instanceof ApiFailure && error.status === 401 && (
        <a href="/">Sign in again</a>
      )}
    </Notice>
  );
}
export function Loading({ label = "Reading your work…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <span className="loading-dot" />
      {label}
    </div>
  );
}
// Badge tones (SPEC §2.1): verified work, work still moving, finished work, and failures.
const tones: Record<string, [string, string]> = {
  verified: ["ok", "check"], active: ["ok", "check"], validated: ["ok", "check"], completed: ["ok", "check"], restored: ["ok", "check"], approved: ["ok", "check"], succeeded: ["ok", "check"], delivered: ["ok", "check"], adopted: ["ok", "check"],
  closed: ["done", "check"], cancelled: ["done", "close"], revoked: ["done", "close"], superseded: ["done", "close"], disconnected: ["done", "close"], declined: ["done", "close"],
  failed: ["alert", "alert"], blocked: ["alert", "alert"], error: ["alert", "alert"], rejected: ["alert", "alert"], stale: ["alert", "alert"], uncertain: ["alert", "alert"], unknown: ["alert", "alert"],
};
export function Badge({ value }: { value: unknown }) {
  const key = String(value ?? "unknown").replace(/[^a-z_]/gi, "");
  const [tone, icon] = tones[key.toLowerCase()] ?? ["wait", "clock"];
  return (
    <span className={`badge tone-${tone} status-${key}`}>
      <Icon name={icon} size={16} />
      {humanize(value).toLowerCase()}
    </span>
  );
}
/** A heading whose last two words carry the madder running stitch. */
export function Stitched({ children }: { children: string }) {
  const words = children.trim().split(/\s+/);
  if (words.length < 2) return <span className="stitch">{children}</span>;
  return (
    <>
      {words.slice(0, -2).join(" ")}{words.length > 2 ? " " : ""}
      <span className="stitch">{words.slice(-2).join(" ")}</span>
    </>
  );
}
export function Hero({
  eyebrow,
  title,
  children,
  stitch = true,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  stitch?: boolean;
}) {
  return (
    <section className="hero">
      <div className="hero-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{stitch ? <Stitched>{title}</Stitched> : title}</h1>
        {children}
      </div>
    </section>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty cloth">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Facts({ entries }: { entries: [string, unknown][] }) {
  return (
    <dl className="facts">
      {entries.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{text(value)}</dd>
        </div>
      ))}
    </dl>
  );
}
export function Evidence({
  value,
  title = "Evidence and recorded details",
}: {
  value: unknown;
  title?: string;
}) {
  return (
    <details className="evidence">
      <summary>
        <Icon name="file" />
        {title}
      </summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
