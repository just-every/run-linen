import { privacyPeople, type PrivacyPerson } from '../work/person-privacy';
import type { AdoptionContext } from './core';
/** Only current-workspace aliases; never resolve an identity through a global directory. */
export async function erasureIdentities(ctx: AdoptionContext, identity: string) { const identities = new Set([identity]), platformIds = new Set<string>(), people = new Map<string, PrivacyPerson>(), visited = new Set<string>(); while ([...identities].some(x => !visited.has(x))) {
    for (const value of [...identities]) {
        if (visited.has(value))
            continue;
        visited.add(value);
        const mappings = (await ctx.env.DB.prepare('SELECT source_key,target_id FROM adoption_identity_map WHERE workspace_id=? AND (source_key=? OR target_id=?)').bind(ctx.principal.workspaceId, value, value).all<{
            source_key: string;
            target_id: string;
        }>()).results;
        for (const m of mappings) {
            identities.add(m.source_key);
            identities.add(m.target_id);
        }
        const archived=(await ctx.env.DB.prepare("SELECT h.row_json FROM adoption_history h WHERE h.workspace_id=? AND h.table_name='identities' AND (h.source_key=? OR json_extract(h.row_json,'$.id')=? OR EXISTS(SELECT 1 FROM adoption_identity_map m WHERE m.workspace_id=h.workspace_id AND m.source_id=h.source_id AND m.source_key=h.source_key AND m.target_id=?))").bind(ctx.principal.workspaceId,value,value,value).all<{row_json:string}>()).results;for(const row of archived){const profile=JSON.parse(row.row_json);if(typeof profile.email==='string'){identities.add(profile.email);identities.add(profile.email.trim().toLowerCase())}}
        const users = (await ctx.env.DB.prepare('SELECT u.id,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND (u.id=? OR lower(u.email)=lower(?))').bind(ctx.principal.workspaceId, value, value).all<{
            id: string;
            email: string;
        }>()).results;
        for (const u of users) {
            identities.add(u.id);
            identities.add(u.email);identities.add(u.email.trim().toLowerCase());
            platformIds.add(u.id);
        }
        for (const person of await privacyPeople(ctx, value)) {
            if (!people.has(person.id)) people.set(person.id, person);
            identities.add(person.id);
            identities.add(`${person.source}:${person.source_id}`);
            if (person.member_id && person.binding_id) identities.add(person.member_id);
        }
    }
} return { identities: [...identities], platformIds: [...platformIds], people: [...people.values()] }; }
