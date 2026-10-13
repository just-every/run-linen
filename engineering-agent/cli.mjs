#!/usr/bin/env node
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { runEngineeringJob } from './runner.mjs';
const [configPath] = process.argv.slice(2);
if (!configPath)
    throw Error('Usage: node engineering-agent/cli.mjs /absolute/path/to/private-companion-config.json');
const config = JSON.parse(await readFile(configPath, 'utf8')), base = new URL(config.origin);
if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(base.hostname)))
    throw Error('HTTPS origin required');
const receipts = resolve(config.receiptDirectory);
await mkdir(receipts, { recursive: true });
async function api(path, body) {
    const response = await fetch(new URL('/api/v1/engineering-agent/' + path, base), { method: 'POST', headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok)
        throw Error('Engineering API ' + response.status);
    return response.json();
}
// Reconcile persisted receipts before claiming another job. Never repeat an uncertain job.
for (const file of await readdir(receipts)) {
    if (!file.endsWith('.pending.json'))
        continue;
    const p = join(receipts, file), saved = JSON.parse(await readFile(p, 'utf8'));
    let receipt;
    try {
        receipt = JSON.parse(await readFile(join(receipts, saved.jobId + '.json'), 'utf8'));
    }
    catch {
        continue;
    }
    if (receipt.state === 'running')
        receipt = { ...receipt, state: 'unknown', error: 'Companion interrupted; repository reconciliation required' };
    await api('jobs/' + saved.jobId + '/receipt', { claimToken: saved.claimToken, receipt });
    await writeFile(p.replace('.pending.json', '.submitted.json'), JSON.stringify({ jobId: saved.jobId }));
    const { unlink } = await import('node:fs/promises');
    await unlink(p);
}
const claim = await api('claim', {});
if (!claim.job) {
    console.log('No engineering job due');
    process.exit(0);
}
if (claim.grant.id !== config.grantId || JSON.stringify(claim.grant.config) !== JSON.stringify(config.grantConfig))
    throw Error('Grant differs from locally pinned engineering authority');
const pending = join(receipts, claim.job.id + '.pending.json');
await writeFile(pending, JSON.stringify({ jobId: claim.job.id, claimToken: claim.claimToken }), { mode: 0o600 });
const receipt = await runEngineeringJob({ job: claim.job, grant: claim.grant, receiptDirectory: receipts, design: files => api('jobs/' + claim.job.id + '/design', { claimToken: claim.claimToken, files }), authorize: async () => {
        try {
            return (await api('jobs/' + claim.job.id + '/heartbeat', { claimToken: claim.claimToken })).authorized;
        }
        catch {
            return false;
        }
    } });
await api('jobs/' + claim.job.id + '/receipt', { claimToken: claim.claimToken, receipt });
const { unlink } = await import('node:fs/promises');
await unlink(pending);
console.log(JSON.stringify({ jobId: claim.job.id, state: receipt.state, commit: receipt.commit || null }));
