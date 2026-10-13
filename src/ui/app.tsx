import { useEffect, useState } from "react";
import { request, type Session } from "./api";
import { SessionProvider, useRemote, useSession } from "./state";
import { SignIn } from "./auth";
import { Icon } from "./icons";
import { ErrorNotice, Loading, Notice } from "./primitives";
import { WorkSpace } from "./work";
import { Connections } from "./connections";
import { DecisionSpace } from "./decisions";
import { ContextSpace } from "./context";
import { HydrationUnit } from "../base/hydration/unit";
import { clearDrafts } from "./drafts";
export function LinenApp() {
  const auth = useRemote<{ authenticated: false } | { authenticated: true; session: Session }>("/session-status");
  useEffect(() => {
    if (auth.data?.authenticated === false) {
      try { clearDrafts(sessionStorage); } catch { /* Storage may be unavailable. */ }
    }
  }, [auth.data]);
  if (auth.loading)
    return (
      <HydrationUnit><div className="boot">
        <Icon name="leaf" size={40} />
        <Loading label="Making room for your work…" />
      </div></HydrationUnit>
    );
  if (auth.error)
    return (
      <HydrationUnit><div className="boot">
        <ErrorNotice error={auth.error} retry={auth.refresh} />
      </div></HydrationUnit>
    );
  if (!auth.data?.authenticated) return <SignIn onSignedIn={auth.refresh} />;
  return (
    <SessionProvider session={auth.data.session} refreshSession={auth.refresh}>
      <Workspace />
    </SessionProvider>
  );
}
function Workspace() {
  const { session, refreshSession } = useSession();
  const [route, setRoute] = useState("/work"),
    [profile, setProfile] = useState(false),
    [offline, setOffline] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const sync = () => setRoute(location.hash.slice(1) || "/work");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    document.getElementById("main-content")?.focus({ preventScroll: true });
  }, [route]);
  async function signOut() {
    try {
      await request("/logout", { method: "POST", csrf: session.csrfToken });
      try { clearDrafts(sessionStorage); } catch { /* Session-scoped keys remain inaccessible to a new session. */ }
      refreshSession();
    } catch (error) {
      setError(error);
    }
  }
  const [section, id] = route.replace(/^\//, "").split("/");
  return (
    <>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="app-header">
        <a className="brand" href="#/work">
          <Icon name="leaf" size={30} />
          <span>Linen</span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#/work" className={section === "work" ? "active" : ""} aria-current={section === "work" ? "page" : undefined}>
            Your work
          </a>
          <a
            href="#/decisions"
            className={section === "decisions" ? "active" : ""}
            aria-current={section === "decisions" ? "page" : undefined}
          >
            Needs your decision
          </a>
        </nav>
        <div className="header-actions">
          <a className="search-pill" href="#/knowledge" aria-label="Search knowledge">
            <Icon name="search" size={20} />
            <span>Search knowledge</span>
          </a>
          <button
            className="profile"
            aria-label="Your workspace and account"
            aria-expanded={profile}
            onClick={() => setProfile(!profile)}
          >
            {initials(session.user.name)}
          </button>
        </div>
        {profile && (
          <div className="profile-menu">
            <strong>{session.user.name}</strong>
            <small>{session.workspace.name}</small>
            {session.principal.roles.some((r) =>
              ["owner", "operator", "hr"].includes(r),
            ) && (
              <>
                <a href="#/connections" onClick={() => setProfile(false)}>
                  Connections & setup
                </a>
                <a href="#/members" onClick={() => setProfile(false)}>
                  People & permissions
                </a>
                <a href="#/operations" onClick={() => setProfile(false)}>
                  Operations & recovery
                </a>
              </>
            )}
            <button className="text-button" onClick={signOut}>
              Sign out
            </button>
          </div>
        )}
      </header>
      {offline && (
        <Notice tone="error">
          You’re offline. Unsent changes remain in this screen. Reconnect before
          sending. This screen does not send queued changes automatically.
        </Notice>
      )}
      <ErrorNotice error={error} />
      <div id="main-content" role="region" aria-label="Workspace content" tabIndex={-1}>
        {section === "work" ? (
          <WorkSpace key={route} selectedId={id} />
        ) : section === "connections" ? (
          <Connections />
        ) : section === "decisions" ? (
          <DecisionSpace selectedId={id} />
        ) : (
          <ContextSpace section={section} selectedId={id} />
        )}
      </div>
    </>
  );
}
// The profile button shows the person's initials, as the top bar pick draws it.
function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "·";
}
