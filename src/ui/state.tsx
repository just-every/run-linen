import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { request, type Session } from "./api";
const SessionContext = createContext<{
  session: Session;
  refreshSession: () => void;
} | null>(null);
export function SessionProvider({
  session,
  refreshSession,
  children,
}: {
  session: Session;
  refreshSession: () => void;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={{ session, refreshSession }}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("Session context required");
  return value;
}
export function useRemote<T>(path: string | null, pollMs = 0) {
  const responseEpoch = useRef(0);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [backgroundError, setBackgroundError] = useState<unknown>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setBackgroundError(null);
    setData(null);
    const epoch = ++responseEpoch.current;
    request<T>(path, { signal: controller.signal })
      .then((value) => { if (!controller.signal.aborted && epoch === responseEpoch.current) setData(value); })
      .catch((error) => {
        if (!controller.signal.aborted && epoch === responseEpoch.current) setError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [path, version]);
  useEffect(() => {
    if (!path || !pollMs) return;
    const controller = new AbortController();
    let running = false;
    const timer = window.setInterval(async () => {
      if (running || document.visibilityState !== "visible") return;
      running = true;
      const epoch = ++responseEpoch.current;
      try {
        const value = await request<T>(path, { signal: controller.signal });
        if (!controller.signal.aborted && epoch === responseEpoch.current) {
          setData(value);
          setError(null);
          setLoading(false);
          setBackgroundError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted && epoch === responseEpoch.current) setBackgroundError(error);
      } finally {
        running = false;
      }
    }, pollMs);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [path, pollMs, version]);
  return { data, error, backgroundError, loading, refresh };
}
export function useMutation() {
  const { session } = useSession();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function mutate<T>(
    path: string,
    body?: unknown,
    method = "POST",
  ): Promise<T | undefined> {
    setPending(true);
    setError(null);
    try {
      return await request<T>(path, { method, body, csrf: session.csrfToken });
    } catch (error) {
      setError(error);
      return undefined;
    } finally {
      setPending(false);
    }
  }
  return { mutate, pending, error, clearError: () => setError(null) };
}
