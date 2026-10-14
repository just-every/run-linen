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
        ordinal = Number(form.get("ordinal")) - 1;
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
        throw Error(result.error?.message || "This file was not accepted.");
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
      <h2>Add the snapshot files</h2>
      <p>
        Add each file exactly as it was saved. Linen checks its size and fingerprint
        against the snapshot summary before importing it.
      </p>
      <label>
        File number (1 for the first)
        <input name="ordinal" type="number" min="1" step="1" required />
      </label>
      <label>
        Snapshot file
        <input name="chunk" type="file" required />
      </label>
      <ErrorNotice error={error} />
      {saved && (
        <Notice>
          The file was added. When every file is in, check what will come across.
        </Notice>
      )}
      <button className="action primary" disabled={busy}>
        {busy ? "Checking the file…" : "Upload and check file"}
      </button>
    </form>
  );
}
