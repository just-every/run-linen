import type { Hono } from 'hono';
import type { AppEnv } from '../../../platform/types';
import { registerSavedTicketImportRoutes } from '../saved-ticket-import';
import { mapping } from '../freshservice-import/mapping';
import { registerSnipeitImportRoutes } from '../snipeit-import';
import { registerPeopleCsvImportRoutes } from './people';
import { parseTicketCsv } from './tickets';
import { parseZendesk,type ZendeskInput } from './zendesk';
export function registerLightweightImportRoutes(parent:Hono<AppEnv>) {
  registerSavedTicketImportRoutes(parent,{base:'/adoption/csv-imports/tickets',namespacePrefix:'csv',mappingVersion:'linen-csv-tickets-v1',parse:parseTicketCsv,
    map:(parsed,destination,namespace)=>mapping(parsed,destination,namespace,'csv','linen-csv-tickets-v1')});
  registerSavedTicketImportRoutes(parent,{base:'/adoption/zendesk-imports',namespacePrefix:'zendesk',mappingVersion:'linen-zendesk-files-v1',
    parse:(input,destination)=>parseZendesk(input as unknown as ZendeskInput,destination),
    map:(parsed,destination,namespace)=>{
      // Zendesk's problem/question/task/null types stay labeled in source history;
      // they are inert request tickets, never native problems or executable tasks.
      for(const ticket of parsed.tickets.values())ticket.kind=ticket.kind==='incident'?'Incident':'Service Request';
      return mapping(parsed,destination,namespace,'zendesk','linen-zendesk-files-v1');
    }});
  registerPeopleCsvImportRoutes(parent);
  registerSnipeitImportRoutes(parent,'csv');
}
