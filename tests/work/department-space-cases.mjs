import assert from 'node:assert/strict';

/** Department permissions, retained handoff history and private evidence through real public routes. */
export async function departmentSpaceChecks(api,db,uploadBytes) {
  const workspace='synthetic-linen-11200',itUser='synthetic-linen-11201',hrUser='synthetic-linen-11202',facUser='synthetic-linen-11203';
  await db.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind(workspace,workspace,'2026-01-01').run();
  for(const [user,role] of [['owner','owner'],['employee','employee'],['stranger','employee'],[itUser,'operator'],[hrUser,'hr'],[facUser,'operator']]) {
    if(user.startsWith('synthetic-'))await db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind(user,user+'@example.test',user,'unused','2026-01-01').run();
    await db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind(workspace,user,JSON.stringify([role])).run();
  }
  const as=(user,role='operator')=>({'x-workspace':workspace,'x-user':user,'x-roles':JSON.stringify([role])});
  const owner=as('owner','owner'),employee=as('employee','employee'),outsider=as('stranger','employee'),it=as(itUser),hr=as(hrUser,'hr'),fac=as(facUser);
  const call=async(path,body,headers=owner,status=200)=>{const r=await api(path,body,headers);assert.equal(r.status,status,path+' '+JSON.stringify(r.value));return r.value;};
  await call('/departments',{name:'synthetic-linen-11204',kind:'it'},it,403);
  const spaces={};
  for(const kind of ['it','hr','facilities','finance','legal'])spaces[kind]=await call('/departments',{name:kind,kind},owner,201);
  const member=async(kind,userId,active=true)=>{
    const current=(await call('/departments/admin')).items.find(d=>d.id===spaces[kind].id);
    return call('/departments/'+current.id+'/members',{revision:current.revision,userId,active});
  };
  await member('it',itUser);await member('hr',hrUser);await member('facilities',facUser);
  await call('/departments/'+spaces.hr.id+'/members',{revision:1,userId:itUser,active:true},it,403);
  await call('/departments/'+spaces.hr.id,{revision:1,name:'HR',active:false},owner,409);
  const metadata=(await call('/departments',undefined,it)).items;
  assert.equal(metadata.find(d=>d.id===spaces.it.id).canStaff,true);
  assert.equal(metadata.find(d=>d.id===spaces.hr.id).canStaff,false);
  const make=(departmentId,key,headers=employee,extra={})=>call('/work',{departmentId,title:key,body:key+' public request',deduplicationKey:key,...extra},headers,201);
  const hrWork=await make(spaces.hr.id,'synthetic-linen-11205');
  const hrPath='/work/'+hrWork.id;
  await call(hrPath+'/messages',{body:'synthetic-linen-11206 private HR diagnosis',visibility:'private',sourceMessageId:'synthetic-linen-11207'},owner,201);
  await call(hrPath,undefined,it,404);
  assert.ok(!(await call('/work',undefined,it)).items.some(w=>w.id===hrWork.id));
  assert.ok(!(await call('/search?q=synthetic-linen-11205',undefined,it)).items.some(w=>w.id===hrWork.id));
  assert.ok((await call(hrPath,undefined,employee)).messages.every(m=>m.visibility==='public'));
  await call(hrPath+'/shares',{email:itUser+'@example.test'},employee,422);
  assert.ok((await call(hrPath,undefined,hr)).messages.every(m=>m.visibility==='public'),'HR role alone does not expand the existing private-normal rule');
  // An IT operator acting as a requester in HR retains the employee public view only.
  const own=await make(spaces.hr.id,'synthetic-linen-11208',it);
  await call('/work/'+own.id+'/messages',{body:'synthetic-linen-11209 confidentialsalaryadjustment private HR evidence',visibility:'private',sourceMessageId:'synthetic-linen-11210'},owner,201);
  const ownView=await call('/work/'+own.id,undefined,it);
  assert.ok(ownView.messages.every(m=>m.visibility==='public'));
  assert.ok(!(await call('/work/'+own.id+'/activity',undefined,it)).items.some(e=>e.visibility==='private'));
  await call('/work/'+own.id+'/messages',{body:'synthetic-linen-11211',visibility:'private',sourceMessageId:'synthetic-linen-11212'},it,403);
  await call('/work/'+own.id+'/commands',{revision:own.revision,command:'close',reason:'synthetic-linen-11213'},it,403);
  await call('/work/'+own.id+'/classification/override',{type:'question',category:'general',subcategory:'guidance',impact:'low',urgency:'low',workRevision:own.revision,revision:0,reason:'synthetic-linen-11214'},it,403);
  assert.ok((await call('/search?q=confidentialsalaryadjustment')).items.some(item=>item.id===own.id),'Owner can search the actual private evidence');
  assert.equal((await call('/search?q=confidentialsalaryadjustment',undefined,it)).total,0);
  await member('hr',itUser);
  const sensitive=await make(spaces.hr.id,'synthetic-linen-11215',owner,{sensitivity:'hr'});
  await call('/work/'+sensitive.id,undefined,it,404);
  assert.equal((await call('/work/'+sensitive.id,undefined,hr)).work.id,sensitive.id);
  await member('hr',itUser,false);
  // A reviewed reporting line never exposes an HR workspace normal service request to its manager.
  await db.prepare(`INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,active,revision,observed_at,effective_at,member_id,binding_id) VALUES(?,?,?,?,?,?,1,1,?,?,?,?)`)
    .bind('synthetic-linen-11216',workspace,'synthetic-linen-11217','synthetic-linen-11218','synthetic-linen-11219',itUser,'2026-01-01','2026-01-01','employee','synthetic-linen-11220').run();
  assert.ok(!(await call('/team-requests',undefined,it)).items.some(w=>w.id===hrWork.id));
  // Facilities hands the same request to IT; the former agent loses staff access and IT gets the full retained record.
  const request=await make(spaces.facilities.id,'synthetic-linen-11221');
  const path='/work/'+request.id;
  await call(path+'/messages',{body:'synthetic-linen-11222 private repair history',visibility:'private',sourceMessageId:'synthetic-linen-11223'},fac,201);
  assert.equal(typeof uploadBytes,'function','Department proof requires the native attachment transport');
  let attachment;
  {
    const r=await uploadBytes(path+'/attachments',new TextEncoder().encode('synthetic-linen-11224'),{...fac,'content-type':'text/plain','X-Filename':'synthetic-linen-11225.txt','X-Visibility':'private'});
    assert.equal(r.status,201);attachment=r.value;
  }
  await call('/sla-policies',{name:'synthetic-linen-11226',departmentId:spaces.facilities.id,position:1,firstResponseMinutes:30,nextResponseMinutes:60,resolutionMinutes:120},owner,201);
  const before=(await call(path)).work;
  await call(path+'/classification/override',{type:'question',category:'general',subcategory:'guidance',impact:'low',urgency:'low',workRevision:before.revision,revision:0,reason:'synthetic-linen-11227'});
  const clockBefore=await call(path+'/sla');
  assert.ok(clockBefore.policy,'Facilities policy must bind before handoff');
  const revision=(await call(path)).work.revision;
  await call(path+'/department',{revision,departmentId:spaces.it.id,reason:'synthetic-linen-11228'},fac,403);
  await call(path+'/department',{revision,departmentId:spaces.it.id,reason:''},owner,400);
  assert.equal((await call(path)).work.revision,revision,'Missing handoff reason leaves the ticket unchanged');
  const moved=(await call(path+'/department',{revision,departmentId:spaces.it.id,reason:'synthetic-linen-11229'})).work;
  assert.deepEqual([moved.id,moved.department_id,moved.sensitivity],[request.id,spaces.it.id,'normal']);
  await call(path,undefined,fac,404);
  const retained=await call(path,undefined,it);
  assert.ok(retained.messages.some(m=>m.body.includes('synthetic-linen-11222')));
  assert.ok(retained.messages.some(m=>m.source_key.startsWith('transition:department:')));
  const clockAfter=await call(path+'/sla');
  assert.deepEqual(clockAfter.policy,clockBefore.policy);
  assert.deepEqual(clockAfter.resolution.dueAt,clockBefore.resolution.dueAt);
  if(attachment){assert.ok(retained.attachments.some(a=>a.id===attachment.id));await call('/attachments/'+attachment.id,undefined,it);await call('/attachments/'+attachment.id,undefined,fac,404);}
  assert.ok((await call(path+'/activity',undefined,it)).items.some(e=>e.action==='department handed off'));
  await member('it',itUser,false);
  await call(path,undefined,it,404);
  assert.ok(!(await call('/work?departmentId='+spaces.it.id,undefined,it)).items.some(w=>w.id===request.id));
  // Legacy NULL work remains governed by the existing tenant rules, independently of department membership.
  const legacy=await make(undefined,'synthetic-linen-11230');
  assert.equal((await call('/work/'+legacy.id,undefined,it)).work.id,legacy.id);
  assert.ok((await call('/work?departmentId=legacy',undefined,it)).items.some(w=>w.id===legacy.id));
  await call(hrPath+'/department',{revision:(await call(hrPath)).work.revision,departmentId:spaces.it.id,reason:'synthetic-linen-11231'},owner,422);
  const hrSpace=(await call('/departments/admin')).items.find(d=>d.id===spaces.hr.id);
  await call('/departments/'+hrSpace.id,{revision:hrSpace.revision,name:hrSpace.name,active:false});
  await call(hrPath,undefined,hr,404);
  await call(hrPath+'/department',{revision:(await call(hrPath)).work.revision,departmentId:spaces.it.id,reason:'synthetic-linen-11232'},owner,422);
  await call(path,undefined,{...it,'x-workspace':'a'},404);
  await call('/people/'+facUser+'/erase',{revision:0,reason:'synthetic-linen-11233'});
  assert.ok(!(await call('/departments/admin')).items.flatMap(d=>d.members??[]).some(m=>m.userId===facUser));
  const facilities=(await call('/departments/admin')).items.find(d=>d.id===spaces.facilities.id);
  await call('/departments/'+facilities.id+'/members',{revision:facilities.revision,userId:facUser,active:true},owner,422);
  await call('/departments/admin',undefined,outsider,403);
  return {workspace,departments:spaces,workId:request.id};
}
