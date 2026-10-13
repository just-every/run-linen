import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { jsonBody, now } from '../../platform/http';
import { assert, audit, current, num } from './access';
import { getCommitment, listCommitments, saveCommitment, coverage, observeCommitment } from './commitments';
import { ingestEvent } from './events';
import { proposeIntake, validateModel, compareModelRoutes } from './models';
import { startResearch, getResearch, advanceResearch, verifyResearch } from './research';
import { createEngineeringGrant, assignEngineeringJob } from './engineering';
import { recordProtocol } from './protocol';
import { publishCapability, applyCapability } from './capabilities';
import { proposeSimplification, executeSimplification, measureSimplification } from './simplification';
import { processWorkIntake } from './intake';
export * from './types';
export * from './commitments';
export * from './events';
export * from './research';
export * from './models';
export * from './engineering';
export * from './scheduler';
export * from './intake';
export * from './restore';
export function registerIntelligenceRoutes(app: Hono<AppEnv>) {
    const ctx = (c: any) => ({ env: c.env, principal: c.get('principal') });
    app.get('/commitments', async (c) => c.json(await listCommitments(ctx(c))));
    app.post('/commitments', async (c) => c.json(await saveCommitment(ctx(c), await jsonBody(c)), 201));
    app.get('/commitments/:id', async (c) => c.json(await getCommitment(ctx(c), c.req.param('id'))));
    app.patch('/commitments/:id', async (c) => c.json(await saveCommitment(ctx(c), await jsonBody(c), c.req.param('id'))));
    app.get('/commitments/:id/coverage', async (c) => c.json(await coverage(ctx(c), c.req.param('id'))));
    app.post('/commitments/:id/observe', async (c) => c.json(await observeCommitment(ctx(c), c.req.param('id'))));
    app.post('/intelligence/events', async (c) => c.json(await ingestEvent(ctx(c), await jsonBody(c)), 201));
    app.post('/intelligence/compare', async (c) => c.json(await compareModelRoutes(ctx(c), await jsonBody(c))));
    app.post('/intelligence/intake', async (c) => c.json(await proposeIntake(ctx(c), await jsonBody(c))));
    app.post('/work/:id/interpret', async (c) => c.json(await processWorkIntake(ctx(c), c.req.param('id'))));
    app.post('/intelligence/models/validate', async (c) => {
        const b = await jsonBody(c);
        return c.json(await validateModel(ctx(c), String(b.connectionId || '')));
    });
    app.get('/intelligence/budget', async (c) => {
        const x = await current(ctx(c), ['owner', 'operator', 'auditor']);
        return c.json(await c.env.DB.prepare('SELECT * FROM intelligence_budgets WHERE workspace_id=?').bind(x.principal.workspaceId).first());
    });
    app.put('/intelligence/budget', async (c) => {
        const x = await current(ctx(c), ['owner']), b = await jsonBody(c);
        await c.env.DB.prepare('INSERT INTO intelligence_budgets(workspace_id,limit_usd) VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET limit_usd=excluded.limit_usd,revision=revision+1').bind(x.principal.workspaceId, num(b.limitUsd, 0, 100000)).run();
        await audit(x, 'intelligence.budget.changed', x.principal.workspaceId);
        return c.json({ updated: true });
    });
    app.post('/research', async (c) => c.json(await startResearch(ctx(c), await jsonBody(c)), 201));
    app.get('/research/:id', async (c) => c.json(await getResearch(ctx(c), c.req.param('id'))));
    app.post('/research/:id/advance', async (c) => c.json(await advanceResearch(ctx(c), c.req.param('id'))));
    app.post('/research/:id/verify', async (c) => {
        const b = await jsonBody(c);
        return c.json(await verifyResearch(ctx(c), c.req.param('id'), String(b.operationId || '')));
    });
    app.post('/engineering/grants', async (c) => c.json(await createEngineeringGrant(ctx(c), await jsonBody(c)), 201));
    app.get('/engineering/grants', async (c) => {
        const x = await current(ctx(c), ['owner']);
        return c.json((await c.env.DB.prepare('SELECT id,version,config_json,expires_at,revoked_at FROM intelligence_engineering_grants WHERE workspace_id=?').bind(x.principal.workspaceId).all()).results);
    });
    app.post('/engineering/grants/:id/revoke', async (c) => {
        const x = await current(ctx(c), ['owner']);
        await c.env.DB.prepare('UPDATE intelligence_engineering_grants SET revoked_at=? WHERE workspace_id=? AND id=?').bind(now(), x.principal.workspaceId, c.req.param('id')).run();
        return c.json({ revoked: true, runningEffects: 'reconciliation_required' });
    });
    app.post('/engineering/jobs', async (c) => c.json(await assignEngineeringJob(ctx(c), await jsonBody(c)), 201));
    app.post('/intelligence/protocol/check', async (c) => c.json(await recordProtocol(ctx(c), await jsonBody(c))));
    app.post('/capabilities', async (c) => c.json(await publishCapability(ctx(c), await jsonBody(c)), 201));
    app.post('/capabilities/:id/apply', async (c) => c.json(await applyCapability(ctx(c), c.req.param('id'), await jsonBody(c))));
    app.post('/simplifications', async (c) => c.json(await proposeSimplification(ctx(c), await jsonBody(c)), 201));
    app.post('/simplifications/:id/execute', async (c) => c.json(await executeSimplification(ctx(c), c.req.param('id'), await jsonBody(c))));
    app.post('/simplifications/:id/measure', async (c) => c.json(await measureSimplification(ctx(c), c.req.param('id'), await jsonBody(c))));
    for (const [path, table] of [['research', 'intelligence_research'], ['engineering/jobs', 'intelligence_engineering_jobs'], ['capabilities', 'intelligence_capabilities'], ['simplifications', 'intelligence_simplifications'], ['intelligence/attempts', 'intelligence_attempts']] as const)
        app.get('/' + path, async (c) => {
            const x = await current(ctx(c), path === 'engineering/jobs' ? ['owner', 'operator'] : undefined);
            const rows = await c.env.DB.prepare(`SELECT * FROM ${table} WHERE workspace_id=? ORDER BY created_at DESC LIMIT 200`).bind(x.principal.workspaceId).all<any>(), visible = [];
            for (const row of rows.results) {
                if (row.commitment_id) {
                    try {
                        await getCommitment(x, row.commitment_id);
                    }
                    catch {
                        continue;
                    }
                }
                else if (row.actor_id !== x.principal.userId && !x.principal.roles.includes('owner'))
                    continue;
                const { claim_token_hash, ...safe } = row;
                visible.push(safe);
            }
            await audit(x, 'intelligence.read', path);
            return c.json(visible);
        });
}
export { eraseIntelligenceIdentity } from './erasure';
export { setWorkIntakePort } from './intake-port';
export { setStandingIntakeExecution } from './intake-execution';
