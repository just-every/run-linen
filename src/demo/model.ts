import { encryptSecret } from '../platform/crypto';
import { testConnection, setDefaultModel } from '../features/connections';
import type { WorkContext } from '../features/work/core';

/** A configured connection in the throwaway workspace; its provider is demoEffect. */
export async function seedDemoModel(ctx: WorkContext, now: Date) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, key = 'linen-demo-model';
  if (!await db.prepare('SELECT 1 FROM connections WHERE workspace_id=? AND id=?').bind(w, key).first()) {
    const config = { model: 'demo-service-assessment', inputUsdPerMillion: 0, cachedInputUsdPerMillion: 0, outputUsdPerMillion: 0, maxOutputTokens: 2000, maxAttemptUsd: 1, contextCharacters: 100000 };
    const secret = await encryptSecret(ctx.env.ENCRYPTION_KEY, JSON.stringify({ apiKey: 'example-demo-only-no-provider-credential' }));
    await db.prepare("INSERT INTO connections VALUES(?,?,?,?,?,?,'unverified',1,?,?)")
      .bind(key, w, 'openai', 'Service assessment · demo', JSON.stringify(config), secret, now.toISOString(), now.toISOString()).run();
  }
  const connection = await db.prepare('SELECT revision FROM connections WHERE workspace_id=? AND id=?').bind(w, key).first<{ revision: number }>();
  const validated = await testConnection(ctx, key, connection!.revision);
  const settings = await db.prepare('SELECT revision FROM workspace_settings WHERE workspace_id=?').bind(w).first<{ revision: number }>();
  await setDefaultModel(ctx, { connectionId: key, connectionRevision: validated.revision, settingsRevision: settings!.revision });
  await db.prepare('INSERT INTO intelligence_budgets(workspace_id,limit_usd) VALUES(?,25) ON CONFLICT(workspace_id) DO NOTHING').bind(w).run();
}
