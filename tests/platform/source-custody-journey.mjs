import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const tools = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/edition-authoring');
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: 'pipe'}).trim();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function write(root, name, value) { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), value); }
function init(root) { fs.mkdirSync(root); git(root, 'init', '--quiet'); git(root, 'config', 'user.name', process.env.GIT_AUTHOR_NAME || 'Fixture'); git(root, 'config', 'user.email', process.env.GIT_AUTHOR_EMAIL || 'fixture@example.test'); }
function commit(root) { git(root, 'add', '-A'); git(root, 'commit', '--quiet', '-m', 'fixture'); return git(root, 'rev-parse', 'HEAD'); }
// Run the CLI as an edition does; a failed verification still prints its report.
function run(root, ...args) {
  const result = spawnSync(process.execPath, [path.join(tools, 'cli.mjs'), ...args], {cwd: root, encoding: 'utf8'});
  return {status: result.status, report: result.stdout ? JSON.parse(result.stdout) : null, error: result.stderr};
}
function ok(root, ...args) {
  const result = run(root, ...args);
  assert.equal(result.status, 0, result.error || JSON.stringify(result.report?.drift));
  return result.report;
}
const kinds = report => report.drift.map(item => `${item.kind} ${item.path}`).sort();

function fixture(temp) {
  const base = path.join(temp, 'base'), seed = path.join(temp, 'seed');
  init(base);
  write(base, 'modules/sample/index.mjs', 'export const sample = 1;\n');
  write(base, 'modules/sample/lib/util.mjs', 'export const util = 1;\n');
  write(base, 'modules/sample/tests/sample.test.mjs', 'upstream test\n');
  write(base, 'tools/helper.mjs', 'export const helper = true;\n');
  write(base, 'LICENSE', 'Base licence text\n');
  write(base, 'empty.txt', '');
  const revision = commit(base);
  init(seed);
  for (const name of ['index.mjs', 'lib/util.mjs']) fs.cpSync(path.join(base, 'modules/sample', name), path.join(seed, 'vendor/sample', name));
  fs.cpSync(path.join(base, 'tools/helper.mjs'), path.join(seed, 'scripts/helper.mjs'));
  write(seed, 'src/app.mjs', 'export const app = true;\n');
  write(seed, 'empty.txt', '');
  write(seed, 'edition.json', JSON.stringify({components: [{id: 'runeditrun/base', role: 'foundation', source: {kind: 'local', origin: {repository: base, revision}}}]}));
  commit(seed);
  return {base, seed, revision};
}


const cli = (root, ...args) => JSON.parse(execFileSync(process.execPath, [path.join(tools, 'cli.mjs'), ...args], {cwd: root, encoding: 'utf8', stdio: 'pipe'}));

