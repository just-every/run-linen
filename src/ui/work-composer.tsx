import { useEffect, useRef, useState, type FormEvent } from "react";
import { ApiFailure, text, type RecordValue } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import { Icon } from "./icons";
import { ErrorNotice, Notice } from "./primitives";
import { draftKey, readDraft, writeDraft } from "./drafts";
import type { PendingPerson } from "./pending-people";
import { ResponseTools } from './response-tools';
import { KnowledgeSuggestions, type OfferedArticles } from "./knowledge-suggestions";
import { useTriage } from "./work-triage";
import { TemplatePicker, type TicketDraft } from "./work-templates";
export function Composer({
  workId,
  onSent,
}: {
  workId?: string;
  onSent: () => void;
}) {
  const [body, setBody] = useState(""),
    [visibility, setVisibility] = useState("public"),
    [file, setFile] = useState<File | null>(null),
    [attachmentName, setAttachmentName] = useState(""),
    [uploadError, setUploadError] = useState<unknown>(null),
    [uploading, setUploading] = useState(false),
    // KB-003: articles offered for exactly this text, or null when none were asked for yet.
    [offer, setOffer] = useState<{ body: string; value: OfferedArticles | null } | null>(null),
    [solvedTitle, setSolvedTitle] = useState(""),
    // DESK-015: the record template a new ticket started from; its title, type and details go with the request.
    [template, setTemplate] = useState<TicketDraft | null>(null);
  const key = useRef<string>(crypto.randomUUID()),
    fileInput = useRef<HTMLInputElement>(null),
    field = useRef<HTMLTextAreaElement>(null),
    mutation = useMutation(),
    { session } = useSession();
  const privateAllowed = session.principal.roles.some((r) =>
    ["owner", "operator", "hr"].includes(r),
  );
  // The service team can start a request for another person's account; a service chosen for it is theirs.
  const members = useRemote<RecordValue[]>(privateAllowed && !workId ? "/members" : null),
    others = (members.data ?? []).filter((m) => m.active && m.id !== session.user.id).sort((a, b) => text(a.name).localeCompare(text(b.name))),
    pendingPeople = useRemote<{items: PendingPerson[]}>(privateAllowed && !workId ? "/pending-people" : null),
    [forId, setForId] = useState(() => {
      const pending = new URLSearchParams(typeof location === "undefined" ? "" : location.hash.split("?")[1]).get("pending");
      return pending ? `pending:${pending}` : "";
    }),
    [catalogIds, setCatalogIds] = useState<string[]>([]),
    pendingId = forId.startsWith("pending:") ? forId.slice(8) : null,
    catalog = useRemote<{items: RecordValue[]}>(pendingId ? "/catalog" : null);
  const [savedDraftKey, setSavedDraftKey] = useState<string | null>(null);
  const [draftError, setDraftError] = useState(false);
  useEffect(() => {
    let active = true;
    setSavedDraftKey(null);
    setDraftError(false);
    setBody("");
    setVisibility("public");
    setFile(null);
    setAttachmentName("");
    draftKey(session, workId).then(storageKey => {
      if (!active) return;
      try {
        const draft = readDraft(sessionStorage, storageKey, privateAllowed);
        setBody(draft.body);
        setVisibility(draft.visibility);
        setAttachmentName(draft.attachmentName ?? "");
        key.current = draft.messageId ?? crypto.randomUUID();
      } catch { setDraftError(true); }
      setSavedDraftKey(storageKey);
    }).catch(() => { if (active) setDraftError(true); });
    return () => { active = false; };
  }, [session.csrfToken, session.principal.userId, session.principal.workspaceId, privateAllowed, workId]);
  function updateDraft(nextBody: string, nextVisibility: string, nextAttachmentName = attachmentName) {
    if (nextBody !== offer?.body) setOffer(null);
    setSolvedTitle("");
    setBody(nextBody);
    setVisibility(nextVisibility);
    setAttachmentName(nextAttachmentName);
    if (savedDraftKey) {
      try { writeDraft(sessionStorage, savedDraftKey, { body: nextBody, visibility: nextVisibility, messageId: key.current, attachmentName: nextAttachmentName }); }
      catch { setDraftError(true); }
    }
  }
  // DESK-001: r writes a shared reply and n a private note on the open ticket.
  useTriage(workId, (action) => {
    if (action !== "reply" && action !== "note") return;
    updateDraft(body, action === "note" && privateAllowed ? "private" : "public");
    field.current?.focus();
  });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (attachmentName && !file) return;
    setUploadError(null);
    // A new request for yourself is first checked against reviewed knowledge.
    if (!workId && !forId && offer?.body !== body) {
      const found = await mutation.mutate<{ id: string | null; items: RecordValue[] }>("/knowledge/suggestions", { question: body });
      if (!found) return;
      const value = found.id && found.items.length ? { id: found.id, items: found.items } : null;
      setOffer({ body, value });
      if (value) return;
    }
    // Pressing Send again on the same text after an offer is sending anyway.
    await send(!workId && !forId && offer?.body === body ? offer.value?.id ?? null : null);
  }
  async function send(suggestionId: string | null) {
    const result = await mutation.mutate<RecordValue>(
      workId ? `/work/${workId}/messages` : "/work",
      workId
        ? { body, visibility, sourceMessageId: key.current }
        : {
            title: template?.title ?? body.trim().split("\n")[0].slice(0, 150),
            body,
            deduplicationKey: key.current,
            ...(template ? { kind: template.kind, context: template.context } : {}),
            ...(pendingId ? { pendingPersonId: pendingId, catalogIds } : forId ? { beneficiaryId: forId } : {}),
            ...(suggestionId ? { suggestionId } : {}),
          },
    );
    if (!result) return;
    const target = workId ?? String(result.id);
    if (file) {
      setUploading(true);
      try {
        const response = await fetch(`/api/v1/work/${target}/attachments`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-Linen-CSRF": session.csrfToken,
            "X-Filename": file.name,
            "X-Visibility": visibility,
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });
        if (!response.ok) {
          const data = (await response.json()) as {
            error?: { message?: string };
          };
          throw new ApiFailure(
            response.status,
            "attachment_failed",
            `Your message was saved, but the attachment was not. ${data.error?.message ?? "Select it and send again."}`,
          );
        }
        setFile(null);
      } catch (error) {
        setUploadError(error);
        return;
      } finally {
        setUploading(false);
      }
    }
    updateDraft("", visibility, "");
    setTemplate(null);
    setOffer(null);
    setForId("");
    setCatalogIds([]);
    key.current = crypto.randomUUID();
    onSent();
    if (!workId) location.hash = `/work/${target}`;
  }
  return (
    <form
      className={`composer ${visibility === "private" ? "composer-private" : ""}`}
      onSubmit={submit}
    >
      {workId && session.principal.roles.some(r => ['owner','operator'].includes(r)) && <ResponseTools key={workId} workId={workId} onInsert={value => updateDraft(body ? `${body}\n\n${value}` : value, visibility)} />}
      {!workId && <TemplatePicker onPick={(draft) => { setTemplate(draft); if (draft) updateDraft(draft.body, visibility); }} />}
      <label className="composer-label" htmlFor="conversation-message">
        {visibility === "private" && <Icon name="lock" />}
        {visibility === "private"
          ? "A private note for the service team"
          : workId
            ? "Keep the conversation going"
            : "What would make work easier?"}
      </label>
      <textarea
        id="conversation-message"
        ref={field}
        value={body}
        onChange={(event) => updateDraft(event.target.value, visibility)}
        placeholder={
          workId
            ? "Add a detail, change a date, or tell us what is still not working…"
            : "Ask in your own words. You don’t need to find a category or an approver."
        }
        rows={3}
        disabled={!savedDraftKey && !draftError}
        required
        maxLength={50000}
      />
      <div className="composer-tools">
        <label className="file-picker">
          <Icon name="attachment" />
          <span>{file?.name || attachmentName || "Attach a file"}</span>
          <input
            ref={fileInput}
            type="file"
            disabled={!savedDraftKey && !draftError}
            aria-label="Attach a file"
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              updateDraft(body, visibility, selected?.name ?? "");
            }}
          />
        </label>
        {(file || attachmentName) && (
          <button
            type="button"
            className="text-button"
            onClick={() => {
              if (fileInput.current) fileInput.current.value = "";
              setFile(null);
              updateDraft(body, visibility, "");
            }}
          >
            Remove file
          </button>
        )}
        {!workId && privateAllowed && (
          <label className="visibility-picker">
            <Icon name="user" />
            <select aria-label="Request for" value={forId} onChange={(event) => {setForId(event.target.value); setCatalogIds([]);}}>
              <option value="">For me</option>
              {others.map((m) => (
                <option key={text(m.id)} value={text(m.id)}>
                  For {text(m.name)}
                </option>
              ))}
              {pendingPeople.data?.items.filter(p => p.state === "pending").map(p => (
                <option key={p.id} value={`pending:${p.id}`}>For {p.name} · waiting for account</option>
              ))}
            </select>
          </label>
        )}
        {workId && privateAllowed && (
          <label className="visibility-picker">
            <Icon name="lock" />
            <select
              aria-label="Message visibility"
              value={visibility}
              onChange={(event) => updateDraft(body, event.target.value)}
            >
              <option value="public">Shared reply</option>
              <option value="private">Private note</option>
            </select>
          </label>
        )}
        <button
          className="send"
          type="submit"
          disabled={mutation.pending || uploading || !body.trim() || Boolean(attachmentName && !file)}
          aria-label={mutation.pending ? "Sending message" : "Send message"}
        >
          <span>{mutation.pending || uploading ? "Sending…" : "Send"}</span>
          <Icon name="arrow" />
        </button>
      </div>
      {!workId && privateAllowed && <p><a href="#/lifecycle">Add a person without an account</a></p>}
      {pendingId && <>
        <Notice>These services will wait until this person signs in with their reviewed work email.</Notice>
        <fieldset className="checkbox-group">
          <legend>Services to prepare</legend>
          {catalog.data?.items.map(service => <label className="checkbox-field" key={text(service.id)}>
            <input type="checkbox" value={text(service.id)} checked={catalogIds.includes(text(service.id))}
              onChange={event => setCatalogIds(ids => event.target.checked ? [...ids, text(service.id)] : ids.filter(id => id !== service.id))} />
            <span>{text(service.name)}</span>
          </label>)}
          {catalog.data && !catalog.data.items.length && <p>No catalog services are available yet. Add them in Connections &amp; setup before sending this request.</p>}
        </fieldset>
        <ErrorNotice error={catalog.error} retry={catalog.refresh} />
      </>}
      <ErrorNotice error={pendingPeople.error} retry={pendingPeople.refresh} />
      {visibility === "private" && (
        <small>
          This note is hidden from employees without service-team access.
        </small>
      )}
      {offer?.value && offer.body === body && (
        <KnowledgeSuggestions
          offer={offer.value}
          sending={mutation.pending || uploading}
          onSendAnyway={() => send(offer.value!.id)}
          onSolved={(title) => {
            updateDraft("", visibility, "");
            setOffer(null);
            if (fileInput.current) fileInput.current.value = "";
            setFile(null);
            key.current = crypto.randomUUID();
            setSolvedTitle(title);
          }}
        />
      )}
      {solvedTitle && <Notice>Glad “{solvedTitle}” solved it. Nothing was sent; ask again any time.</Notice>}
      <ErrorNotice error={mutation.error} />
      <ErrorNotice error={uploadError} />
      {attachmentName && !file && <Notice>Reselect the attachment before sending, or remove it.</Notice>}
      {draftError && <Notice>Draft storage is unavailable. Keep this page open until you send your message.</Notice>}
    </form>
  );
}
