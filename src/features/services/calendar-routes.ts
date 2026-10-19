import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { audit, jsonBody } from '../../platform/http';
import { changeCalendar, saveCalendarWindow } from './calendar';
import { calendarIcs, type CalendarEvent } from './calendar-ics';
export function registerCalendarRoutes(app:Hono<AppEnv>) {
  for (const path of ['/change-calendar','/change-calendar.ics']) app.get(path,async c=>{
    const data=await changeCalendar(c.env,c.get('principal'),c.req.query('from'),c.req.query('to'),c.req.query('timezone')||'UTC');
    c.header('Cache-Control','private, no-store');c.header('Vary','Cookie');
    await audit(c,path.endsWith('.ics')?'change-calendar.export':'change-calendar.read','global-calendar');
    if(!path.endsWith('.ics'))return c.json(data);
    const events:CalendarEvent[]=[...data.changes,...data.windows.filter(r=>r.data.active===true)].map(r=>({
      id:r.id,title:r.data.title,start:r.data.window.start,end:r.data.window.end,updatedAt:r.updatedAt,
      description:r.kind==='change'?`Planned change. Recorded state: ${r.data.state}.`:`${r.data.kind==='freeze'?'Freeze / blackout':'Maintenance'} window.`,
      status:r.kind==='change'&&r.data.state==='cancelled'?'CANCELLED':'TENTATIVE',sequence:r.revision,
    }));
    c.header('Content-Type','text/calendar; charset=utf-8');
    c.header('Content-Disposition','attachment; filename="linen-change-calendar.ics"');
    return c.body(calendarIcs(c.get('principal').workspaceId,events));
  });
  app.post('/change-windows',async c=>c.json(await saveCalendarWindow(c.env,c.get('principal'),await jsonBody(c)),201));
  app.post('/change-windows/:id',async c=>c.json(await saveCalendarWindow(c.env,c.get('principal'),await jsonBody(c),c.req.param('id'))));
}
