import { array, contentJson, json, object, type ContentPath, type Row } from './types';
import type { ContentSubjects } from './subjects';

/** Application metadata keeps prices, entitlement targets and versioned IDs.
 * Exact personal values in its declared display fields are removed. Unknown
 * provider metadata is left to the caller's complete tombstone scan. */
export async function projectApplication(table: string, row: Row, subjects: ContentSubjects): Promise<Row> {
    const column = table === 'work_fulfilments' ? 'application_json' : table === 'svc_records' && row.kind === 'application' ? 'data_json' : null;
    if (!column || row[column] == null) return row;
    const data = object(json(row[column]));
    if (!data) return row;
    const paths: ContentPath[] = [];
    for (const field of table === 'work_fulfilments' ? ['applicationName', 'entitlementName'] : ['name'])
        if (typeof data[field] === 'string' && await subjects.matches(data[field] as string)) paths.push([field]);
    if (table === 'svc_records') {
        const entitlements = array(data.entitlements);
        // Retain each entitlement's ID and target; only matched labels are content.
        const next = await Promise.all(entitlements.map(async value => {
            const entitlement = object(value);
            if (typeof entitlement?.name !== 'string' || !await subjects.matches(entitlement.name)) return value;
            return { ...entitlement, name: '[erased]' };
        }));
        if (JSON.stringify(next) !== JSON.stringify(entitlements)) row = { ...row, [column]: JSON.stringify({ ...data, entitlements: next }) };
    }
    return contentJson(row, column, paths);
}
