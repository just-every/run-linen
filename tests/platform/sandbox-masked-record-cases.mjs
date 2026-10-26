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
 await fixture({maskedTicket:work.id,closedDaysAgo:400});
 await invoke(path+'/masked-records','POST',selection,owner,409);
 assert.deepEqual((await invoke(path+'/masked-records','GET')).items,[],'A source already due for deletion cannot be recopied');
 await fixture({maskedTicket:work.id,open:true});
 const final=await invoke(path+'/masked-records','POST',selection);assert.equal(final.items.length,1);
 assert.ok(!JSON.stringify(await invoke(path,'GET')).includes(final.items[0].id),'Masked records never enter the configuration package');
 return {box,path,selection};
}
