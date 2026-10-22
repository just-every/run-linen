import type { Hono } from 'hono';
import type { AppEnv } from '../../../platform/types';
import { registerSavedTicketImportRoutes } from '../saved-ticket-import';
import { parseExport } from './format';
import { mapping, MAPPING_VERSION } from './mapping';
export { freshserviceErasurePort } from './privacy';
export function registerFreshserviceImportRoutes(parent:Hono<AppEnv>) {
  registerSavedTicketImportRoutes(parent,{base:'/adoption/freshservice-imports',namespacePrefix:'freshservice',mappingVersion:MAPPING_VERSION,parse:parseExport,map:mapping});
}
