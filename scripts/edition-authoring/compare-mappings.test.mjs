import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const tools = path.dirname(fileURLToPath(import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: 'pipe'}).trim();
const cli = (root, ...args) => JSON.parse(execFileSync(process.execPath, [path.join(tools, 'cli.mjs'), ...args], {cwd: root, encoding: 'utf8', stdio: 'pipe'}));
function write(root, name, value) { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), value); }
function init(root) { fs.mkdirSync(root); git(root, 'init', '--quiet'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid'); }
function commit(root) { git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'fixture'); return git(root, 'rev-parse', 'HEAD'); }
const summary = changes => changes.map(c => `${c.change} ${c.path} <- ${c.localPath}`).sort();

// The shape that failed in Uptime: one Base file copied twice (inside a copied
// module directory and as a numbered migration), plus a module mapping nested
// inside a broader foundation mapping.
function uptimeShape(temp, mappings) {
  const upstream = path.join(temp, 'base'), root = path.join(temp, 'edition');
  init(upstream);
  write(upstream, 'foundation/runtime/dispatch.ts', 'dispatch\n');
  write(upstream, 'foundation/runtime/rejected.ts', 'rejected\n');
  write(upstream, 'modules/auth/index.mjs', 'auth\n');
  write(upstream, 'modules/auth/schema/auth.sql', 'create table operator;\n');
  write(upstream, 'modules/integrations/core/schema.sql', 'create table hook;\n');
  const revision = commit(upstream);
  init(root);
  write(root, 'src/base/dispatch.ts', 'dispatch\n');
  write(root, 'src/base/rejected.ts', 'rejected\n');
  write(root, 'src/base/modules/auth/index.mjs', 'auth\n');
  write(root, 'src/base/modules/auth/schema/auth.sql', 'create table operator;\n');
  write(root, 'migrations/0005_operator_auth.sql', 'create table operator;\n');
  write(root, 'src/base/modules/integrations/core/schema.sql', 'create table hook;\n');
  write(root, 'migrations/0007_integrations.sql', 'create table hook;\n');
  write(root, 'edition.json', JSON.stringify({schemaVersion: 1, id: 'owner/uptime', toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'}, parent: null, components: [{
    id: 'runeditrun/base', role: 'foundation', source: {kind: 'local', paths: ['src/base', 'migrations'],
      origin: {repository: upstream, revision, path: '.'}, mappings},
  }]}));
  commit(root); cli(root, 'lock'); commit(root);
  return {upstream, root};
}
const uptimeMappings = [
  {path: 'src/base', originPath: 'foundation/runtime'},
  {path: 'src/base/modules/auth', originPath: 'modules/auth'},
  {path: 'migrations/0005_operator_auth.sql', originPath: 'modules/auth/schema/auth.sql'},
  {path: 'src/base/modules/integrations', originPath: 'modules/integrations'},
  {path: 'migrations/0007_integrations.sql', originPath: 'modules/integrations/core/schema.sql'},
];

test('compare handles one origin file copied to several local paths and nested mappings', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-overlap-'));
  try {
    const {upstream, root} = uptimeShape(temp, uptimeMappings);
    const unchanged = cli(root, 'compare', 'runeditrun/base', upstream);
    assert.deepEqual(unchanged.upstreamChanges, []);
    // Nested module files belong to the most specific mapping, not to foundation/runtime/modules/...
    assert.deepEqual(unchanged.localChanges, []);
    write(root, 'migrations/0005_operator_auth.sql', 'create table operator; -- local index\n');
    write(root, 'src/base/modules/auth/added.mjs', 'local addition\n');
    git(root, 'rm', '--quiet', 'src/base/rejected.ts');
    commit(root);
    write(upstream, 'modules/auth/schema/auth.sql', 'create table operator (id text);\n');
    commit(upstream);
    const changed = cli(root, 'compare', 'runeditrun/base', upstream);
    assert.deepEqual(changed.upstreamChanges.map(c => c.path), ['modules/auth/schema/auth.sql']);
    // Only the edited migration copy differs; the module-directory copy of the same origin file does not.
    assert.deepEqual(summary(changed.localChanges), [
      'added modules/auth/added.mjs <- src/base/modules/auth/added.mjs',
      'modified modules/auth/schema/auth.sql <- migrations/0005_operator_auth.sql',
      'removed foundation/runtime/rejected.ts <- src/base/rejected.ts',
    ]);
    const migration = changed.localChanges.find(c => c.localPath === 'migrations/0005_operator_auth.sql');
    assert.equal(migration.before.sha256, unchanged.currentFiles['src/base/modules/auth/schema/auth.sql'].sha256);
    assert.equal(migration.after.sha256, changed.currentFiles['migrations/0005_operator_auth.sql'].sha256);
    const other = spawnSync(process.execPath, [path.join(tools, 'cli.mjs'), 'compare', 'runeditrun/base', upstream, upstream], {cwd: root, encoding: 'utf8'});
    assert.match(other.stderr, /independent current checkout is supported only for parent comparison/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('compare rejects one local path mapped to two different origins', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'compare-ambiguous-'));
  try {
    const {upstream, root} = uptimeShape(temp, [...uptimeMappings, {path: 'migrations/0005_operator_auth.sql', originPath: 'modules/integrations/core/schema.sql'}]);
    const result = spawnSync(process.execPath, [path.join(tools, 'cli.mjs'), 'compare', 'runeditrun/base', upstream], {cwd: root, encoding: 'utf8'});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Ambiguous comparison mappings for migrations\/0005_operator_auth\.sql/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});
