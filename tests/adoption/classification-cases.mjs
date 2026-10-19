import assert from 'node:assert/strict';
export async function classifyArchiveWork(ok,auth) {
  const work=(await ok('/fixtures/records','GET',undefined,auth)).work[0];
  const state=await ok(`/work/${work.id}/classification`,'GET',undefined,auth);
  await ok(`/work/${work.id}/classification/override`,'POST',{revision:state.revision,workRevision:state.workRevision,type:'question',category:'general',subcategory:'guidance',impact:'low',urgency:'low',reason:'Agent reviewed the request before archival'},auth);
}
export async function checkArchiveClassification(ok,auth) {
  const work=(await ok('/fixtures/records','GET',undefined,auth)).work[0];
  const state=await ok(`/work/${work.id}/classification`,'GET',undefined,auth);
  assert.equal(state.current.type,'question','DESK-002 classification survives held restore');
  assert.equal(state.current.category,'general');assert.equal(state.current.subcategory,'guidance');
  assert.equal(state.reason,'Agent reviewed the request before archival');
  console.log('PASS DESK-002 native classification content survives held restore');
}
