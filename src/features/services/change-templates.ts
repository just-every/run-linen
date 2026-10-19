import type { Hono } from 'hono';
import type { AppEnv, Principal } from '../../platform/types';
import { ApiError, id, jsonBody, now, requiredString } from '../../platform/http';
import { currentPrincipal } from '../work/identity';
import { create, getService, list, mutate, strings, type ServiceRecord } from './store';

const planFields = ['implementationPlan', 'testPlan', 'backoutPlan'] as const;
/** Only approved content participates; operational fields and scheduling are separate. */
export function catalogSnapshot(data: Record<string, any>) {
    return Object.fromEntries(['title','risk','impact','services','cohorts','canaryCohorts','dependencies',
        'implementation','compensation',...planFields].map(name=>[name,data[name]]));
}
function retainedApprovals(data: Record<string,any>) {
    return [...(data.priorApprovals||[]),...(data.approval?[data.approval]:[])];
}
export async function templateContent(db: D1Database, p: Principal, b: Record<string, any>) {
    const services = strings(b.services, 'services');
    for (const service of services) await getService(db, p, service, 'service');
    const cohorts = strings(b.cohorts, 'cohorts'), canaryCohorts = strings(b.canaryCohorts, 'canaryCohorts');
    if (canaryCohorts.some(c => !cohorts.includes(c))) throw new ApiError(400, 'cohort', 'Canary must be within affected cohorts');
    for (const name of ['implementation','compensation']) {
        const value=b[name];
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError(400,'implementation','Exact implementation and compensation required');
    }
    const dependencies = b.dependencies === undefined || (Array.isArray(b.dependencies)&&!b.dependencies.length) ? [] : strings(b.dependencies,'dependencies');
    for (const dependency of dependencies) await getService(db,p,dependency,'change');
    return { title: requiredString(b.title,'title'), risk: requiredString(b.risk,'risk'), impact: requiredString(b.impact,'impact'),
        services, cohorts, canaryCohorts, dependencies, implementation:b.implementation, compensation:b.compensation,
        ...Object.fromEntries(planFields.map(name=>[name,requiredString(b[name],name)])) };
}
export async function approvedTemplate(db: D1Database, p: Principal, templateId: string, version: number) {
    const template = await getService(db,p,templateId,'change-template'), d=template.data;
    if (!d.active || d.version!==version || d.approval?.version!==version)
        throw new ApiError(409,'template_approval','An active, owner-preapproved current template version is required');
    return template;
}
/** Rechecked by the execution origin at each effect, independently of action grants. */
export async function assertCatalogApproval(db: D1Database,p: Principal,r: ServiceRecord) {
    const bypass=r.data.cabBypass;
    if (!bypass || bypass.implementationRevision!==r.data.implementationRevision) throw new ApiError(409,'template_approval','Current implementation requires a change decision');
    const template=await getService(db,p,bypass.templateId,'change-template');
    const approval=retainedApprovals(template.data).find(a=>a.id===bypass.approvalId&&!a.inert);
    if (!approval || approval.version!==bypass.version || !bypass.snapshot ||
        JSON.stringify(approval.snapshot)!==JSON.stringify(bypass.snapshot) ||
        JSON.stringify(catalogSnapshot(r.data))!==JSON.stringify(bypass.snapshot) ||
        (template.data.withdrawals||[]).some((w:any)=>w.approvalId===bypass.approvalId))
        throw new ApiError(409,'template_approval','The recorded template approval was withdrawn or the approved implementation changed');
}
export function grantReferences(value: unknown) {
    if (!Array.isArray(value) || !value.length || value.some(x=>!x || typeof x.id!=='string' || !x.id || !Number.isInteger(x.version) || x.version<1))
        throw new ApiError(400,'grants','Versioned grant references required');
    return value.map(x=>({id:x.id,version:x.version,...(x.phase?{phase:x.phase}:{})}));
}
export async function bindChangeGrants(db: D1Database,p: Principal,r: ServiceRecord,b: Record<string,any>) {
    p=await currentPrincipal(db,p);
    if (!p.roles.some(role=>['owner','operator'].includes(role))) throw new ApiError(403,'authority','Current operator required');
    if (r.data.changeType!=='standard') throw new ApiError(409,'change_type','Catalog grant binding is for standard changes');
    await assertCatalogApproval(db,p,r);
    const binding={id:id(),actor:p.userId,kind:'grant-binding',implementationRevision:r.data.implementationRevision,
        grantReferences:grantReferences(b.grantReferences),at:now()};
    return mutate(db,p,r,b.revision,{...r.data,state:'authorized',authorizations:[...(r.data.authorizations||[]),binding]},'change-grants-bound');
}
export function registerTemplateRoutes(app:Hono<AppEnv>) {
    const owner=async(db:D1Database,p:Principal)=>{p=await currentPrincipal(db,p);if(!p.roles.includes('owner'))throw new ApiError(403,'owner','Current owner required');return p;};
    app.get('/change-templates',async c=>{const p=await currentPrincipal(c.env.DB,c.get('principal'));return c.json({items:await list(c.env.DB,p,'change-template')});});
    app.get('/change-templates/:id',async c=>c.json(await getService(c.env.DB,await currentPrincipal(c.env.DB,c.get('principal')),c.req.param('id'),'change-template')));
    app.post('/change-templates',async c=>{
        const p=await owner(c.env.DB,c.get('principal')),b=await jsonBody(c);
        return c.json(await create(c.env.DB,p,'change-template',{...await templateContent(c.env.DB,p,b),active:b.active===true,version:1,approval:null,priorApprovals:[],withdrawals:[]},{visibility:b.visibility as string||'operators',participants:b.participants as string[]}),201);
    });
    app.patch('/change-templates/:id',async c=>{
        const p=await owner(c.env.DB,c.get('principal')),b=await jsonBody(c),r=await getService(c.env.DB,p,c.req.param('id'),'change-template');
        return c.json(await mutate(c.env.DB,p,r,b.revision,{...await templateContent(c.env.DB,p,{...r.data,...b}),active:b.active===true,version:r.data.version+1,approval:null,priorApprovals:retainedApprovals(r.data),withdrawals:r.data.withdrawals||[]},'template-amended'));
    });
    app.post('/change-templates/:id/approve',async c=>{
        const p=await owner(c.env.DB,c.get('principal')),b=await jsonBody(c),r=await getService(c.env.DB,p,c.req.param('id'),'change-template');
        if(b.version!==r.data.version)throw new ApiError(409,'template_version','Review the current exact template version');
        return c.json(await mutate(c.env.DB,p,r,b.revision,{...r.data,priorApprovals:retainedApprovals(r.data),approval:{id:id(),version:r.data.version,actor:p.userId,reason:requiredString(b.reason,'reason'),at:now(),snapshot:catalogSnapshot(r.data)}},'template-preapproved'));
    });
    app.post('/change-templates/:id/withdraw',async c=>{
        const p=await owner(c.env.DB,c.get('principal')),b=await jsonBody(c),r=await getService(c.env.DB,p,c.req.param('id'),'change-template');
        const approvalId=requiredString(b.approvalId,'approvalId');
        if (!retainedApprovals(r.data).some(a=>a.id===approvalId&&!a.inert)) throw new ApiError(404,'template_approval','Recorded approval not found');
        if ((r.data.withdrawals||[]).some((w:any)=>w.approvalId===approvalId)) throw new ApiError(409,'approval_withdrawn','This approval is already withdrawn');
        const withdrawal={approvalId,actor:p.userId,reason:requiredString(b.reason,'reason'),at:now()};
        const current=r.data.approval?.id===approvalId;
        return c.json(await mutate(c.env.DB,p,r,b.revision,{...r.data,
            ...(current?{approval:null,priorApprovals:retainedApprovals(r.data)}:{}),
            withdrawals:[...(r.data.withdrawals||[]),withdrawal]},'template-approval-withdrawn'));
    });
}
