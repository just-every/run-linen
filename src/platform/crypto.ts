// PBKDF2 credential format adapted from native HappyToHelp identity/credentials.ts,
// source 3b34df590cff61358afc07ab56ea886461ca74fd. Native WebCrypto; no external custody.
import { ApiError } from './http'
const encoder=new TextEncoder()
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')
export const token=()=>crypto.randomUUID()+crypto.randomUUID()
export async function hashToken(value:string){return hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)))}
export async function passwordHash(password:string,salt:string=crypto.randomUUID()) {if(typeof password!=='string'||password.length<12||password.length>1024)throw new ApiError(400,'password_policy','Password must contain 12–1024 characters');const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);return `${salt}:${hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:encoder.encode(salt),iterations:100000},key,256))}`}
export async function verifyPassword(password:string,hash:string) {try{const actual=await passwordHash(password,hash.split(':')[0]);let diff=actual.length^hash.length;for(let i=0;i<actual.length;i++)diff|=actual.charCodeAt(i)^hash.charCodeAt(i);return diff===0}catch{return false}}
function keyBytes(secret:string){try{const bytes=Uint8Array.from(atob(secret),c=>c.charCodeAt(0));if(bytes.length===32)return bytes}catch{}throw new ApiError(503,'encryption_unavailable','Connection encryption is not configured')}
export async function encryptSecret(secret:string,value:string){const key=await crypto.subtle.importKey('raw',keyBytes(secret),'AES-GCM',false,['encrypt']);const iv=crypto.getRandomValues(new Uint8Array(12));const result=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,encoder.encode(value));return btoa(String.fromCharCode(...iv))+'.'+btoa(String.fromCharCode(...new Uint8Array(result)))}
export async function decryptSecret(secret:string,value:string){const [iv,data]=value.split('.');const key=await crypto.subtle.importKey('raw',keyBytes(secret),'AES-GCM',false,['decrypt']);return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:Uint8Array.from(atob(iv),c=>c.charCodeAt(0))},key,Uint8Array.from(atob(data),c=>c.charCodeAt(0))))}
