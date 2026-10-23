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
