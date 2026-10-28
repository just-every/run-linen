import { useEffect, useRef } from "react";

/** DESK-018: keyboard triage. Outside a text field, j and k open the next and previous ticket of the current view;
 * a, r, n, s, c and x act on the open ticket; ? opens this reference; Escape leaves a field; Ctrl or ⌘ + Enter sends the
 * field's form. The open ticket's controls listen for `triageEvent` and act through their own doors. */
export const triageEvent = "linen:triage";
export type TriageAction = "assign-self" | "reply" | "note" | "status" | "close" | "scenario";
const actions: Record<string, TriageAction> = { a: "assign-self", r: "reply", n: "note", s: "status", c: "close", x: "scenario" };
const shortcuts: [string, string][] = [
  ["j", "Open the next ticket in this view"],
  ["k", "Open the previous ticket in this view"],
  ["a", "Assign the open ticket to yourself"],
  ["r", "Write a shared reply"],
  ["n", "Write a private note"],
  ["s", "Set status: pause, or resume a paused ticket"],
  ["c", "Close the open ticket"],
  ["x", "Run a scenario on the open ticket"],
  ["Ctrl/⌘ + Enter", "Send the reply, note or status change"],
  ["Escape", "Leave the field you are typing in"],
  ["?", "Show or hide these shortcuts"],
];

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

export function TriageShortcuts({ ids, selectedId }: { ids: string[]; selectedId?: string }) {
  const reference = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && typing(e.target)) {
        const form = (e.target as HTMLElement).closest("form");
        if (form) { e.preventDefault(); form.requestSubmit(); }
        return;
      }
      if (e.key === "Escape" && typing(e.target)) { (e.target as HTMLElement).blur(); return; }
      if (typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "?") {
        e.preventDefault();
        if (reference.current) reference.current.open = !reference.current.open;
        return;
      }
      if (e.key === "j" || e.key === "k") {
        if (!ids.length) return;
        e.preventDefault();
        const at = selectedId ? ids.indexOf(selectedId) : -1,
          next = e.key === "j" ? (at < 0 ? 0 : Math.min(at + 1, ids.length - 1)) : (at < 0 ? ids.length - 1 : Math.max(at - 1, 0));
        location.hash = `/work/${ids[next]}`;
        return;
      }
      const action = actions[e.key];
      if (action && selectedId) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(triageEvent, { detail: { action, workId: selectedId } }));
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ids, selectedId]);
  return (
    <details className="queue-shortcuts" ref={reference}>
      <summary>Keyboard shortcuts (?)</summary>
      <dl aria-label="Keyboard shortcuts">
        {shortcuts.map(([key, label]) => (
          <div key={key}>
            <dt><kbd>{key}</kbd></dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

/** Calls `handle` when a triage key asks this ticket's controls to act. */
export function useTriage(workId: string | undefined, handle: (action: TriageAction) => void) {
  const latest = useRef(handle);
  latest.current = handle;
  useEffect(() => {
    if (!workId) return;
    const listener = (e: Event) => {
      const detail = (e as CustomEvent<{ action: TriageAction; workId: string }>).detail;
      if (detail.workId === workId) latest.current(detail.action);
    };
    window.addEventListener(triageEvent, listener);
    return () => window.removeEventListener(triageEvent, listener);
  }, [workId]);
}
