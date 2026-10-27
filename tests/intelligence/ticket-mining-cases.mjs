import assert from 'node:assert/strict';
export async function ticketMiningChecks({ok,request,owner,employeeAuth,otherOwnerAuth,db,count=14}) {
 const base='/adoption/freshservice-imports', mining='/intelligence/ticket-mining';
 const jobs=[], inputs=[], recentSince='2026-09-15T00:00:00.000Z';
 const labels=['Reset forgotten password','Install approved software','Replace broken laptop'];
 const start='2026-09-01T00:00:00.000Z',end='2026-10-01T00:00:00.000Z';
 for(let offset=0;offset<count;offset+=100){
  const size=Math.min(100,count-offset);
  const csv=['Ticket Id,Subject,Description,Status,Requester Email,Created Time,Last Updated Time,Type'];
  for(let j=0;j<size;j++){const n=offset+j;csv.push(`${n+1},${labels[n%3]}${n%2?' today':''},synthetic-linen-${n+1},Closed,synthetic-linen-${n+1}@example.test,${n%2?end:start},${end},Service Request`);}
  const input={account:'synthetic-linen-mining',files:[{name:`tickets-${offset}.csv`,format:'tickets-csv',base64:Buffer.from(csv.join('\n')).toString('base64')}]};
  const review=await ok(base+'/dry-run','POST',{input},owner);
  const job=await ok(base,'POST',{input,reviewedFingerprint:review.fingerprint,operationKey:'synthetic-linen-mining-'+offset,acceptOmissions:true},owner,201);
  if(offset===0){assert.equal((await request(mining,'POST',{importIds:[job.id],recentSince},owner)).status,409,'Queued source was mined');}
  for(let tick=0;tick<=size;tick++){const state=await ok(`${base}/${job.id}/resume`,'POST',{},owner);if(state.state==='completed')break;assert.ok(tick<size,'Import did not complete');}
  jobs.push(job.id);inputs.push(input);
 }
 const counts=async()=>Promise.all(['execution_grants','execution_plans','execution_outbox','work_catalog','work_knowledge'].map(async table=>[table,(await db.prepare(`SELECT count(*) n FROM ${table}`).first()).n]));
 const before=await counts();
 assert.equal((await request(mining,'POST',{importIds:jobs,recentSince},employeeAuth)).status,403);
 assert.equal((await request(mining,'POST',{importIds:[jobs[0],jobs[0]],recentSince},owner)).status,400);
 assert.equal((await request(mining,'POST',{importIds:jobs,recentSince,tickets:[{title:'Injected suggestion'}]},owner)).status,400);
 if(otherOwnerAuth)assert.equal((await request(mining,'POST',{importIds:jobs,recentSince},otherOwnerAuth)).status,404);
 const response=await request(mining,'POST',{importIds:jobs,recentSince},owner,{'X-Test-Read-Only':'1'});
 assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('cache-control'),'private, no-store');
 const result=await response.json();
 assert.equal(result.state,'proposed');assert.equal(result.corpus.tickets,count);assert.equal(result.corpus.imports,jobs.length);
 assert.equal(result.corpus.earliest,start);assert.equal(result.corpus.latest,end);assert.equal(result.corpus.historicTickets,Math.ceil(count/2));assert.equal(result.corpus.recentTickets,Math.floor(count/2));assert.equal(result.unclusteredTickets,0);
 assert.deepEqual(result.proposals.map(p=>p.label).sort(),['approved install software','broken laptop replace','forgotten password reset']);
 const expected=new Map(labels.map((_,i)=>[i,Array.from({length:count},(_,n)=>n).filter(n=>n%3===i).map(n=>String(n+1)).sort()]));
 for(const p of result.proposals){
  const i=p.label==='forgotten password reset'?0:p.label==='approved install software'?1:2;
  assert.deepEqual(p.sources.map(s=>s.ticketId).sort(),expected.get(i));assert.equal(p.matchedTickets,expected.get(i).length);
  assert.equal(p.historicTickets,expected.get(i).filter(id=>(Number(id)-1)%2===0).length);assert.equal(p.recentTickets,expected.get(i).filter(id=>(Number(id)-1)%2===1).length);
  assert.equal(p.expectedWorkSaved.upperBound,expected.get(i).length);assert.equal(p.expectedWorkSaved.minutes,null);
  assert.equal(p.drafts.catalogItem.state,'draft');assert.equal(p.drafts.workflow.executable,false);
  assert.equal(p.drafts.standingGrant.issued,false);assert.equal(p.drafts.standingGrant.action,null);assert.equal(p.drafts.article.state,'draft');
  assert.equal(p.publication.published,false);assert.equal(p.effect.state,'not_observed');assert.equal(p.effect.measuredSavings,null);
  for(const source of p.sources){assert.ok(jobs.includes(source.importId));assert.match(source.artifactHash,/^[a-f0-9]{64}$/);assert.ok(source.location);}
 }
 assert.deepEqual((await ok(mining,'POST',{importIds:[...jobs].reverse(),recentSince},owner)).proposals,result.proposals);
 assert.deepEqual(await counts(),before,'Mining issued authority or published content');
 // A corrupted retained original must refuse even when native work still exists.
 const original=await db.prepare('SELECT * FROM ik_originals WHERE job_id=? LIMIT 1').bind(jobs[0]).first();
 await db.prepare('UPDATE ik_originals SET sha256=? WHERE job_id=? AND original_key=?').bind('0'.repeat(64),jobs[0],original.original_key).run();
 assert.equal((await request(mining,'POST',{importIds:jobs,recentSince},owner)).status,409);
 await db.prepare('UPDATE ik_originals SET sha256=? WHERE job_id=? AND original_key=?').bind(original.sha256,jobs[0],original.original_key).run();
 // Same reviewed source under another job must not inflate the corpus.
 const again=await ok(base+'/dry-run','POST',{input:inputs[0]},owner);
 const duplicate=await ok(base,'POST',{input:inputs[0],reviewedFingerprint:again.fingerprint,operationKey:'synthetic-linen-duplicate',acceptOmissions:true},owner,201);
 for(let tick=0;tick<=100;tick++){if((await ok(`${base}/${duplicate.id}/resume`,'POST',{},owner)).state==='completed')break;assert.ok(tick<100);}
 assert.equal((await request(mining,'POST',{importIds:[jobs[0],duplicate.id],recentSince},owner)).status,409);
 // A withdrawn source cannot be revived through a cached derivative analysis.
 let undone;for(let tick=0;tick<=100;tick++){undone=await ok(`${base}/${jobs[0]}/undo`,'POST',{},owner);if(undone.state==='undone')break;assert.ok(tick<100);}
 assert.equal(undone.state,'undone');assert.equal((await request(mining,'POST',{importIds:jobs,recentSince},owner)).status,409);
 const sparse={account:'synthetic-linen-sparse',files:[{name:'sparse.csv',format:'tickets-csv',base64:Buffer.from('Ticket Id,Subject,Description,Status,Requester Email,Created Time,Last Updated Time,Type\n1,Restore password,synthetic-linen-1,Closed,synthetic-linen-1@example.test,'+start+','+end+',Service Request\n2,Replace keyboard,synthetic-linen-2,Closed,synthetic-linen-2@example.test,'+start+','+end+',Service Request').toString('base64')}]};
 const sparseReview=await ok(base+'/dry-run','POST',{input:sparse},owner);
 const sparseJob=await ok(base,'POST',{input:sparse,reviewedFingerprint:sparseReview.fingerprint,operationKey:'synthetic-linen-sparse',acceptOmissions:true},owner,201);
 for(let tick=0;tick<3;tick++)if((await ok(`${base}/${sparseJob.id}/resume`,'POST',{},owner)).state==='completed')break;
 const insufficient=await ok(mining,'POST',{importIds:[sparseJob.id],recentSince},owner);assert.equal(insufficient.state,'insufficient_patterns');assert.deepEqual(insufficient.proposals,[]);assert.equal(insufficient.unclusteredTickets,2);
 console.log(`PASS ticketMiningChecks: ${count} source-custodied Freshservice tickets, exact three clusters and source membership, inert four-family drafts, estimates without measured savings, denied employee, duplicate and withdrawn sources`);
 return {count,imports:jobs.length,proposals:result.proposals.map(p=>({label:p.label,tickets:p.matchedTickets})),fingerprint:result.corpus.fingerprint};
}
