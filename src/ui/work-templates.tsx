import { useRemote } from "./state";

export interface TicketDraft { kind: string; title: string; body: string; context: Record<string, string> }
interface RecordTemplate { id: string; name: string; draft: TicketDraft }

/** DESK-015: start a new ticket from a record template; the draft fills the form and stays editable before sending. */
export function TemplatePicker({ onPick }: { onPick: (draft: TicketDraft | null) => void }) {
  const templates = useRemote<{ items: RecordTemplate[] }>("/work-templates"), items = templates.data?.items ?? [];
  if (!items.length) return null;
  return (
    <label className="composer-template">
      Start from a template
      <select defaultValue="" onChange={(e) => onPick(items.find((t) => t.id === e.target.value)?.draft ?? null)}>
        <option value="">No template</option>
        {items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}
