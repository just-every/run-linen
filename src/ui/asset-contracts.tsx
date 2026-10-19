import { date, humanize, text, type RecordValue } from './api';
import { useRemote } from './state';
import { ActionForm } from './forms';
import { Badge, Empty, ErrorNotice, Facts, Loading, Notice } from './primitives';

type Coverage = {asset:RecordValue;items:RecordValue[]};
export function CoverageReadback({data}:{data:Coverage}) {
  return <section aria-label={`Coverage for ${text(data.asset.serial)}`}>
    <h3>{text(data.asset.serial)} · contracts & coverage</h3>
    {!data.items.length && <p>No contract coverage recorded. Check the vendor before authorizing a repair.</p>}
    {data.items.map(item=><section key={text(item.id)}>
      <h4>{text(item.name)} <Badge value={item.status}/></h4>
      {Boolean(item.alert) && <Notice>{item.alert==='expired' ? 'Expired coverage' : 'Expiry alert'}: {text(item.name)} · {date(item.expires_at)}</Notice>}
      <Facts entries={[["Record type",humanize(item.kind)],["Vendor",(item.vendor as RecordValue).name],
        ["Coverage",item.coverage],["Starts",date(item.starts_at)],["Expires",item.expires_at ? date(item.expires_at) : 'No expiry recorded'],
        ["Alert lead (days)",item.alert_days],["Source recorded",date(item.recorded_at)]]}/>
      <p><a href={text(item.reference)} target="_blank" rel="noreferrer">Contract document</a> · <a href={`#/suppliers/${text(item.vendor_id)}`}>Vendor record</a></p>
      {Boolean(item.manufacturerLookup) && <p><a href={text(item.manufacturerLookup)} target="_blank" rel="noreferrer">Manufacturer warranty lookup</a> · Serial: {text(data.asset.serial)}. Use the manufacturer’s check to confirm current terms.</p>}
      <p className="muted">User-recorded terms; manufacturer verification is separate.</p>
    </section>)}
  </section>;
}
export function AssetContracts({assetId}:{assetId:string}) {
  const contracts=useRemote<Coverage>(`/assets/${assetId}/contracts`),vendors=useRemote<{items:RecordValue[]}>('/suppliers');
  const alerts=contracts.data?.items.filter(item=>item.alert) ?? [];
  return <>{alerts.length>0 && <Notice>{alerts.map(item=>`${text(item.name)}: ${item.alert==='expired' ? 'expired' : 'expires soon'} (${date(item.expires_at)})`).join('; ')}</Notice>}
  <details className="evidence"><summary>Contracts, warranties & vendors</summary>
    {contracts.loading ? <Loading/> : contracts.error ? <ErrorNotice error={contracts.error} retry={contracts.refresh}/>
      : contracts.data && <CoverageReadback data={contracts.data}/>}
    <ErrorNotice error={vendors.error} retry={vendors.refresh}/>
    {!vendors.loading && !vendors.error && !vendors.data?.items.length && <Empty title="Add a vendor first."><a href="#/suppliers">Open vendors</a></Empty>}
    <ActionForm title="Attach an asset contract" path={`/assets/${assetId}/contracts`} fields={[
      {name:'kind',label:'Contract type',type:'select',required:true,options:['purchase','lease','warranty','support'].map(value=>({value,label:humanize(value)}))},
      {name:'name',label:'Contract or warranty name',required:true},
      {name:'vendorId',label:'Contract vendor',type:'select',required:true,options:vendors.data?.items.map(v=>({value:text(v.id),label:text((v.data as RecordValue).name)}))},
      {name:'reference',label:'Contract document URL',required:true,hint:'HTTPS reference to the purchase record, lease or coverage document.'},
      {name:'coverage',label:'Coverage and exclusions',type:'textarea',required:true},
      {name:'startsAt',label:'Coverage starts',type:'date',required:true},
      {name:'expiresAt',label:'Coverage expires',type:'date',hint:'Required except for a purchase record.'},
      {name:'alertDays',label:'Expiry alert lead (days)',type:'number',value:30},
      {name:'manufacturer',label:'Manufacturer lookup',type:'select',options:['apple','dell','lenovo','other'].map(value=>({value,label:humanize(value)}))},
    ]} onSaved={contracts.refresh}/>
  </details></>;
}
export function RepairCoverage({workId}:{workId:string}) {
  const linked=useRemote<{items:Coverage[]}>(`/work/${workId}/repair-assets`),assets=useRemote<{items:RecordValue[]}>('/assets');
  return <details className="evidence"><summary>Repair asset & coverage</summary>
    {linked.loading ? <Loading/> : linked.error ? <ErrorNotice error={linked.error} retry={linked.refresh}/>
      : linked.data?.items.map(item=><CoverageReadback key={text(item.asset.id)} data={item}/>)}
    <ErrorNotice error={assets.error} retry={assets.refresh}/>
    <ActionForm title="Link a repair device" path={`/work/${workId}/repair-assets`} fields={[
      {name:'assetId',label:'Repair device',type:'select',required:true,options:assets.data?.items.map(a=>({value:text(a.id),label:text(a.serial)}))},
    ]} onSaved={linked.refresh}/>
  </details>;
}
