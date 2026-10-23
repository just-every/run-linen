import {ActionForm} from './forms';
import {Facts,Notice} from './primitives';
import type {SoftwareLicense,SoftwareOptions} from './software-licenses-types';

/** A provider-reported email is a fact to review, never a membership grant. */
export function SoftwareDeviceUsers({license,options,onChanged}:{license:SoftwareLicense;options:SoftwareOptions;onChanged:()=>void}) {
 const sources=license.data.sourceBindings.filter(s=>['jamf','intune'].includes(s.kind));
 if(!sources.length)return null;
 const connections=sources.map(s=>options.connections.find(c=>c.id===s.connectionId)).filter(c=>c?.status==='active');
 const choices=connections.map(c=>({value:c!.id,label:c!.name}));
 const fields=[{name:'connectionId',label:'Inventory source',type:'select' as const,required:true,options:choices},{name:'deviceId',label:'Exact provider device ID',required:true,hint:'Use the device identifier from the current source inventory.'},{name:'confirmed',label:'I reviewed this exact device and its current member binding.',type:'checkbox' as const,required:true},{name:'reason',label:'Reason and source of this identity confirmation',type:'textarea' as const,required:true}];
 return <section className="connection-record" aria-label="Confirmed device users">
  <h2>Confirmed device users</h2>
  <Notice>Provider email alone does not select a member. Until an owner confirms the device and current member, its installation stays with the owner for review and creates no employee notice.</Notice>
  {license.data.deviceUsers.length?license.data.deviceUsers.map(binding=><Facts key={`${binding.connectionId}:${binding.deviceId}`} entries={[["Source",options.connections.find(c=>c.id===binding.connectionId)?.name??binding.connectionId],["Device ID",binding.deviceId],["Confirmed member",options.members.find(m=>m.id===binding.userId)?.name??'Unavailable member'],["Confirmation reason",binding.reason]]}/>):<p>No device users confirmed.</p>}
  {choices.length?<>
   <ActionForm title="Confirm a device's user" path={`/software-licenses/${license.id}/device-users`} defaults={{revision:license.revision}} fields={[fields[0],fields[1],{name:'userId',label:'Current workspace member',type:'select',required:true,options:options.members.map(m=>({value:m.id,label:m.name}))},fields[2],fields[3]]} submit="Confirm device user" onSaved={onChanged} explanation="A new confirmation clears the previous observation and execution grant. Sync again before relying on the mapped inventory."/>
   {!!license.data.deviceUsers.length&&<ActionForm title="Remove a device user confirmation" path={`/software-licenses/${license.id}/device-users`} defaults={{revision:license.revision,userId:null}} fields={fields} submit="Remove device user confirmation" onSaved={onChanged}/>}
  </>:<p>Sync the configured inventory source before confirming a device user.</p>}
 </section>;
}
