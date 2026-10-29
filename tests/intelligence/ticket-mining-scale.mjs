import assert from 'node:assert/strict';
import {importHarness} from '../adoption/freshservice-import-harness.mjs';
import {ticketMiningChecks} from './ticket-mining-cases.mjs';
const h=await importHarness(),origin='http://localhost';
async function request(path,method='GET',body,auth={},extra={}){return h.fetch(origin+'/api/v1'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...auth,...extra},body:body===undefined?undefined:JSON.stringify(body)});}
async function ok(path,method,body,auth,status=200){const r=await request(path,method,body,auth);assert.equal(r.status,status,`${path}: ${await r.clone().text()}`);return r.json();}
try {
 await h.start();
 const response=await request('/setup','POST',{email:'owner@example.test',name:'Owner',password:'synthetic-linen-owner-password',workspaceName:'Synthetic scale'});assert.equal(response.status,201,await response.clone().text());
 const owner={Cookie:response.headers.get('set-cookie').split(';')[0]};owner['X-Linen-CSRF']=(await ok('/session','GET',undefined,owner)).csrfToken;
 await ok('/members','POST',{email:'synthetic-linen-employee@example.test',name:'Employee',roles:['employee'],password:'synthetic-linen-employee-password'},owner,201);
 const login=await request('/login','POST',{email:'synthetic-linen-employee@example.test',password:'synthetic-linen-employee-password'});
 const employeeAuth={Cookie:login.headers.get('set-cookie').split(';')[0]};employeeAuth['X-Linen-CSRF']=(await ok('/session','GET',undefined,employeeAuth)).csrfToken;
 const result=await ticketMiningChecks({ok,request,owner,employeeAuth,db:await h.db(),count:1000});
 console.log(JSON.stringify({journey:'ticket-mining-scale',...result,liveProvider:false,measuredEffect:false}));
} finally {await h.close();}
