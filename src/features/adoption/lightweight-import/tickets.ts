import { readCsv } from '../csv';
import { canonicalJson,sha256 } from '../../../modules/import-kit/src/d1/index';
import type { ImportInput,ParsedExport,Ticket } from '../freshservice-import/format';
import { readFile,account,sourceId,timestamp,requireInput } from './files';
/** A documented neutral CSV schema, independent of any provider's column names. */
export function parseTicketCsv(input:ImportInput,destination:string):ParsedExport {
  requireInput(input&&input.identities===undefined,'CSV tickets remain historical owner-only records; identity mapping is not accepted');
  const slug=account(input.account);
  requireInput(Array.isArray(input.files)&&input.files.length===1&&input.files[0].format==='tickets-csv','Supply exactly one tickets-csv file');
  const file=readFile(input.files[0]);
  const records=readCsv(file.text,['id','subject','description','type','status','requester','created_at','updated_at'],requireInput);
  requireInput(records.length>0&&records.length<=100,'Supply 1–100 tickets per reviewed job');
  const namespace=`csv:${destination}:${slug}`,tickets=new Map<string,Ticket>();
  const source:ParsedExport['source']={records:[],artifacts:[{name:file.name,sha256:file.hash,size:file.size,original:{status:'available',base64:file.base64}}],diagnostics:[]};
  records.forEach((raw,index)=>{
    const id=sourceId(raw.id);requireInput(!tickets.has(id),'Duplicate source ticket ID');
    requireInput(raw.subject.length>0&&raw.subject.length<=1000&&raw.description.length<=100000,'Subject or description outside supported bounds');
    requireInput(['incident','request'].includes(raw.type),'type must be incident or request');
    requireInput(raw.requester.length>0&&raw.requester.length<=320&&raw.status.length>0&&raw.status.length<=100,'Original requester and status required');
    const ticket:Ticket={id,title:raw.subject,description:raw.description,kind:raw.type==='incident'?'Incident':'Service Request',status:raw.status,requester:raw.requester,created:timestamp(raw.created_at),updated:timestamp(raw.updated_at),raw,conversations:[]};
    requireInput(ticket.updated>=ticket.created,'Updated time precedes created time');tickets.set(id,ticket);
    const payload={ticket:raw,conversations:[],requester:raw.requester,sourceIdentities:[raw.requester],sourceArtifacts:[file.hash]};
    source.records.push({namespace,kind:'ticket',sourceId:id,payload,payloadHash:sha256(canonicalJson(payload)),artifactHash:file.hash,location:{artifact:file.name,row:index+2}});
  });
  return {source,tickets,identities:{}};
}
