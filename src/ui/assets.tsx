import { LinkedTickets } from './work-relationships';
import { AssetFinancials } from './asset-financials';
import { AssetContracts } from "./asset-contracts";
import { AssetAudits } from "./asset-audits";
import { StockRooms } from "./stock";
import { usePeopleLabels } from "./people-labels";
import { useState } from "react";
import { date, text, humanize, type RecordValue } from "./api";
import { useRemote } from "./state";
import { ActionForm } from "./forms";
import { Badge, Empty, ErrorNotice, Evidence, Facts, Hero, Loading, Notice } from "./primitives";
export function AssetsSpace({selectedId}:{selectedId?:string}) {
  const [custody, setCustody] = useState<string | null>(null);
  const list = useRemote<{ items: RecordValue[] }>("/assets"),
    people = useRemote<{ items: RecordValue[] }>("/people");
  return (
    <>
      <Hero eyebrow="Devices & custody" title="Devices">
        <p className="lead">
          Know where things stand. A device record is not a handoff. Keep source identity, actual receipt
          and remaining responsibility distinct.
        </p>
      </Hero>
      {custody && (
        <Notice>
          Custody event recorded: <code>{custody}</code>. Use this actual
          receipt or return identity for the matching lifecycle duty.
        </Notice>
      )}
      {!selectedId && <AssetAudits onChanged={list.refresh} />}
      {!selectedId && <StockRooms people={people.data?.items ?? []} onChanged={list.refresh} />}
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} retry={list.refresh} />
      ) : list.data?.items.length ? (
        list.data.items.filter(asset=>!selectedId||asset.id===selectedId).map((asset) => (
          <section className="connection-record" key={text(asset.id)}>
            <div className="section-heading">
              <h2>{text(asset.serial)}</h2>
              <Badge value={asset.state} />
            </div>
            <Facts
              entries={[
                [
                  "Person",
                  people.data?.items.find((p) => p.id === asset.person_id)
                    ?.name ?? asset.person_id,
                ],
                ["Asset tag", asset.asset_tag],
                ["Location", asset.location],
                ["Source", asset.source],
                ["Last observed", date(asset.observed_at)],
              ]}
            />
            <ActionForm
              title="Record a custody change"
              path={`/assets/${text(asset.id)}/commands`}
              defaults={{ revision: asset.revision }}
              fields={[
                {
                  name: "command",
                  label: "What happened?",
                  type: "select",
                  required: true,
                  options: [
                    "reserve",
                    "assign",
                    "loan",
                    "receive",
                    "return",
                    "repair",
                    "retire",
                    "dispose",
                    "missing",
                  ].map((value) => ({ value, label: humanize(value) })),
                },
                {
                  name: "personId",
                  label: "Person",
                  type: "select",
                  options: people.data?.items.map((p) => ({
                    value: text(p.id),
                    label: text(p.name),
                  })),
                },
                { name: "location", label: "Location" },
                {
                  name: "evidence",
                  label: "Actual evidence and source",
                  type: "textarea",
                  required: true,
                },
                { name: "certificatePartner", label: "ITAD partner", hint: "Required for disposal." },
                { name: "certificateStandard", label: "ITAD certification", type: "select", options: [
                  { value: "R2v3", label: "R2v3" }, { value: "e-Stewards", label: "e-Stewards" },
                ] },
                { name: "certificateReference", label: "Disposal certificate URL", hint: "Link to the partner’s actual certificate over HTTPS. Kept with the disposal receipt." },
              ]}
              onSaved={(result) => {
                setCustody(text(result.custodyEventId));
                list.refresh();
              }}
            />
            <AssetContracts assetId={text(asset.id)} />
            <AssetFinancials assetId={text(asset.id)} />
            <LinkedTickets kind="asset" targetId={text(asset.id)} />
            <AssetHistory key={`${asset.id}:${asset.revision}`} assetId={text(asset.id)} />
            <Evidence value={asset} />
          </section>
        ))
      ) : (
        <Empty title="No devices recorded.">
          Add a real device source; do not infer custody from an imported
          assignment.
        </Empty>
      )}
      <ActionForm
        title="Record a device"
        path="/assets"
        fields={[
          { name: "serial", label: "Unique serial number", required: true },
          { name: "assetTag", label: "Asset tag" },
          {
            name: "source",
            label: "Authoritative device source",
            required: true,
          },
          { name: "location", label: "Current location" },
          { name: "procured", label: "Procured, awaiting physical receipt", type: "checkbox", hint: "The source above must identify the purchase record. Leave unchecked for an observed stock record." },
        ]}
        onSaved={list.refresh}
      />
    </>
  );
}

function AssetHistory({ assetId }: { assetId: string }) {
  const history = useRemote<{items:RecordValue[]}>(`/assets/${assetId}/history`);
  const personName = usePeopleLabels();
  return <details className="evidence">
    <summary>Serial-level custody history</summary>
    {history.loading ? <Loading /> : history.error ? <ErrorNotice error={history.error} retry={history.refresh} />
      : history.data?.items.map(event => {
        const certificate = event.certificate as RecordValue | null;
        return <section key={text(event.id)}>
          <h3>{humanize(event.kind)}</h3>
          <Facts entries={[["Recorded by",personName(event.actor_id)],["When",date(event.created_at)],
            ["Person",event.person_id],["Evidence",event.evidence]]} />
          {certificate && <p>{text(certificate.partner)} · {text(certificate.standard)} · {" "}
            <a href={text(certificate.reference)} target="_blank" rel="noreferrer">ITAD disposal certificate</a></p>}
        </section>;
      })}
  </details>;
}
