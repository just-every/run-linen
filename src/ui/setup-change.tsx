import { useState, type FormEvent } from "react";
import { useRemote, useMutation } from "./state";
import { request, text, type RecordValue } from "./api";
import { Fields, readFields, type Field } from "./forms";
import { ErrorNotice, Notice, Loading } from "./primitives";
import type { DomainRecord } from "./decisions";

/** Pins are authored once with the draft. Display/approval never refreshes them. */
export function NewChange({ onSaved, templateMode = false, templateRecord }: {
  onSaved: (r: RecordValue) => void; templateMode?: boolean; templateRecord?: DomainRecord;
}) {
  const connections = useRemote<RecordValue[]>("/connections"), services = useRemote<{ items: DomainRecord[] }>("/services"),
    templates = useRemote<{ items: DomainRecord[] }>(templateMode ? null : "/change-templates");
  const d=templateRecord?.data;
  const mutation = useMutation(), [error, setError] = useState<unknown>(null),
    [connectionId, setConnectionId] = useState(String(d?.implementation?.connectionId || "")), [templateId,setTemplateId]=useState("");
  const deployment = connections.data?.filter(c => c.status === "active" && c.provider === "controlled-deployment") ?? [];
  const verifiers = connections.data?.filter(c => c.status === "active" && c.provider === "workflow-probe") ?? [];
  const selected = deployment.find(c => c.id === connectionId), catalog=templates.data?.items.filter(t=>t.data.active&&t.data.approval?.version===t.data.version)||[],
    chosen=catalog.find(t=>t.id===templateId);
  const targets: string[] = selected ? JSON.parse(String(selected.config_json)).targets ?? [] : [];
  const windowFields:Field[]=[{ name: "windowStart", label: "Window starts", type: "datetime-local", required: true },
    { name: "windowEnd", label: "Window ends", type: "datetime-local", required: true }];
  const fields: Field[] = [
    ...(!templateMode?[{ name: "emergency", label: "Emergency change", type: "checkbox" as const, hint: "Uses the ECAB decision path. A current owner must record the reason to schedule inside a freeze. Execution requires separate grants." },
      { name: "emergencyReason", label: "Emergency reason", type: "textarea" as const }]:[]),
    { name: "title", label: templateMode?"Template name":"Intended change", required: true, value:d?.title },
    { name: "service", label: "Affected service", type: "select", required: true, value:d?.services?.[0], options: services.data?.items.map(s => ({ value: s.id, label: text(s.data.name) })) },
    { name: "risk", label: "Risk and uncertainty", type: "textarea", required: true, value:d?.risk },
    { name: "impact", label: "Impact on the business", type: "textarea", required: true, value:d?.impact },
    ...(!templateMode?windowFields:[]),
    { name: "cohorts", label: "Affected cohorts", type: "list", required: true, value:d?.cohorts?.join('\n') },
    { name: "canaryCohorts", label: "Canary cohorts", type: "list", required: true, value:d?.canaryCohorts?.join('\n') },
    { name: "beneficiary", label: "Service beneficiary scope", required: true, value:d?.implementation?.beneficiaryId, hint: "The exact business scope already used by the service grant, such as a named team." },
    { name: "release", label: "Release to deploy", required: true, value:d?.implementation?.payload?.release },
    { name: "compensationRelease", label: "Release to restore if compensation is needed", required: true, value:d?.compensation?.payload?.release },
    ...['implementationPlan','testPlan','backoutPlan'].map((name,i)=>({name,label:['Implementation plan','Test plan','Backout plan'][i],type:'textarea' as const,required:templateMode,value:d?.[name]})),
    ...(templateMode?[{name:'active',label:'Active template',type:'checkbox' as const,value:d?d.active:true}]:[]),
  ];
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    try {
      if(chosen) {
        const v=readFields(e.currentTarget,windowFields), result=await mutation.mutate<RecordValue>('/changes',{
          changeType:'standard',templateId:chosen.id,templateVersion:chosen.data.version,window:{start:v.windowStart,end:v.windowEnd},visibility:'operators',participants:[]});
        if(result)onSaved(result);return;
      }
      const f = new FormData(e.currentTarget), v = readFields(e.currentTarget, fields);
      const verifier = verifiers.find(c => c.id === f.get("verifier"));
      if (!selected || !verifier || !targets.includes(String(f.get("target")))) throw Error("Choose active deployment and verifier connections and a permitted target.");
      const fresh = await request<RecordValue[]>("/connections");
      for (const connection of [selected, verifier]) if (!fresh.some(c => c.id === connection.id && c.revision === connection.revision && c.status === "active")) throw Error("A connection changed. Reload and review the draft before saving.");
      const implementation = { connectionId: selected.id, connectionRevision: selected.revision, verifierConnectionId: verifier.id,
        verifierConnectionRevision: verifier.revision, target: f.get("target"), beneficiaryId: v.beneficiary, payload: { release: v.release } };
      const result = await mutation.mutate<RecordValue>(templateMode?(templateRecord?`/change-templates/${templateRecord.id}`:'/change-templates'):"/changes", {
        title: v.title, emergency: v.emergency, emergencyReason: v.emergencyReason, risk: v.risk, impact: v.impact, services: [v.service], cohorts: v.cohorts, canaryCohorts: v.canaryCohorts,
        ...(templateMode?{active:v.active,...(templateRecord?{revision:templateRecord.revision}:{})}:{window: { start: v.windowStart, end: v.windowEnd }}), dependencies: [], participants: [], visibility: "operators",
        implementationPlan:v.implementationPlan,testPlan:v.testPlan,backoutPlan:v.backoutPlan,
        implementation, compensation: { ...implementation, payload: { release: v.compensationRelease } },
      },templateRecord?'PATCH':'POST');
      if (result) onSaved(result);
    } catch (e) { setError(e); }
  }
  if (templateRecord && (!connections.data || !services.data)) return connections.error || services.error
    ? <ErrorNotice error={connections.error || services.error} retry={()=>{connections.refresh();services.refresh();}}/>
    : <Loading label="Reading the template’s services and checked connections…"/>;
  return <details className="action-disclosure" onToggle={e=>{if(e.currentTarget.open&&!templateMode)templates.refresh();}}><summary>{templateMode?(templateRecord?`Edit template ${text(d?.title)}`:'Add change template'):'Add change'}</summary><form className="inline-form" onSubmit={save}>
    {!templateMode&&<label>Standard change catalog<select aria-label="Standard change catalog" value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">Normal or emergency change…</option>{catalog.map(t=><option key={t.id} value={t.id}>{text(t.data.title)} · version {t.data.version}</option>)}</select></label>}
    {chosen?<><Notice>Standard change: CAB is skipped under this exact owner-preapproved template. Separate execution grants and calendar policy still apply.</Notice>
      <p>{chosen.data.impact}</p>{['implementationPlan','testPlan','backoutPlan'].map((name,i)=><section key={name}><h3>{['Implementation plan','Test plan','Backout plan'][i]}</h3><p>{chosen.data[name]}</p></section>)}<Fields fields={windowFields}/></>:<>
    <Fields fields={fields} />
    <label>Deployment connection<select required value={connectionId} onChange={e => setConnectionId(e.target.value)}><option value="">Choose a checked connection…</option>{deployment.map(c => <option key={text(c.id)} value={text(c.id)}>{text(c.name)}</option>)}</select></label>
    <label>Deployment target<select name="target" key={connectionId} defaultValue={d?.implementation?.target||''} required><option value="">Choose a permitted target…</option>{targets.map(t => <option key={t}>{t}</option>)}</select></label>
    <label>Workflow verifier<select name="verifier" defaultValue={d?.implementation?.verifierConnectionId||''} required><option value="">Choose a checked independent verifier…</option>{verifiers.map(c => <option key={text(c.id)} value={text(c.id)}>{text(c.name)}</option>)}</select></label>
    <Notice>{templateMode?'Saving creates a version that needs owner preapproval for new requests. Existing unchanged changes retain their recorded approval until explicitly withdrawn.':'Saving pins these current connection versions in the implementation and compensation draft. Later connection changes require a new implementation review; approval never silently updates a pin.'}</Notice>
    </>}
    <ErrorNotice error={error ?? mutation.error ?? connections.error ?? services.error ?? templates.error} />
    <button className="action primary" disabled={mutation.pending}>{templateMode?'Save template version':'Save change draft'}</button>
  </form></details>;
}
