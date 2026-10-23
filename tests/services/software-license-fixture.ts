import type { Hono } from 'hono';
import type { AppEnv } from '../../src/platform/types';

/** Only network edges are faked. Production connection/route/grant/D1 code runs. */
export function installSoftwareLicenseFixture(app:Hono<AppEnv>) {
  let control:any={},db:D1Database|undefined,inventoryAt=new Date(Date.now()-1000).toISOString();
  const users=Array.from({length:120},(_,i)=>({id:`zoom-${i+1}`,email:`member${i+1}@example.test`,type:2}));
  const calls:any[]=[],group=new Set<string>(),absent=new Set<string>();
  const native=globalThis.fetch;
  const tenant='00000000-0000-0000-0000-000000000001';
  app.post('/fixture/software-license',async c=>{
    const b=await c.req.json();control={...control,...b};db=c.env.DB;
    if(b.advanceInventory){inventoryAt=new Date().toISOString();for(const deviceId of group)absent.add(deviceId);}
    return c.json({calls,users:users.map(u=>({id:u.id,type:u.type})),inventoryAt});
  });
  globalThis.fetch=async(input:any,init:any={})=>{
    const u=new URL(String(input)),method=init.method||'GET';
    if(!['api.zoom.us','zoom.us','login.microsoftonline.com','graph.microsoft.com','synthetic-linen.jamfcloud.com'].includes(u.hostname))return native(input,init);
    calls.push({host:u.hostname,path:u.pathname,method,...(method==='PATCH'?{body:JSON.parse(init.body)}:{})});
    if((u.hostname==='zoom.us'&&u.pathname==='/oauth/token')||u.hostname==='login.microsoftonline.com'||u.pathname==='/api/oauth/token') {
      if(control.revokeOwnerOnToken&&db){control.revokeOwnerOnToken=false;await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='w1' AND user_id='owner'").run();}
      return Response.json({access_token:'synthetic-linen-18001'});
    }
    if(u.hostname==='api.zoom.us') {
      if(u.pathname==='/v2/users/me')return Response.json({id:'zoom-owner',account_id:control.wrongZoomAccount?'other-account':'synthetic-linen-18002'});
      if(u.pathname==='/v2/users')return Response.json({users,total_records:users.length,next_page_token:''});
      if(u.pathname==='/v2/report/users')return Response.json({users:users.slice(0,95).map(u=>({id:u.id,email:u.email})),total_records:95,next_page_token:''});
      const target=users.find(user=>u.pathname==='/v2/users/'+user.id);
      if(method==='PATCH'&&target) {
        if(control.patchLost==='without-effect')throw new Error('synthetic-linen-18003');
        target.type=JSON.parse(init.body).type;
        if(control.patchLost==='after-effect')throw new Error('synthetic-linen-18004');
        return new Response(null,{status:204});
      }
    }
    if(u.hostname==='graph.microsoft.com') {
      if(u.pathname==='/v1.0/organization')return Response.json({value:[{id:tenant}]});
      if(u.pathname==='/v1.0/auditLogs/signIns')return Response.json({value:[{id:'signin-95',userPrincipalName:'member95@example.test',appId:'00000000-0000-0000-0000-000000000002',createdDateTime:new Date(Date.now()-60000).toISOString(),status:{errorCode:0}}]});
      if(u.pathname==='/v1.0/deviceManagement/managedDevices') {
        if(control.hostileCursor)return Response.json({value:[], '@odata.nextLink':'https://untrusted.example.test/stolen'});
        return Response.json({value:Array.from({length:15},(_,i)=>({id:`intune-${i+16}`,serialNumber:`ACROBAT-${i+16}`,userPrincipalName:'employee@example.test',lastSyncDateTime:control.staleInventory?'2020-01-01T00:00:00Z':inventoryAt,deviceName:'Windows'}))});
      }
      if(u.pathname.endsWith('/detectedApps'))return Response.json({value:[{id:'acrobat-product',displayName:'Adobe Acrobat Pro',publisher:'Adobe',version:'24.0'}]});
    }
    if(u.hostname==='synthetic-linen.jamfcloud.com') {
      if(u.pathname==='/api/v4/computers-inventory') {
        const results=Array.from({length:15},(_,i)=>({id:String(i+1),general:{reportDate:control.staleInventory?'2020-01-01T00:00:00Z':inventoryAt},hardware:{serialNumber:`ACROBAT-${i+1}`},userAndLocation:{email:'employee@example.test'},applications:[{name:'Adobe Acrobat Pro.app',bundleId:'com.adobe.Acrobat.Pro',version:'24.0'},...(i===0&&!absent.has('1')?[{name:'Unapproved Tool.app',bundleId:'com.synthetic-linen.unapproved',version:'1.0'}]:[])]})).filter(d=>!control.missingDevice||d.id!=='1');
        return Response.json({results,totalCount:results.length});
      }
      if(u.pathname==='/JSSResource/policies/id/21')return Response.json({policy:{general:{enabled:!control.disabledRemovalPolicy,trigger_checkin:true},scope:{all_computers:false,computer_groups:[{id:20}]},package_configuration:{packages:[{id:22,action:'Uninstall'}]}}});
      if(u.pathname==='/JSSResource/computergroups/id/20') {
        if(method==='PUT'){const match=String(init.body).match(/<id>(\d+)<\/id>/);if(match)group.add(match[1]);return new Response('<computer_group/>',{status:201});}
        return Response.json({computer_group:{is_smart:false,computers:[...group].map(id=>({id:Number(id)}))}});
      }
    }
    return Response.json({error:'synthetic-linen-18005'},{status:404});
  };
}
