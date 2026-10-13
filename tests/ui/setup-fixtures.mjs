import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const exec = promisify(execFile);
export async function setupSql(sql) {
  if (!process.env.LINEN_SETUP_STATE || !process.env.LINEN_TEST_OUTPUT) throw Error('Fixture SQL requires isolated setup-run state');
  const file = join(process.env.LINEN_TEST_OUTPUT, 'setup-fixture.sql');
  await writeFile(file, sql);
  await exec(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB', '--local', '--persist-to', process.env.LINEN_SETUP_STATE, '--config', 'wrangler.jsonc', '--file', file], { maxBuffer: 1024 * 1024 });
}
export async function seedSetupFixtures(ownerId, employeeId) {
  const q = x => "'" + String(x).replaceAll("'", "''") + "'";
  const workspace = `(SELECT workspace_id FROM memberships WHERE user_id=${q(ownerId)} LIMIT 1)`;
  const now = q(new Date().toISOString());
  let sql = '';
  for (const [id, provider, name, config, revision] of [
    ['setup-graph', 'microsoft-graph', 'Team directory', { tenantId: 'fixture-tenant' }, 3],
    ['setup-probe', 'workflow-probe', 'Independent work check', { url: 'https://probe.example.test', allowedHosts: ['probe.example.test'] }, 4],
    ['setup-deploy', 'controlled-deployment', 'Owned release runner', { url: 'https://deploy.example.test', allowedHosts: ['deploy.example.test'], targets: ['orders'] }, 5],
  ]) sql += `INSERT INTO connections VALUES(${q(id)},${workspace},${q(provider)},${q(name)},${q(JSON.stringify(config))},NULL,'active',${revision},${now},${now});\n`;
  for (const [id, local, subject] of [['setup-employee-mapping', employeeId, 'provider-colleague'], ['setup-owner-mapping', ownerId, 'provider-owner']])
    sql += `INSERT INTO execution_subject_mappings VALUES(${q(id)},${workspace},'setup-graph',3,${q(local)},${q(subject)},2,1,${now},${q(ownerId)},'member',${q(JSON.stringify({ userId: local }))});\n`;
  await setupSql(sql);
}
