/** Native session API. Errors and missing configuration remain visible to the caller. */
export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}
export interface Session {
  principal: { userId: string; workspaceId: string; roles: string[] };
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string };
  csrfToken: string;
}
export type RecordValue = Record<string, unknown>;
export async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrf?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  if (options.csrf) headers["X-Linen-CSRF"] = options.csrf;
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method: options.method ?? "GET",
      credentials: "same-origin",
      headers,
      body:
        options.body === undefined
          ? undefined
          : options.body instanceof FormData
            ? options.body
            : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiFailure(
      0,
      "offline",
      "Linen could not reach the service. Your unsent changes are still here. Check your connection and try again.",
    );
  }
  const type = response.headers.get("content-type") ?? "";
  const data = (
    type.includes("application/json") ? await response.json() : null
  ) as
    | ({ error?: { code?: string; message?: string } } & Record<
        string,
        unknown
      >)
    | null;
  if (!response.ok)
    throw new ApiFailure(
      response.status,
      data?.error?.code ?? "request_failed",
      data?.error?.message ??
        `The service could not complete this request (${response.status}).`,
    );
  if (response.status === 204) return undefined as T;
  if (data === null)
    throw new ApiFailure(
      502,
      "unexpected_response",
      "The service returned an unexpected response. No outcome has been confirmed.",
    );
  return data as T;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The request could not be completed.";
}
export function text(value: unknown, missing = "Not recorded"): string {
  if (value === undefined || value === null || value === "") return missing;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return String(value);
  return JSON.stringify(value);
}
/** An internal key ("access.revoke", "assign") as a sentence-case label ("Access revoke", "Assign"). */
export function humanize(value: unknown) {
  const words = text(value).replace(/[._-]/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
/** A short local date and time ("13 Oct, 09:12"); the year only when it is not this year. */
export function date(value: unknown) {
  if (!value) return "Not scheduled";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(parsed.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}
