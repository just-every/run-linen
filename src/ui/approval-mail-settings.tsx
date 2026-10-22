import {useState,type FormEvent} from 'react';
import {request} from './api';
import {useRemote,useSession} from './state';
import {ErrorNotice,Notice} from './primitives';
import type {ApprovalMailConfig} from '../features/work/approval-mail-provider';
export function ApprovalMailSettings(){
 const {session}=useSession(),config=useRemote<(ApprovalMailConfig|{revision:number;enabled:number})&{confirmationUrl?:string|null}>('/approval-mail/config'),connections=useRemote<{id:string;name:string;provider:string;status:string}[]>('/connections');
 const [error,setError]=useState<unknown>(),[saving,setSaving]=useState(false);
 async function save(e:FormEvent<HTMLFormElement>){e.preventDefault();setSaving(true);setError(undefined);const data=new FormData(e.currentTarget);try{await request('/approval-mail/config',{method:'POST',csrf:session.csrfToken,body:{revision:config.data?.revision??0,enabled:data.has('enabled'),consent:data.has('consent'),recipient:data.get('recipient'),sendingConnectionId:data.get('connection'),topicArn:data.get('topic'),signingCertUrl:data.get('certificate'),publicKey:data.get('key')}});config.refresh();}catch(error){setError(error);}finally{setSaving(false);}}
 const saved=config.data as ApprovalMailConfig|undefined;
 return <details className="action-disclosure"><summary>Approval email replies</summary><p>Approval packets use your SendGrid connection. Replies must arrive through an Amazon SES receiving rule with an SNS action that includes the original email and SPF, DKIM and DMARC verdicts. Configure SNS signature version 2 and pin its certificate public key. After SNS sends its signed subscription request, use the confirmation link below. Linen does not follow it automatically.</p>
 <Notice>Until you explicitly enable this connection, decisions remain in Linen. The receiver refuses unsigned messages, missing authentication verdicts, forwarded replies and changed requests.</Notice>
 <ErrorNotice error={config.error??connections.error}/>{config.data?.confirmationUrl&&<p><a href={config.data.confirmationUrl} target="_blank" rel="noreferrer">Confirm selected SNS subscription</a></p>}<form key={config.data?.revision} className="inline-form" onSubmit={e=>void save(e)}>
 <label className="checkbox-field"><input type="checkbox" name="enabled" defaultChecked={saved?.enabled===1}/>Enable approval email</label>
 <label>Send using<select aria-label="Send using" name="connection" defaultValue={saved?.sending_connection_id??''}><option value="">Choose SendGrid connection</option>{connections.data?.filter(c=>c.provider==='sendgrid'&&c.status==='active').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
 <label>SES receiving mailbox<input name="recipient" type="email" defaultValue={saved?.recipient??''}/></label>
 <label>SNS topic ARN<input name="topic" defaultValue={saved?.topic_arn??''}/></label>
 <label>SNS signing certificate URL<input name="certificate" type="url" defaultValue={saved?.signing_cert_url??''}/></label>
 <label>Certificate public key (base64 RSA SPKI)<textarea name="key" defaultValue={saved?.public_key??''}/></label>
 <label className="checkbox-field"><input type="checkbox" name="consent"/>I authorize sending approval packets to their current holders and trust this SES SNS topic to authenticate replies.</label>
 <p>Webhook endpoint: <code>/api/v1/approval-mail/webhooks/{session.principal.workspaceId}</code>. Certificate rotation requires a new reviewed configuration. Keep the SNS topic restricted to your SES receiving rule.</p>
 <ErrorNotice error={error}/><button className="action primary" disabled={saving}>Save approval email configuration</button></form></details>;
}
