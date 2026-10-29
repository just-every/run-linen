import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {autonomousPolicy,policyEnvelope} from '../../src/modules/agent-door/conformance/crypto.mjs'

export const ticketTools=['linen.tickets.create','linen.tickets.read','linen.tickets.reply','linen.tickets.search']

// The old selected subverbs remain credential grants; calls use the native door's
// published four-tool vocabulary. This is a test client, not an application shim.
export function ticketCall(name,args={}) {
 const reads={'work.list':'list','work.get':'get','work.history':'history'}
 if(reads[name])return {name:'linen.tickets.read',arguments:{action:reads[name],...args}}
 const names={'work.search':'linen.tickets.search','work.create':'linen.tickets.create','work.comment':'linen.tickets.reply'}
 return {name:names[name]??name,arguments:{...args,...(['work.create','work.comment'].includes(name)?{idempotency_key:args.deduplicationKey}: {})}}
}

export async function agentPolicyFixture(origin) {
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify'])
 const signer={privateKey:pair.privateKey,kid:'synthetic-platform-agent-policy',issuer:'https://business.example.test',installationId:'synthetic-linen-agent-installation'}
 const trust=JSON.stringify({v:1,issuer:signer.issuer,audience:origin,subject:signer.installationId,email:'owner@example.test',keys:{[signer.kid]:await webcrypto.subtle.exportKey('jwk',pair.publicKey)}})
 return {trust,async adopt(request) {
  const envelope=await policyEnvelope({signer,origin,business:'synthetic-linen-business',revision:0,seq:0},autonomousPolicy())
  const response=await request('/api/rer/agent-policy',{method:'POST',body:{policy:envelope.policy}})
  const result=await response.json()
  assert.equal(response.status,200,JSON.stringify(result))
  assert.deepEqual(result.adopted,{seq:1,revision:1},'The production receiver adopts the test-signed company policy')
 }}
}

export function agentRpc(request) {
 let id=0
 return async(bearer,method='tools/list',params={},extra={})=>{
  const version='2026-07-28'
  const response=await request('/api/mcp',{method:'POST',body:{jsonrpc:'2.0',id:++id,method,params:{...params,...(method==='initialize'?{protocolVersion:version}:{}),_meta:{'io.modelcontextprotocol/protocolVersion':version}}},headers:{'MCP-Protocol-Version':version,'Mcp-Method':method,...(['tools/call','prompts/get','resources/read'].includes(method)?{'Mcp-Name':params.name??params.uri}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{}),...extra}})
  return {status:response.status,value:await response.json()}
 }
}
