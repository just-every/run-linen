import { useState, type FormEvent } from "react";
import { request, errorText } from "./api";
import { useRemote } from "./state";
import { Icon } from "./icons";
import { ErrorNotice, Loading, Notice } from "./primitives";
export function SignIn({ onSignedIn }: { onSignedIn: () => void }) {
  const setup = useRemote<{
    required: boolean;
    bootstrapTokenRequired: boolean;
  }>("/setup");
  const [pending, setPending] = useState(false),
    [error, setError] = useState<unknown>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true);
    setError(null);
    try {
      await request(setup.data?.required ? "/setup" : "/login", {
        method: "POST",
        body: values,
      });
      onSignedIn();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="auth-page">
      <a className="brand" href="/">
        <Icon name="leaf" size={30} />
        <span>Linen</span>
      </a>
      <div className="auth-layout">
        <section className="auth-intro cloth">
          <span className="eyebrow">
            A little less work. A little more possibility.
          </span>
          <h1>
            Good work starts <span className="stitch">here.</span>
          </h1>
          <p>
            One place to ask, follow what matters, and get back to your day.
          </p>
        </section>
        <section className="auth-form">
          <h2>
            {setup.data?.required
              ? "Make room for your team."
              : "Welcome back."}
          </h2>
          {setup.data?.required && (
            <p>Create your private workspace. Connections and their permissions come next.</p>
          )}
          {setup.loading ? (
            <Loading label="Checking your workspace…" />
          ) : setup.error ? (
            <ErrorNotice error={setup.error} retry={setup.refresh} />
          ) : (
            <form onSubmit={submit}>
              {setup.data?.required && (
                <>
                  <label>
                    Your name
                    <input
                      name="name"
                      autoComplete="name"
                      required
                      maxLength={120}
                    />
                  </label>
                  <label>
                    Workspace name
                    <input
                      name="workspaceName"
                      autoComplete="organization"
                      required
                      maxLength={120}
                    />
                  </label>
                </>
              )}
              <label>
                Work email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={320}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    setup.data?.required ? "new-password" : "current-password"
                  }
                  minLength={setup.data?.required ? 12 : undefined}
                  required
                />
              </label>
              {setup.data?.required && (
                <small>Use at least 12 characters.</small>
              )}
              {setup.data?.bootstrapTokenRequired && setup.data.required && (
                <label>
                  Installation token
                  <input
                    name="bootstrapToken"
                    type="password"
                    autoComplete="off"
                    required
                  />
                </label>
              )}
              {error != null && <Notice tone="error">{errorText(error)}</Notice>}
              <button className="action primary" disabled={pending}>
                {pending
                  ? "Opening your workspace…"
                  : setup.data?.required
                    ? "Create workspace"
                    : "Sign in"}
                <Icon name="arrow" />
              </button>
            </form>
          )}
          <p className="auth-footnote">
            <Icon name="lock" size={16} />
            Your conversations stay within your workspace and permissions.
          </p>
        </section>
      </div>
    </div>
  );
}
