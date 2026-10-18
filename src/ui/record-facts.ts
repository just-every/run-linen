// Recorded objects as fact rows people read, in place of raw JSON.
import { date, text } from "./api";

/** Recorded fields whose words alone would not say what they hold: a model connection's cost estimates. */
const fieldLabels: Record<string, string> = {
  inputUsdPerMillion: "Input cost (USD per million tokens)",
  cachedInputUsdPerMillion: "Cached input cost (USD per million tokens)",
  outputUsdPerMillion: "Output cost (USD per million tokens)",
  maxAttemptUsd: "Maximum cost per attempt (USD)",
  limitUsd: "Budget (USD)",
};
/** A field name as words: "observedAt" and "observed_at" read "Observed at", a trailing id reads "ID", usd reads "USD". */
export function fieldLabel(key: string) {
  if (fieldLabels[key]) return fieldLabels[key];
  const words = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[._-]+/g, " ").trim().toLowerCase().replace(/\bid$/, "ID").replace(/\burl$/, "URL").replace(/\busd\b/g, "USD");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
/** One value as people read it: dates in the US style, yes or no, lists joined. */
function valueText(value: unknown): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && instant.test(value)) return date(value);
  return text(value);
}

/** Any recorded value as fact rows: nested fields become "Parent · field", lists of values are joined, dates read in the US style. */
export function recordFacts(value: unknown, prefix = ""): [string, string][] {
  const label = (key: string) => (prefix ? `${prefix} · ${key}` : key);
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) return [[prefix || "Values", value.length ? value.map(valueText).join(", ") : "None recorded"]];
    return value.flatMap((item, index) => recordFacts(item, label(`${index + 1}`)));
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (!entries.length) return [[prefix || "Details", "None recorded"]];
    return entries.flatMap(([key, item]) =>
      item && typeof item === "object" ? recordFacts(item, label(fieldLabel(key))) : [[label(fieldLabel(key)), valueText(item)] as [string, string]],
    );
  }
  return [[prefix || "Value", valueText(value)]];
}
