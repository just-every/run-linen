import { useState } from "react";

/** Reject local wall times that Date would silently normalise or disambiguate. */
export function localInstant(value: string) {
  const chosen = new Date(value);
  const wall = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (!Number.isFinite(chosen.getTime()) || wall(chosen) !== value.slice(0, 16))
    throw new Error("This local time does not exist because the clocks change. Choose a valid time. Nothing was sent.");
  // Search the full possible UTC-offset range, including half-hour transitions.
  for (let minutes = -1440; minutes <= 1440; minutes++) {
    if (minutes && wall(new Date(chosen.getTime() + minutes * 60000)) === wall(chosen))
      throw new Error("This local time occurs twice because the clocks change. Choose an unambiguous time. Nothing was sent.");
  }
  const offset = -chosen.getTimezoneOffset();
  return { instant: chosen.toISOString(), label: `UTC${offset < 0 ? "−" : "+"}${String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0")}:${String(Math.abs(offset) % 60).padStart(2, "0")}` };
}

export function LocalTimeInput({ name, value, required }: { name: string; value?: string | number | boolean; required?: boolean }) {
  const [current, setCurrent] = useState(String(value ?? ""));
  let status = `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  if (current) {
    try { const resolved = localInstant(current); status += ` Chosen offset ${resolved.label}; ${resolved.instant}.`; }
    catch (error) { status += ` ${(error as Error).message}`; }
  }
  return <><input name={name} type="datetime-local" required={required} value={current} onChange={event => setCurrent(event.target.value)} /><small role="status">{status}</small></>;
}
