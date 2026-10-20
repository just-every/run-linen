import { date, text, type RecordValue } from "./api";
import { useRemote } from "./state";
import { ActionForm } from "./forms";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";

type Purchase = RecordValue & { id: string; quantity: number; estimate_cents: number; unit_cents: number; buyer: string; state: string; order_reference: string | null };
type Line = RecordValue & { id: string; location: string; item: string; kind: string; on_hand: number; threshold: number; reorder_quantity: number; unit_cents: number; buyer: string; revision: number; belowThreshold: boolean; purchases: Purchase[] };
const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const buyers = ["Purse", "CDW", "Apple Business", "Dell"].map((value) => ({ value, label: value }));
const stateText: Record<string, string> = {
  raised: "Raised in Linen, not sent", ordered: "Ordered by hand with the buyer", cancelled: "Cancelled", received: "Received into stock",
};

/** ASSET-005: counted stock per location; allocation that reaches a threshold raises a purchase request Linen does not send. */
export function StockRooms({ people, onChanged }: { people: RecordValue[]; onChanged: () => void }) {
  const lines = useRemote<{ items: Line[] }>("/stock-lines");
  const changed = () => { lines.refresh(); onChanged(); };
  return <section className="connection-record">
    <div className="section-heading"><h2>Stock rooms</h2></div>
    <p>Each line counts one item at one location. Allocating stock to a person lowers the count; when the count falls to or below the reorder threshold, Linen raises one purchase request for the reorder quantity. Linen does not send it to Purse or the vendor yet: place the order yourself and record its reference here.</p>
    {lines.loading ? <Loading /> : <ErrorNotice error={lines.error} retry={lines.refresh} />}
    {lines.data?.items.map((line) => <StockLine key={`${line.id}:${line.revision}`} line={line} people={people} onChanged={changed} />)}
    <ActionForm title="Add a stock line" path="/stock-lines" submit="Add stock line" onSaved={lines.refresh}
      transform={({ unitEstimateUsd, ...values }) => ({ ...values, unitCents: Math.round(Number(unitEstimateUsd) * 100) })}
      fields={[
        { name: "location", label: "Stock location", required: true },
        { name: "item", label: "Item", required: true, hint: "One line per item at this location, ignoring case and extra spaces." },
        { name: "kind", label: "Kind", type: "select", required: true, options: [{ value: "accessory", label: "Accessory" }, { value: "device", label: "Device" }] },
        { name: "onHand", label: "Counted on hand", type: "number", required: true },
        { name: "threshold", label: "Reorder threshold", type: "number", required: true, hint: "A request is raised when the count falls to or below this number." },
        { name: "reorderQuantity", label: "Reorder quantity", type: "number", required: true },
        { name: "unitEstimateUsd", label: "Unit estimate (USD)", type: "number", required: true, hint: "Kept in whole cents." },
        { name: "buyer", label: "Buy from", type: "select", required: true, options: buyers },
      ]} />
  </section>;
}

function StockLine({ line, people, onChanged }: { line: Line; people: RecordValue[]; onChanged: () => void }) {
  return <article aria-label={`${line.item} at ${line.location}`}>
    <h3>{line.item} at {line.location} {line.belowThreshold && <Badge value="at or below threshold" />}</h3>
    <Facts entries={[["Counted on hand", line.on_hand], ["Reorder threshold", line.threshold], ["Reorder quantity", line.reorder_quantity],
      ["Unit estimate", usd(line.unit_cents)], ["Buy from", line.buyer], ["Kind", line.kind]]} />
    {line.on_hand > 0 && <ActionForm title="Allocate from stock" path={`/stock-lines/${line.id}/allocate`} submit="Allocate" defaults={{ revision: line.revision }} onSaved={onChanged}
      fields={[
        { name: "personId", label: "Person", type: "select", required: true, options: people.map((p) => ({ value: text(p.id), label: text(p.name) })) },
        { name: "quantity", label: "Quantity", type: "number", required: true, value: 1 },
        { name: "evidence", label: "Handoff evidence", type: "textarea", required: true },
      ]} />}
    {line.purchases.map((purchase) => <PurchaseRequest key={`${purchase.id}:${purchase.state}`} line={line} purchase={purchase} onChanged={onChanged} />)}
  </article>;
}

function PurchaseRequest({ line, purchase, onChanged }: { line: Line; purchase: Purchase; onChanged: () => void }) {
  return <article aria-label={`Purchase request for ${line.item} at ${line.location}`}>
    <h4>Purchase request <Badge value={purchase.state} /></h4>
    <p role="status">{stateText[purchase.state] ?? purchase.state}</p>
    <Facts entries={[["Quantity", purchase.quantity], ["Estimate", `${usd(purchase.estimate_cents)} (${purchase.quantity} × ${usd(purchase.unit_cents)})`],
      ["Buyer", purchase.buyer], ["Raised", date(purchase.raised_at)], ["Order reference", purchase.order_reference], ["Reason", purchase.reason]]} />
    {purchase.state === "raised" && <Notice>Not sent to {purchase.buyer}. Linen has no connection that sends purchase requests yet.</Notice>}
    {purchase.state === "raised" && <ActionForm title="Record the order" path={`/stock-purchases/${purchase.id}/order`} submit="Record order" onSaved={onChanged}
      fields={[{ name: "orderReference", label: `${purchase.buyer} order reference`, required: true }]} />}
    {purchase.state === "ordered" && <ActionForm title="Receive into stock" path={`/stock-purchases/${purchase.id}/receive`} submit="Receive" onSaved={onChanged}
      fields={[{ name: "evidence", label: "Receipt evidence", type: "textarea", required: true }]} />}
    {(purchase.state === "raised" || purchase.state === "ordered") && <ActionForm title="Cancel the request" path={`/stock-purchases/${purchase.id}/cancel`} submit="Cancel request" onSaved={onChanged}
      fields={[{ name: "reason", label: "Reason", type: "textarea", required: true }]} />}
  </article>;
}
