import { LocalTimeInput, localInstant } from "./local-time";
import { useState, type FormEvent } from "react";
import { useMutation } from "./state";
import { ErrorNotice, Notice } from "./primitives";
import type { RecordValue } from "./api";
export interface Field {
  name: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "date"
    | "number"
    | "textarea"
    | "datetime-local"
    | "select"
    | "list"
    | "json"
    | "checkbox"
    | "checkboxes";
  required?: boolean;
  hint?: string;
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
}
export function Fields({ fields }: { fields: Field[] }) {
  return (
    <>
      {fields.map((field) => field.type === "checkboxes" ? (
        <fieldset key={field.name} className="checkbox-group">
          <legend>
            {field.label}
            {field.required && <span aria-hidden="true"> *</span>}
          </legend>
          {field.options?.map((option) => (
            <label key={option.value} className="checkbox-field">
              <input
                name={field.name}
                type="checkbox"
                value={option.value}
              />
              <span>{option.label}</span>
            </label>
          ))}
          {field.hint && <small>{field.hint}</small>}
        </fieldset>
      ) : (
        <label
          key={field.name}
          className={field.type === "checkbox" ? "checkbox-field" : ""}
        >
          {field.type === "checkbox" ? (
            <>
              <input
                name={field.name}
                type="checkbox"
                defaultChecked={Boolean(field.value)}
                required={field.required}
              />
              <span>{field.label}</span>
            </>
          ) : (
            <>
              <span>
                {field.label}
                {field.required && <span aria-hidden="true"> *</span>}
              </span>
              {field.type === "select" ? (
                <select
                  name={field.name}
                  defaultValue={String(field.value ?? "")}
                  required={field.required}
                >
                  <option value="">Choose…</option>
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : ["textarea", "json", "list"].includes(field.type ?? "") ? (
                <textarea
                  name={field.name}
                  rows={field.type === "textarea" ? 3 : 2}
                  defaultValue={String(field.value ?? "")}
                  required={field.required}
                />
              ) : field.type === "datetime-local" ? (
                <LocalTimeInput name={field.name} value={field.value} required={field.required} />
              ) : (
                <input
                  name={field.name}
                  type={field.type ?? "text"}
                  step={field.type === "number" ? "any" : undefined}
                  defaultValue={String(field.value ?? "")}
                  required={field.required}
                  autoComplete={field.type === "password" ? "off" : undefined}
                />
              )}
            </>
          )}
          {field.hint && <small>{field.hint}</small>}
        </label>
      ))}
    </>
  );
}
export function readFields(form: HTMLFormElement, fields: Field[]) {
  const values = new FormData(form),
    result: RecordValue = {};
  for (const field of fields) {
    const raw = values.get(field.name);
    if (field.type === "checkbox") {
      result[field.name] = raw !== null;
      continue;
    }
    if (field.type === "checkboxes") {
      const chosen = values.getAll(field.name).map(String);
      if (chosen.length) result[field.name] = chosen;
      continue;
    }
    if (raw === null || raw === "") continue;
    const value = String(raw);
    result[field.name] =
      field.type === "number"
        ? Number(value)
        : field.type === "list"
          ? value
              .split(/[\n,]/)
              .map((x) => x.trim())
              .filter(Boolean)
          : field.type === "json"
            ? JSON.parse(value)
            : field.type === "datetime-local"
              ? localInstant(value).instant
              : value;
  }
  return result;
}
export function ActionForm({
  title,
  path,
  fields,
  defaults = {},
  method = "POST",
  submit = "Save",
  explanation,
  onSaved,
  onOpen,
  transform,
  open = false,
}: {
  title: string;
  path: string;
  fields: Field[];
  defaults?: RecordValue;
  method?: string;
  submit?: string;
  explanation?: string;
  onSaved?: (result: RecordValue) => void;
  onOpen?: () => void;
  transform?: (values: RecordValue) => RecordValue;
  open?: boolean;
}) {
  const action = useMutation(),
    [parseError, setParseError] = useState<unknown>(null),
    [saved, setSaved] = useState(false),
    [savedResult, setSavedResult] = useState<RecordValue | null>(null),
    [operationKey, setOperationKey] = useState(() => crypto.randomUUID());
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setParseError(null);
    setSaved(false);
    let values: RecordValue;
    try {
      values = { ...defaults, ...readFields(event.currentTarget, fields) };
      if ("idempotencyKey" in defaults) values.idempotencyKey = operationKey;
      if ("deduplicationKey" in defaults)
        values.deduplicationKey = operationKey;
      if (transform) values = transform(values);
    } catch (error) {
      setParseError(error instanceof Error ? error : new Error("Check the structured details. Nothing was sent."));
      return;
    }
    const result = await action.mutate<RecordValue>(path, values, method);
    if (result) {
      setSaved(true);
      setSavedResult(result);
      setOperationKey(crypto.randomUUID());
      onSaved?.(result);
    }
  }
  return (
    <details className="action-disclosure" data-action-path={path} open={open || undefined} onToggle={e=>{if(e.currentTarget.open)onOpen?.();}}>
      <summary>{title}</summary>
      <form className="inline-form" onSubmit={send}>
        {explanation && <p>{explanation}</p>}
        <div className="field-grid">
          <Fields fields={fields} />
        </div>
        <ErrorNotice error={parseError ?? action.error} />
        {saved && (
          <Notice>
            Saved to the service record. Any external effects and verification
            are shown separately.
            {savedResult?.custodyEventId ? (
              <p>
                Recorded custody event:{" "}
                <code>{String(savedResult.custodyEventId)}</code>
              </p>
            ) : null}
          </Notice>
        )}
        <button className="action primary" disabled={action.pending}>
          {action.pending ? "Saving…" : submit}
        </button>
      </form>
    </details>
  );
}
