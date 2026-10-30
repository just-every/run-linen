import {useState,type FormEvent} from 'react';
import {useMutation} from './state';
import {ErrorNotice,Notice} from './primitives';
export function BiDestinationSetup({onSaved}:{onSaved:(id:string)=>void}) {
 const [provider,setProvider]=useState('gcs'),[mode,setMode]=useState('service_account'),save=useMutation(),[saved,setSaved]=useState(false);
 const google=['gcs','bigquery'].includes(provider),storage=['gcs','azure'].includes(provider);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget,f=new FormData(form),body:Record<string,unknown>={provider,consent:f.has('consent')};for(const [name,value]of f)if(name!=='consent'&&value)body[name]=value;
  const result=await save.mutate<{id:string}>('/bi/exports',body);if(result){form.reset();setSaved(true);onSaved(result.id)}}
 const input=(name:string,label:string,secret=false,required=true)=><label key={name}>{label}<input name={name} type={secret?'password':'text'} required={required} autoComplete="off" spellCheck={false}/></label>;
 return <details className="action-disclosure"><summary>Configure another BI destination</summary><form className="inline-form" aria-label="Warehouse and storage setup" autoComplete="off" onSubmit={submit}>
  <label>Provider<select value={provider} onChange={e=>{setProvider(e.target.value);setMode(e.target.value==='azure'?'oauth':'service_account');setSaved(false)}}><option value="gcs">Google Cloud Storage</option><option value="azure">Azure Blob Storage</option><option value="snowflake">Snowflake</option><option value="bigquery">BigQuery</option></select></label>
  {input('name','Export name')}
  {provider==='gcs'&&input('bucket','Cloud Storage bucket')}
  {provider==='azure'&&<>{input('account','Azure storage account')}{input('container','Blob container')}<label>Authentication<select name="authMode" value={mode} onChange={e=>setMode(e.target.value)}><option value="oauth">OAuth token</option><option value="sas">Container SAS</option></select></label></>}
  {storage&&input('prefix','Object prefix')}
  {provider==='snowflake'&&<>{input('account','Snowflake account identifier')}{input('database','Database')}{input('schema','Schema')}{input('table','Table')}{input('warehouse','Warehouse')}{input('role','Snowflake role (optional)',false,false)}<label>Token type<select name="tokenType"><option value="PROGRAMMATIC_ACCESS_TOKEN">Programmatic access token</option><option value="OAUTH">OAuth token</option></select></label></>}
  {provider==='bigquery'&&<>{input('project','Google Cloud project')}{input('dataset','Dataset')}{input('table','Table')}{input('location','BigQuery location')}</>}
  {google&&<label>Google authentication<select name="credentialMode" value={mode} onChange={e=>setMode(e.target.value)}><option value="service_account">Service account · renewable</option><option value="oauth">Short-lived OAuth token</option></select></label>}
  {google&&mode==='service_account'?<>{input('clientEmail','Service account email')}<label>Service account private key · PKCS8<textarea name="privateKey" required autoComplete="off" spellCheck={false} style={{WebkitTextSecurity:'disc'} as React.CSSProperties}/></label></>:provider==='azure'&&mode==='sas'?input('sasToken','Container SAS query',true):input('accessToken','Provider access token',true)}
  <Notice>Use an existing destination and scoped credentials. Storage receives CSV objects; warehouses receive row upserts into an existing table with Linen’s ticket columns. Short-lived tokens must be replaced when they expire; Google service accounts renew access per run.</Notice>
  <label className="checkbox-field"><input type="checkbox" name="consent" required/><span>I authorize nightly exports to this destination under my current permissions.</span></label>
  <ErrorNotice error={save.error}/><button className="action primary" disabled={save.pending}>Save BI destination</button>
  {saved&&<p>Destination saved. No delivery is claimed until a provider receipt is recorded.</p>}
 </form></details>;
}
