import type {Context} from 'hono';
import type {AppEnv} from './types';
import {ApiError} from './http';
import {calendarFromRow} from '../features/work/calendar';
import {normalizeAttributes} from '../features/work/catalog-audience';
import {matchingTemplates,parseTemplate,type TemplateRow} from '../features/work/lifecycle-templates';
import {taskDates} from '../features/work/lifecycle-tasks';
import {editSlaConfiguration,type SlaConfiguration} from './sandbox-sla-config';

/** Preview dated local tasks using only the reviewed draft, without admitting work or retaining inputs. */
export async function rehearseLifecycle(c:Context<AppEnv>,draft:SlaConfiguration,body:Record<string,unknown>) {
 if(!['join','move','leave'].includes(String(body.kind)))throw new ApiError(422,'lifecycle_kind','Choose a join, move or leave');
 const instant=(value:unknown)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 const effectiveAt=instant(body.effectiveAt),expiresAt=body.expiresAt==null||body.expiresAt===''?null:instant(body.expiresAt);
 if(!effectiveAt||(body.expiresAt&&!expiresAt))throw new ApiError(422,'lifecycle_date','Choose valid effective and optional end instants');
 const calendar=draft.calendar.find(row=>row.id===body.calendarId);
 if(!calendar)throw new ApiError(422,'lifecycle_calendar','Choose a draft business calendar');
 const values=normalizeAttributes(body.attributes??{});
 const templates=matchingTemplates((draft.lifecycle??[]).map(row=>parseTemplate(row as unknown as TemplateRow)).filter(row=>row.active),String(body.kind),values);
 const tasks=[],skipped=[];
 for(const template of templates) {
  await editSlaConfiguration(c,draft,'lifecycle',template.id,{revision:body.revision});
  for(const task of template.tasks) {
   const anchor=task.anchor==='start'?effectiveAt:expiresAt??(body.kind==='leave'?effectiveAt:null);
   if(!anchor){skipped.push({template:template.name,title:task.title,reason:'No end date was supplied'});continue;}
   tasks.push({template:template.name,templateRevision:template.revision,title:task.title,assignee:task.assignee,...taskDates(calendarFromRow(calendar as never),task,anchor)});
  }
 }
 return {configurationRevision:body.revision,externalEffects:false,productionAuthority:false,tasks,skipped};
}
