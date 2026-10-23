import { useEffect, useState } from "react";
import { request, type Session } from "./api";
import { SessionProvider, useRemote, useSession } from "./state";
import { SignIn } from "./auth";
import { Mark } from "./Mark";
import { ErrorNotice, Loading, Notice } from "./primitives";
import { WorkSpace } from "./work";
import { DecisionSpace } from "./decisions";
import { ContextSpace } from "./context";
import { HydrationUnit } from "../base/hydration/unit";
import { clearDrafts } from "./drafts";
import { QueueProvider } from "./queue";
import { RailNav } from "./shell-rail";
import { TopBar } from "./shell-top";
export function LinenApp() {
  const auth = useRemote<{ authenticated: false } | { authenticated: true; session: Session }>("/session-status");
  const roleAccess = useRemote<{items: NonNullable<Session["principal"]["departmentRoles"]>}>(auth.data?.authenticated ? "/department-roles/current" : null);
  useEffect(() => {
    if (auth.data?.authenticated === false) {
      try { clearDrafts(sessionStorage); } catch { /* Storage may be unavailable. */ }
    }
  }, [auth.data]);
  if (auth.loading || (auth.data?.authenticated && !roleAccess.data && !roleAccess.error))
    return (
      <HydrationUnit><div className="boot">
        <Mark size={56} />
        <Loading label="Opening your workspace…" />
      </div></HydrationUnit>
    );
  if (auth.error || roleAccess.error)
    return (
      <HydrationUnit><div className="boot">
        <ErrorNotice error={auth.error || roleAccess.error} retry={() => { auth.refresh(); roleAccess.refresh(); }} />
      </div></HydrationUnit>
    );
  if (!auth.data?.authenticated) return <SignIn onSignedIn={auth.refresh} />;
  return (
    <SessionProvider session={{...auth.data.session, principal:{...auth.data.session.principal, departmentRoles:roleAccess.data!.items}}} refreshSession={auth.refresh}>
      <Workspace />
    </SessionProvider>
  );
}
function Workspace() {
  const { session, refreshSession } = useSession();
  const [route, setRoute] = useState("/work"),
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
  const [path, search = ""] = route.split("?"),
    [section, id] = path.replace(/^\//, "").split("/"),
    query = new URLSearchParams(search).get("q") ?? "";
  return (
    <QueueProvider>
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
      <TopBar onSignOut={signOut} query={query} />
      <div className="frame">
        <div id="main-content" role="region" aria-label="Workspace content" tabIndex={-1}>
          {offline && (
            <Notice tone="error">
              You’re offline. Unsent changes remain in this screen. Reconnect before
              sending. This screen does not send queued changes automatically.
            </Notice>
          )}
          <ErrorNotice error={error} />
          {section === "work" ? (
            <WorkSpace selectedId={id} />
          ) : section === "decisions" ? (
            <DecisionSpace selectedId={id} />
          ) : (
            <ContextSpace section={section} selectedId={id} query={query} parameters={search} />
          )}
        </div>
        {/* After the screen in reading and focus order; the grid draws it as the left rail. */}
        <RailNav section={section} />
      </div>
      <div className="foliage foliage-right" aria-hidden="true" />
    </QueueProvider>
  );
}
