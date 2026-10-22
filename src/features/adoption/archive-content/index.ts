import { ContentSubjects } from './subjects';
import { projectProfile } from './profiles';
import { projectWork } from './work';
import { projectApplication } from './application';
import { projectService } from './services';
import { projectExecution } from './execution';
import { projectIntelligence } from './intelligence';
import { projectKnowledge } from './knowledge';
import type { ContentContext, IdentityMatcher, Row } from './types';

/** Pure archive projection: reads raw subject relationships without writing the
 * domain database. Call before reference aliasing, and tombstone-scan the entire
 * resulting row afterwards. No table or unknown field is exempt from that scan.
 * Typed audit/service history is projected separately by historyArchiveRow. */
export async function projectArchiveContent(ctx: ContentContext, table: string, row: Row, matches: IdentityMatcher): Promise<Row> {
    const subjects = new ContentSubjects(ctx, matches);
    if (['identities', 'work_people', 'work_pending_people'].includes(table)) return projectProfile(table, row, subjects);
    if (table.startsWith('work_')) {
        row = await projectWork(table, row, subjects);
        row = await projectKnowledge(table, row, subjects);
        row = await projectApplication(table, row, subjects);
        return projectExecution(table, row, subjects);
    }
    if (table.startsWith('execution_')) return projectExecution(table, row, subjects);
    if (table.startsWith('svc_')) return projectApplication(table, await projectService(table, row, subjects), subjects);
    if (table.startsWith('intelligence_')) return projectIntelligence(table, row, subjects);
    return row;
}

export type { ContentContext, IdentityMatcher } from './types';
