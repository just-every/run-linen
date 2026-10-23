export type ReportSource = 'tickets' | 'assets' | 'changes' | 'lifecycle';
export type ReportCell = string | number | null;
export interface ReportDefinition {
  source: ReportSource;
  columns: string[];
  filters?: Record<string, ReportCell>;
  groupBy?: string;
}
export interface ReportResult {
  source: ReportSource;
  columns: string[];
  rows: Record<string, ReportCell>[];
  total: number;
  scope: string;
  definition: ReportDefinition;
}
export interface SavedReport {
  id: string;
  name: string;
  ownerId: string;
  definition: ReportDefinition;
  sharedWith: string[];
}
export interface ReportMember { id: string; name: string; }
export interface ReportSchema { sources: Record<ReportSource, string[]>; gaps: unknown; }

export function reportColumnName(field:string) {
 const names:Record<string,string>={id:'Record ID',kind:'Type',departmentId:'Department',assigneeId:'Assigned agent',personId:'Person',workId:'Ticket ID',serviceId:'Service',ownerId:'Owner'};
 return names[field]??field.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase());
}
