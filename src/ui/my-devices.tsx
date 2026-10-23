import { text, type RecordValue } from "./api";
import { useRemote } from "./state";

/** The employee's own devices, shown on the portal home. Nothing is shown to a person with no reviewed account link. */
export function MyDevices() {
  const remote = useRemote<{ items: RecordValue[] }>("/my/devices");
  if (!remote.data?.items.length) return null;
  return (
    <section className="panel" aria-label="My devices">
      <h2>My devices</h2>
      <ul className="plain-list">{remote.data.items.map((d) => <li key={text(d.id)}>{text(d.asset_tag, text(d.serial))} · serial {text(d.serial)} · {text(d.state)}{d.location ? ` · ${text(d.location)}` : ""}</li>)}</ul>
    </section>
  );
}
