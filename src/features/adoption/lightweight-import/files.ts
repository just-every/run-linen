import { Buffer } from 'node:buffer';
import { ApiError } from '../../../platform/http';
import { sha256 } from '../../../modules/import-kit/src/d1/index';
export const requireInput:(ok:unknown,message:string)=>asserts ok=(ok,message)=>{if(!ok)throw new ApiError(422,'csv_import_input',message);};
export function readFile(value:unknown) {
  requireInput(value&&typeof value==='object'&&!Array.isArray(value),'Supply file: {name,base64}');
  const {name,base64}=value as {name:unknown;base64:unknown};
  requireInput(typeof name==='string'&&/^[\w .-]{1,120}$/.test(name),'Simple source filename required');
  requireInput(typeof base64==='string','Exact source bytes required');
  const bytes=Buffer.from(base64,'base64');
  requireInput(bytes.toString('base64')===base64&&bytes.length>0&&bytes.length<=1024*1024,'Canonical base64 containing 1 byte to 1 MiB required');
  let text:string;
  try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'');}catch{throw new ApiError(422,'csv_import_input','UTF-8 source required');}
  return {name,base64,text,hash:sha256(bytes),size:bytes.length};
}
export function timestamp(value:unknown):string {
  requireInput(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value)),'Explicit ISO timestamp with timezone required');
  return new Date(value).toISOString();
}
export function account(value:unknown):string {requireInput(typeof value==='string'&&/^[a-z0-9][a-z0-9-]{0,79}$/.test(value),'Stable non-secret account slug required');return value;}
export function sourceId(value:unknown):string {requireInput(typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value),'Stable source ID of 1–100 ASCII letters, numbers, dots, dashes or underscores required');return value;}