/** Source custody is part of the native recovery journey, not archive metadata alone. */
export function sourceCustodyJourney() {
  const scenario = (name, body) => { body(); console.log('PASS A6 ' + name); };
scenario('refresh-base moves every copy to one Base commit and drops a legacy record repository', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-refresh-'));
  try {
    const {base, seed, revision} = fixture(temp);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    const recordPath = path.join(seed, 'base-copies.json');
    write(base, 'modules/sample/index.mjs', 'export const sample = 2;\n');
    write(base, 'modules/sample/added.mjs', 'export const added = true;\n');
    fs.rmSync(path.join(base, 'modules/sample/lib/util.mjs'));
    write(base, 'modules/sample/tests/sample.test.mjs', 'changed upstream test\n');
    write(base, 'modules/sample/tests/added.test.mjs', 'new upstream test\n');
    write(base, 'tools/helper.mjs', 'export const helper = "updated";\n');
    const next = commit(base);
    const snapshot = () => Object.fromEntries(git(seed, 'ls-files', '--cached', '--others', '--exclude-standard').split('\n').map(name =>
      [name, {bytes: fs.readFileSync(path.join(seed, name)).toString('hex'), mode: fs.statSync(path.join(seed, name)).mode}]));
    write(seed, 'vendor/sample/index.mjs', 'local edit\n');
    const retainedBefore = snapshot();
    assert.match(run(seed, 'refresh-base', next, '--base', base).error, /local edits.*vendor\/sample\/index\.mjs/);
    assert.deepEqual(snapshot(), retainedBefore);
    write(seed, 'vendor/sample/index.mjs', 'export const sample = 1;\n');
    const removedPath = 'vendor/sample/lib/util.mjs';
    write(seed, removedPath, Buffer.from('Owner bytes\0\xff\r\n', 'latin1'));
    const deletedBefore = snapshot();
    const refused = run(seed, 'refresh-base', next, '--base', base);
    assert.equal(refused.status, 1, 'An edited upstream-deleted copy must be refused');
    assert.match(refused.error, /local edits.*vendor\/sample\/lib\/util\.mjs/);
    assert.deepEqual(snapshot(), deletedBefore, 'Refusal preserves every owner byte, mode and the native record');
    write(seed, removedPath, 'export const util = 1;\n');
    fs.writeFileSync(recordPath, JSON.stringify({...JSON.parse(fs.readFileSync(recordPath, 'utf8')), repository: base}));
    const refreshed = ok(seed, 'refresh-base', next, '--base', base);
    assert.deepEqual(refreshed.copies.find(c => c.path === 'vendor/sample'), {path: 'vendor/sample', from: revision, files: 2, added: ['vendor/sample/added.mjs'], removed: ['vendor/sample/lib/util.mjs']});
    assert.equal(fs.readFileSync(path.join(seed, 'vendor/sample/index.mjs'), 'utf8'), 'export const sample = 2;\n');
    assert.equal(fs.existsSync(path.join(seed, 'vendor/sample/lib/util.mjs')), false);
    // Tests the copy left out stay out, and new upstream tests do not join it.
    assert.equal(fs.existsSync(path.join(seed, 'vendor/sample/tests')), false);
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    assert.equal(Object.hasOwn(record, 'repository'), false);
    assert.deepEqual(record.copies.map(c => c.revision), [next, next]);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    // Export tools may already have replaced a recorded file with the new Base bytes.
    write(base, 'modules/sample/index.mjs', 'export const sample = 3;\n');
    const exported = commit(base);
    fs.copyFileSync(path.join(base, 'modules/sample/index.mjs'), path.join(seed, 'vendor/sample/index.mjs'));
    ok(seed, 'refresh-base', exported, '--base', base);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    const beforeInvalid = fs.readFileSync(recordPath);
    assert.notEqual(run(seed, 'refresh-base', 'main', '--base', base).status, 0);
    assert.deepEqual(fs.readFileSync(recordPath), beforeInvalid);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

scenario('refresh-base refuses to rewrite an applied migration and leaves every file as it was', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-migration-'));
  try {
    const {base, seed, revision} = fixture(temp);
    write(base, 'modules/sample/schema.sql', 'create table a (id text);\n');
    const pinned = commit(base);
    fs.cpSync(path.join(base, 'modules/sample/schema.sql'), path.join(seed, 'migrations/core/0004_sample.sql'));
    ok(seed, 'record-base', 'migrations/core/0004_sample.sql', 'modules/sample/schema.sql', pinned, '--base', base);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    write(base, 'modules/sample/schema.sql', 'create table a (id text, b text);\n');
    write(base, 'modules/sample/index.mjs', 'export const sample = 2;\n');
    const next = commit(base);
    const record = fs.readFileSync(path.join(seed, 'base-copies.json'));
    const refused = run(seed, 'refresh-base', next, '--base', base);
    assert.equal(refused.status, 1);
    assert.match(refused.error, /migrations\/core\/0004_sample\.sql.*new migration/);
    assert.equal(fs.readFileSync(path.join(seed, 'migrations/core/0004_sample.sql'), 'utf8'), 'create table a (id text);\n');
    assert.equal(fs.readFileSync(path.join(seed, 'vendor/sample/index.mjs'), 'utf8'), 'export const sample = 1;\n');
    assert.deepEqual(fs.readFileSync(path.join(seed, 'base-copies.json')), record);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

scenario('changed inputs, explicit mapping comparison, offline extraction and portable receipt', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'author-update-'));
  try {
    const upstream = path.join(temp, 'upstream'), root = path.join(temp, 'edition');
    init(upstream); write(upstream, 'export/send.mjs', 'baseline'); write(upstream, 'export/other.mjs', 'unchanged');
    const revision = commit(upstream);
    init(root); write(root, 'src/owner.mjs', 'owner policy');
    write(root, 'edition.json', JSON.stringify({schemaVersion: 1, id: 'owner/edition', toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'}, components: [{id: 'shared/send', role: 'module', source: {kind: 'local', paths: ['src'], origin: {repository: upstream, revision, path: 'export'}, mappings: [{path: 'src/owner.mjs', originPath: 'send.mjs'}]}}]}));
    commit(root); cli(root, 'lock'); commit(root);
    assert.deepEqual(cli(root, 'changes').files, []);
    write(root, 'src/owner.mjs', 'new policy'); fs.chmodSync(path.join(root, 'src/owner.mjs'), 0o755);
    const changed = cli(root, 'changes').files;
    assert.equal(changed[0].path, 'src/owner.mjs'); assert.equal(changed[0].after.executable, true);
    fs.unlinkSync(path.join(root, 'src/owner.mjs'));
    assert.equal(cli(root, 'changes').files[0].change, 'removed');
    git(root, 'checkout', '--', 'src/owner.mjs');
    write(upstream, 'export/send.mjs', 'upstream correction'); commit(upstream);
    const comparison = cli(root, 'compare', 'shared/send', upstream);
    assert.equal(comparison.upstreamChanges.length, 1); assert.equal(comparison.localChanges.length, 1);
    assert.equal(comparison.localChanges[0].path, 'send.mjs');
    write(upstream, 'export/uncommitted', 'uncommitted'); assert.throws(() => cli(root, 'compare', 'shared/send', upstream));
    fs.rmSync(upstream, {recursive: true});
    const extracted = path.join(temp, 'extracted'); cli(root, 'extract', 'shared/send', extracted);
    assert.equal(fs.readFileSync(path.join(extracted, 'send.mjs'), 'utf8'), 'baseline');
    assert.throws(() => cli(root, 'extract', 'shared/send', extracted));
    assert.throws(() => cli(root, 'extract', 'shared/send', path.join(root, 'inside')));
    const published = path.join(temp, 'published'); const receipt = cli(root, 'release', published);
    const clone = path.join(temp, 'clone'); git(temp, 'clone', published, clone);
    assert.equal(cli(clone, 'receipt', receipt.receiptPath).ok, true);
    assert.equal(fs.existsSync(path.join(clone, '.git/edition-release.json')), false);
    const bad = JSON.parse(fs.readFileSync(receipt.receiptPath)); bad.source.tree = '0'.repeat(40);
    write(temp, 'bad.json', JSON.stringify(bad)); assert.throws(() => cli(clone, 'receipt', path.join(temp, 'bad.json')));
    const collision = path.join(temp, 'collision'); write(temp, 'collision.release.json', 'preserve');
    assert.throws(() => cli(root, 'release', collision)); assert.equal(fs.existsSync(collision), false);
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'sources.lock.json')));
    const archive = path.join(root, '.edition/sources', lock.components[0].baseline.key + '.json');
    const saved = JSON.parse(fs.readFileSync(archive)); saved.dependencies.push({key: '0'.repeat(64)}); fs.writeFileSync(archive, JSON.stringify(saved));
    assert.throws(() => cli(root, 'extract', 'shared/send', path.join(temp, 'tampered')));
    assert.equal(fs.existsSync(path.join(temp, 'tampered')), false);
  } finally {fs.rmSync(temp, {recursive: true, force: true});}
});
}
