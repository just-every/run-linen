import { columns, type Row } from './types';
import type { ContentSubjects } from './subjects';

export async function projectProfile(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    if (table === 'identities' && await subjects.profile(row))
        return columns(row, { name: '[erased]', email: '[erased]' });
    if (table === 'work_people' && await subjects.profile(row))
        return columns(row, { name: '[erased]', attributes_json: '{}', active: 0 });
    if (table === 'work_pending_people' && await subjects.people(row.id, row.email))
        return columns(row, { email: '[erased]', start_date: '', team: '[erased]', state: 'withdrawn' });
    return row;
}
