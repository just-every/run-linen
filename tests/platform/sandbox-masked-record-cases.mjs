import assert from 'node:assert/strict';

// One selected-ticket copy flow through authenticated public HTTP doors.
export async function maskedCopyChecks({invoke,fixture,owner,other,requester,work}) {
 const box=await invoke('/sandboxes','POST',{name:'Masked ticket rehearsal'},owner,201),path='/sandboxes/'+box.id;
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'Default creation copies no personal records');
 const selection={revision:box.revision,consent:true,records:[{id:work.id,revision:work.revision}]};
 for(const auth of [requester,other])await invoke(path+'/masked-records','POST',selection,auth,auth===requester?403:404);
 for(const invalid of [{...selection,consent:false},{...selection,records:[]},{...selection,records:[selection.records[0],selection.records[0]]}])await invoke(path+'/masked-records','POST',invalid,owner,422);
 const before=await fixture({});
 await invoke(path+'/masked-records','POST',{...selection,records:[selection.records[0],{id:'synthetic-linen-600-missing',revision:1}]},owner,404);
 assert.deepEqual(await fixture({}),before,'A mixed invalid selection persists and audits nothing');
 await fixture({raceMaskedSelection:work.id});
 const beforeRace=await fixture({});
 await invoke(path+'/masked-records','POST',selection,owner,409);
 assert.deepEqual(await fixture({}),beforeRace,'A source change after selection refuses persistence and audit atomically');
 const copied=await invoke(path+'/masked-records','POST',selection);
 assert.equal(copied.items.length,1);assert.notEqual(copied.items[0].id,work.id);
 assert.equal(copied.items[0].fields.title,'[masked]');assert.equal(copied.items[0].fields.requester_id,'[masked]');
 assert.ok(Object.keys(copied.items[0].fields).length>10);
 assert.deepEqual([...new Set(Object.values(copied.items[0].fields))],['[masked]'],'Every source value is replaced, including identifiers, dates and nested JSON');
 const stored=await fixture({});
 assert.equal(stored.maskedRows.length,1);
 for(const value of [work.id,work.requester_id,work.title])if(value)assert.ok(!JSON.stringify(stored.maskedRows).includes(value),'Source values never enter sandbox storage');
 assert.deepEqual(stored.protectedTables,before.protectedTables,'Masked copying leaves production records and grants unchanged');
 assert.deepEqual(stored.connections,before.connections,'Masked copying leaves credentials unchanged');
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,copied.items);
 const audit=stored.sandboxAudits.find(row=>row.action==='sandbox.masked_copy');assert.ok(audit);assert.deepEqual(JSON.parse(audit.detail_json),{count:1,masking:'all-source-values',revision:box.revision});
 // Explicit family rows have no retained production identity, bytes or authority.
 await fixture({seedMaskedFamilies:work.id});
 const familySelection={...selection,records:[
  {...selection.records[0],kind:'ticket'},
  {kind:'message',id:'synthetic-linen-620',workId:work.id,revision:work.revision},
  {kind:'attachment',id:'synthetic-linen-623',workId:work.id,revision:work.revision},
  {kind:'person',id:'synthetic-linen-627',revision:1},
 ]};
 const familyBefore=await fixture({});
 for(const records of [
  [{kind:'message',id:'synthetic-linen-620',workId:'synthetic-linen-631',revision:work.revision}],
  [{kind:'attachment',id:'synthetic-linen-623',workId:work.id,revision:work.revision+1}],
  [{kind:'person',id:'synthetic-linen-627',revision:2}],
  [familySelection.records[0],{kind:'person',id:'synthetic-linen-632',revision:1}],
 ])await invoke(path+'/masked-records','POST',{...familySelection,records},owner,404);
 assert.deepEqual(await fixture({}),familyBefore,'Invalid family selections neither persist nor audit');
 const families=await invoke(path+'/masked-records','POST',familySelection);
 assert.deepEqual(families.items.map(row=>row.kind),['ticket','message','attachment','person']);
 assert.equal(families.items[1].fields.body,'[masked]');
 assert.equal(families.items[2].fields.blob_key,'[masked]');
 assert.equal(families.items[3].fields.name,'[masked]');
 for(const row of families.items)assert.deepEqual([...new Set(Object.values(row.fields))],['[masked]']);
 const familyStored=await fixture({});
 assert.deepEqual(familyStored.protectedTables,familyBefore.protectedTables,'All source family records remain unchanged');
 for(const value of ['synthetic-linen-620','synthetic-linen-621','synthetic-linen-624','synthetic-linen-629','synthetic-linen-630',work.id]){
  assert.ok(!JSON.stringify(familyStored.maskedRows).includes(value),'Family storage contains no source values or identity links');
  assert.ok(!JSON.stringify(familyStored.sandboxAudits).includes(value),'Copy logs contain no source values or identity links');
  assert.ok(!JSON.stringify(families).includes(value),'Copy response contains no source values or identity links');
 }
 assert.ok(!JSON.stringify(await invoke(path,'GET')).includes(families.items[1].id),'Families never enter the configuration package');
 for(const kind of ['message','attachment','person']){
  await fixture({touchMaskedFamily:kind});
  assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'Any family change retires all workspace copies');
  await invoke(path+'/masked-records','POST',familySelection);
 }
 await fixture({touchMaskedTicket:work.id});
 // Source edits retire copies synchronously instead of retaining stale scope or content.
 await fixture({touchMaskedTicket:work.id});
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[]);
 await invoke(path+'/masked-records','POST',selection);
 const retention=await invoke('/work/retention','GET');
 await invoke('/work/retention','PUT',{revision:retention.revision,closedTicketDays:365,attachmentDays:null,confirmDeletions:{tickets:0,attachments:0}});
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'Policy changes retire every existing masked copy');
 await invoke(path+'/masked-records','POST',selection);
 await fixture({runMaskedRetentionAt:Date.now()+370*86400000});
 assert.equal((await invoke(path+'/masked-records','GET')).items.length,1,'Open source tickets have no hidden copy deadline');
 await fixture({maskedTicket:work.id,closedDaysAgo:10});
 await invoke(path+'/masked-records','POST',selection);
 assert.equal((await invoke(path+'/masked-records','GET')).items.length,1,'A recent closed ticket remains available before its source deadline');
 await fixture({runMaskedRetentionAt:Date.now()+356*86400000});
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'Due copies are durably deleted even before the source retention job runs');
 const expiry=(await fixture({})).sandboxAudits.find(row=>row.action==='sandbox.masked_expired');assert.ok(expiry);assert.deepEqual(JSON.parse(expiry.detail_json),{copies:1});
 // The earliest family deadline retires the workspace, including otherwise undated people.
 const currentRetention=await invoke('/work/retention','GET');
 await invoke('/work/retention','PUT',{revision:currentRetention.revision,closedTicketDays:365,attachmentDays:30,confirmDeletions:{tickets:0,attachments:0}});
 await invoke(path+'/masked-records','POST',familySelection);
 await fixture({runMaskedRetentionAt:Date.now()+21*86400000});
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'An attachment deadline retires all four families without extending source custody');
 const familyExpiry=(await fixture({})).sandboxAudits.filter(row=>row.action==='sandbox.masked_expired').at(-1);
 assert.deepEqual(JSON.parse(familyExpiry.detail_json),{copies:4});
 await fixture({maskedTicket:work.id,closedDaysAgo:400});
 await invoke(path+'/masked-records','POST',selection,owner,409);
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'A source already due for deletion cannot be recopied');
 await fixture({maskedTicket:work.id,open:true});
 const final=await invoke(path+'/masked-records','POST',selection);assert.equal(final.items.length,1);
 assert.ok(!JSON.stringify(await invoke(path,'GET')).includes(final.items[0].id),'Masked records never enter the configuration package');
 return {box,path,selection};
}
