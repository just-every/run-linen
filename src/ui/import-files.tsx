import { useState, type FormEvent } from "react";
import { useSession } from "./state";
import { ErrorNotice, Notice } from "./primitives";
export function ImportFiles({
  id,
  onSaved,
}: {
  id: string;
  onSaved: () => void;
}) {
  const { session } = useSession(),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const form = new FormData(event.currentTarget),
        file = form.get("chunk") as File,
        ordinal = form.get("ordinal");
      const response = await fetch(`/api/v1/imports/${id}/chunks/${ordinal}`, {
        method: "PUT",
        headers: {
          "X-Linen-CSRF": session.csrfToken,
          "Content-Type": "application/octet-stream",
        },
        body: file,
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw Error(result.error?.message || "This chunk was not admitted.");
      setSaved(true);
      onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="inline-form" onSubmit={upload}>
      <h2>Add the original snapshot chunks</h2>
      <p>
        Each file is checked against the manifest’s length and hash before
        import.
      </p>
      <label>
        Chunk ordinal
        <input name="ordinal" type="number" min="0" step="1" required />
      </label>
      <label>
        Original chunk file
        <input name="chunk" type="file" required />
      </label>
      <ErrorNotice error={error} />
      {saved && (
        <Notice>
          The chunk was admitted. Run the meaning and reference check when every
          chunk is present.
        </Notice>
      )}
      <button className="action primary" disabled={busy}>
        {busy ? "Checking bytes…" : "Upload and verify chunk"}
      </button>
    </form>
  );
}
