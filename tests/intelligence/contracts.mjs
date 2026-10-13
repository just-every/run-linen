import './loader.mjs'
import assert from 'node:assert/strict'
const {validateModelValue,objectSchema,textSchema,parseUsage}=await import('../../src/features/intelligence/models.ts')
const {replayProtocol,checkProtocolBound}=await import('../../src/features/intelligence/protocol.ts')
const {applicability}=await import('../../src/features/intelligence/capabilities.ts')
const {compareRedesign}=await import('../../src/features/intelligence/simplification.ts')
const schema=objectSchema({answer:textSchema,evidenceIds:{type:'array',items:textSchema}})
assert.equal(validateModelValue('{"answer":"unknown","evidenceIds":["observed:1"]}',schema,['observed:1']).answer,'unknown')
assert.throws(()=>validateModelValue('{"answer":"ok","evidenceIds":["forged"]}',schema,[]),/unknown model evidence/)
assert.throws(()=>validateModelValue('{"answer":"ok","evidenceIds":[],"grant":"owner"}',schema,[]),/invalid model schema/)
assert.throws(()=>validateModelValue('not JSON',schema,[]),/invalid model schema/)
const config={inputUsdPerMillion:2,cachedInputUsdPerMillion:1,outputUsdPerMillion:3}
assert.equal(parseUsage({input_tokens:10,output_tokens:5,total_tokens:15,input_tokens_details:{cached_tokens:4}},config).cost,0.000031)
for(const usage of [{input_tokens:-1,output_tokens:2,total_tokens:1},{input_tokens:1,output_tokens:2,total_tokens:4},{input_tokens:1,output_tokens:2,total_tokens:3,input_tokens_details:{cached_tokens:2}}])assert.throws(()=>parseUsage(usage,config))
const assumptions={singleAtomicStore:true,monotonicFences:true,independentReadback:true,currentAuthorityAtAdmission:true}
const result=checkProtocolBound(assumptions);assert.equal(result.validTrace.valid,true);assert.equal(result.mutation.valid,false);assert.throws(()=>replayProtocol({...assumptions,independentReadback:false},[]))
for(const actor of ['a','b'])for(const fence of [0,1,2]){const result=replayProtocol(assumptions,[{kind:'claim',actor:'a',fence:1},{kind:'dispatch',actor:'a',fence:1},{kind:'takeover',actor,fence}]);assert.equal(result.valid,false)}
const versions={provider:'actual-v1',model:'m1',context:1,action:1,verifier:1},pkg={versions,conditions:[{specId:'s',state:'failed',cohort:'sales'}],counterexamples:[{conditions:[{specId:'routing',state:'failed',cohort:'sales'}]}],freshnessSeconds:60},facts=[{specId:'s',state:'failed',cohort:['sales'],observedAt:new Date().toISOString()}]
assert.equal(applicability(pkg,versions,facts).matches,true)
assert.equal(applicability(pkg,{...versions,model:'m2'},facts).matches,false)
assert.equal(applicability(pkg,versions,[...facts,{specId:'routing',state:'failed',cohort:['sales'],observedAt:new Date().toISOString()}]).matches,false)
assert.equal(applicability(pkg,versions,[{...facts[0],observedAt:'2000-01-01T00:00:00.000Z'}]).matches,false)
assert.equal(compareRedesign({exposure:100,failures:10,costUsd:20,workMinutes:30,adverseEffects:1},{exposure:200,failures:10,costUsd:30,workMinutes:40,adverseEffects:0}).avoidedCostUsd,null)
assert.throws(()=>compareRedesign({exposure:0,failures:0,costUsd:0,workMinutes:0,adverseEffects:0},{}))
console.log('PASS intelligence contracts: retained Ensemble schema/usage, fabricated evidence/injected properties rejected, bounded protocol replay/interleavings/mutation, false assumptions invalidate conclusions, capability near-match/drift/freshness, no fabricated avoided cost')
