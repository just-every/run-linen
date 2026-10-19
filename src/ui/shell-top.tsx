import { useState } from "react";
import { text, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { Icon } from "./icons";
import { Mark } from "./Mark";
import { roleList } from "./labels";

/** "4 min ago" for the most recent change among the connections. */
function ago(value: unknown) {
  const ms = Date.now() - new Date(String(value)).getTime();
  if (!Number.isFinite(ms)) return "";
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/** The pick's sync dots: the workspace's real connections, each dot coloured by its recorded status. */
function ConnectionDots() {
  const connections = useRemote<RecordValue[]>("/connections", 60000);
  const items = connections.data ?? [];
  if (!items.length) return null;
  const latest = items.map((c) => text(c.updated_at, "")).sort().at(-1);
  const tone = (status: unknown) => (["validated", "verified", "active"].includes(text(status)) ? "ok" : ["failed", "error", "disconnected"].includes(text(status)) ? "alert" : "wait");
  return (
    <a className="sync" href="#/connections" aria-label={`Connections: ${items.map((c) => `${text(c.name)} ${text(c.status)}`).join(", ")}`}>
      {items.slice(0, 3).map((c) => (
        <span key={text(c.id)} className="sync-item">
          <span className={`dot tone-${tone(c.status)}`} />
          {text(c.name)}
        </span>
      ))}
      {items.length > 3 && <span className="sync-item">+{items.length - 3}</span>}
      <span className="sync-when">updated {ago(latest)}</span>
    </a>
  );
}

export function TopBar({ onSignOut, query }: { onSignOut: () => void; query: string }) {
  const { session } = useSession(),
    [profile, setProfile] = useState(false),
    searchAgent = session.principal.roles.some(r => ["owner", "operator", "hr"].includes(r)),
    operator = session.principal.roles.some((r) => ["owner", "operator", "hr", "auditor"].includes(r));
  return (
    <header className="topbar">
      <a className="brand" href="#/work">
        <Mark size={46} />
        <span data-rer-name>Linen</span>
      </a>
      <form
        className="top-search"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          const q = String(new FormData(event.currentTarget).get("q") ?? "").trim();
          location.hash = `/${searchAgent ? "search" : "knowledge"}${q ? `?q=${encodeURIComponent(q)}` : ""}`;
        }}
      >
        <Icon name="search" size={20} />
        <input key={query} name="q" type="search" defaultValue={query} aria-label={searchAgent ? "Search workspace" : "Search knowledge"} placeholder={searchAgent ? "Search your workspace…" : "Search reviewed knowledge…"} />
      </form>
      {operator && <ConnectionDots />}
      <div className="account">
        <button className="profile" aria-label="Your workspace and account" aria-expanded={profile} onClick={() => setProfile(!profile)}>
          <span className="avatar">{initials(session.user.name)}</span>
          <span className="who">
            <strong>{session.user.name}</strong>
            <small>{roleList(JSON.stringify(session.principal.roles))}</small>
          </span>
          <Icon name="chevron" size={18} />
        </button>
        {profile && (
          <div className="profile-menu">
            <strong>{session.user.name}</strong>
            <small>{session.workspace.name}</small>
            {session.principal.roles.some((r) => ["owner", "operator", "hr"].includes(r)) && (
              <>
                <a href="#/connections" onClick={() => setProfile(false)}>Connections & setup</a>
                <a href="#/members" onClick={() => setProfile(false)}>People & permissions</a>
                <a href="#/operations" onClick={() => setProfile(false)}>Operations & recovery</a>
              </>
            )}
            <button className="text-button" onClick={onSignOut}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
// The avatar shows the person's initials, as the top bar pick draws it.
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "·";
}
