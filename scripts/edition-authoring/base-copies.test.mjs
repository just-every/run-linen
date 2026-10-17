import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const tools = path.dirname(fileURLToPath(import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: 'pipe'}).trim();
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function write(root, name, value) { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), value); }
function init(root) { fs.mkdirSync(root); git(root, 'init', '--quiet'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid'); }
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

test('record-base pins Base bytes and verify-base passes only for exact recorded copies', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-'));
  try {
    const {base, seed, revision} = fixture(temp);
    const recorded = ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    assert.equal(recorded.files, 2);
    assert.deepEqual(recorded.notCopied, ['modules/sample/tests/sample.test.mjs']);
    assert.deepEqual(recorded.differs, []);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    const record = JSON.parse(fs.readFileSync(path.join(seed, 'base-copies.json'), 'utf8'));
    // Provenance is the full commit and file digests; the record names no repository.
    assert.equal(Object.hasOwn(record, 'repository'), false);
    assert.deepEqual(record.copies.map(c => [c.path, c.originPath, c.revision]), [['scripts/helper.mjs', 'tools/helper.mjs', revision], ['vendor/sample', 'modules/sample', revision]]);
    assert.equal(record.copies[1].files['vendor/sample/lib/util.mjs'], sha('export const util = 1;\n'));
    const report = ok(seed, 'verify-base', '--base', base);
    assert.equal(report.ok, true);
    assert.deepEqual(report.drift, []);
    assert.deepEqual(report.unrecordedCopies, []);
    assert.deepEqual(report.copies.find(c => c.path === 'vendor/sample').notCopied, ['modules/sample/tests/sample.test.mjs']);
    // A package script may pass its argument separator first.
    assert.equal(ok(seed, 'verify-base', '--', '--base', base).ok, true);
    // The seed's declaration also supplies acquisition without a checkout flag.
    assert.equal(ok(seed, 'verify-base').ok, true);
    fs.rmSync(path.join(seed, 'base-copies.json'));
    write(seed, 'edition.json', JSON.stringify({components: [{id: 'runeditrun/base', role: 'foundation', source: {kind: 'git', repository: base, revision}}]}));
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision);
    assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(seed, 'base-copies.json'), 'utf8')), 'repository'), false);
    assert.equal(ok(seed, 'verify-base').ok, true);
    // A seed without a URL can still record and verify against an explicit checkout.
    fs.rmSync(path.join(seed, 'base-copies.json'));
    write(seed, 'edition.json', JSON.stringify({components: [{id: 'runeditrun/base', role: 'foundation', source: {kind: 'local'}}]}));
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    assert.equal(ok(seed, 'verify-base', '--offline').ok, true);
    assert.notEqual(run(seed, 'verify-base').status, 0);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('verify-base reports modified, missing, unrecorded and non-file copies and exits nonzero', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-drift-'));
  try {
    const {base, seed, revision} = fixture(temp);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    write(seed, 'vendor/sample/index.mjs', 'export const sample = 2;\n');
    let result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.equal(result.report.ok, false);
    assert.deepEqual(kinds(result.report), ['modified vendor/sample/index.mjs']);
    assert.equal(result.report.drift[0].expected, sha('export const sample = 1;\n'));
    assert.equal(result.report.drift[0].actual, sha('export const sample = 2;\n'));
    // Offline verification still compares local bytes with the record.
    assert.equal(run(seed, 'verify-base', '--offline').status, 1);
    write(seed, 'vendor/sample/extra.mjs', 'local addition\n');
    fs.rmSync(path.join(seed, 'vendor/sample/lib/util.mjs'));
    fs.symlinkSync('../../src/app.mjs', path.join(seed, 'vendor/sample/linked.mjs'));
    result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(kinds(result.report), ['missing vendor/sample/lib/util.mjs', 'modified vendor/sample/index.mjs', 'not-a-file vendor/sample/linked.mjs', 'unrecorded vendor/sample/extra.mjs']);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('verify-base finds Base files copied without a record, ignoring empty files and declared exceptions', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-unrecorded-'));
  try {
    const {base, seed, revision} = fixture(temp);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    let result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.drift, []);
    assert.deepEqual(result.report.unrecordedCopies, [{path: 'scripts/helper.mjs', originPath: 'tools/helper.mjs', revision}]);
    // A copy of a file only present at the newer Base checkout is found too.
    write(base, 'modules/later/new.mjs', 'export const later = true;\n');
    const later = commit(base);
    write(seed, 'src/vendored-later.mjs', 'export const later = true;\n');
    write(seed, 'LICENSE', 'Base licence text\n');
    result = run(seed, 'verify-base', '--base', base);
    assert.deepEqual(result.report.unrecordedCopies.map(c => [c.path, c.originPath, c.revision]), [
      ['scripts/helper.mjs', 'tools/helper.mjs', revision], ['src/vendored-later.mjs', 'modules/later/new.mjs', later],
    ]);
    // LICENSE is structurally excluded; use a discoverable copy to exercise
    // the owner's explicit exception independently of that exclusion.
    write(seed, 'src/ignored-helper.mjs', 'export const helper = true;\n');
    result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.ok(result.report.unrecordedCopies.some(c => c.path === 'src/ignored-helper.mjs' && c.originPath === 'tools/helper.mjs'));
    const record = JSON.parse(fs.readFileSync(path.join(seed, 'base-copies.json'), 'utf8'));
    record.ignore = ['src/ignored-helper.mjs'];
    write(seed, 'base-copies.json', JSON.stringify(record));
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    ok(seed, 'record-base', 'src/vendored-later.mjs', 'modules/later/new.mjs', later, '--base', base);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('verify-base checks recorded hashes and paths against Base at the recorded commit', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-origin-'));
  try {
    const {base, seed, revision} = fixture(temp);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    // Local bytes and record changed together: the record no longer states Base bytes.
    const recordPath = path.join(seed, 'base-copies.json');
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    write(seed, 'vendor/sample/index.mjs', 'locally rewritten\n');
    record.copies[0].files['vendor/sample/index.mjs'] = sha('locally rewritten\n');
    record.copies[0].files['vendor/sample/invented.mjs'] = sha('invented\n');
    write(seed, 'vendor/sample/invented.mjs', 'invented\n');
    fs.writeFileSync(recordPath, JSON.stringify(record));
    assert.equal(ok(seed, 'verify-base', '--offline').ok, true);
    const result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.drift.map(d => [d.kind, d.path, d.originPath]).sort((a, b) => a[1].localeCompare(b[1])), [
      ['origin-mismatch', 'vendor/sample/index.mjs', 'modules/sample/index.mjs'],
      ['origin-missing', 'vendor/sample/invented.mjs', 'modules/sample/invented.mjs'],
    ]);
    // An older record's repository is still read directly when no checkout is supplied.
    record.repository = base;
    fs.writeFileSync(recordPath, JSON.stringify(record));
    assert.deepEqual(kinds(run(seed, 'verify-base').report), ['origin-mismatch vendor/sample/index.mjs', 'origin-missing vendor/sample/invented.mjs']);
    record.copies[0].revision = 'f'.repeat(40);
    fs.writeFileSync(recordPath, JSON.stringify(record));
    assert.match(run(seed, 'verify-base', '--base', base).error, /Base commit f{40} is not available/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('upgrading a copy to a new Base pin re-records Base bytes; invalid records and requests fail closed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-upgrade-'));
  try {
    const {base, seed, revision} = fixture(temp);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    write(base, 'modules/sample/index.mjs', 'export const sample = 3;\n');
    write(base, 'modules/sample/added.mjs', 'export const added = true;\n');
    const next = commit(base);
    // Still pinned to the old commit: the new upstream bytes are not yet adopted.
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    for (const name of ['index.mjs', 'added.mjs']) fs.cpSync(path.join(base, 'modules/sample', name), path.join(seed, 'vendor/sample', name));
    assert.deepEqual(kinds(run(seed, 'verify-base', '--base', base).report), ['modified vendor/sample/index.mjs', 'unrecorded vendor/sample/added.mjs']);
    const upgraded = ok(seed, 'record-base', 'vendor/sample', 'modules/sample', next, '--base', base);
    assert.equal(upgraded.files, 3);
    const record = JSON.parse(fs.readFileSync(path.join(seed, 'base-copies.json'), 'utf8'));
    assert.deepEqual(record.copies.map(c => [c.path, c.revision]), [['scripts/helper.mjs', revision], ['vendor/sample', next]]);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    // Recording never trusts local bytes; a stale local file is reported as different.
    write(seed, 'vendor/sample/lib/util.mjs', 'stale\n');
    assert.deepEqual(ok(seed, 'record-base', 'vendor/sample', 'modules/sample', next, '--base', base).differs, ['vendor/sample/lib/util.mjs']);
    assert.match(run(seed, 'record-base', 'vendor', 'modules', next, '--base', base).error, /Overlapping Base copies/);
    assert.match(run(seed, 'record-base', 'absent', 'modules/sample', next, '--base', base).error, /Copy Base modules\/sample into absent/);
    assert.match(run(seed, 'record-base', 'vendor/sample', 'modules/none', next, '--base', base).error, /No Base source/);
    assert.match(run(seed, 'record-base', 'vendor/sample', 'modules/sample', 'main', '--base', base).error, /immutable full Base commit/);
    assert.match(run(seed, 'record-base', '../outside', 'modules/sample', next, '--base', base).error, /Unsafe path/);
    assert.match(run(seed, 'verify-base', '--unknown').error, /Unknown option/);
    assert.match(run(seed, 'verify-base', '--record', 'absent.json').error, /No absent\.json found; run record-base <path> <origin-path> <commit> first/);
    for (const bad of [{...record, schemaVersion: 2}, {...record, copies: [{...record.copies[1], revision: 'main'}]},
      {...record, copies: [{...record.copies[1], files: {'elsewhere/index.mjs': sha('x')}}]}, {...record, copies: [record.copies[1], {...record.copies[1], path: 'vendor/sample/lib'}]}]) {
      write(seed, 'bad-record.json', JSON.stringify(bad));
      assert.equal(run(seed, 'verify-base', '--record', 'bad-record.json', '--offline').status, 1);
      assert.match(run(seed, 'verify-base', '--record', 'bad-record.json', '--offline').error, /Invalid|Overlapping/);
    }
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('refresh-base moves every copy to one Base commit and drops a legacy record repository', () => {
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
    assert.match(run(seed, 'refresh-base', 'main', '--base', base).error, /immutable full Base commit/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('refresh-base refuses to rewrite an applied migration and leaves every file as it was', () => {
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

test('record-base records each file mode and verify-base reports mode drift locally and against Base', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-mode-'));
  try {
    const {base, seed, revision} = fixture(temp);
    write(base, 'modules/sample/run.sh', '#!/bin/sh\necho run\n');
    fs.chmodSync(path.join(base, 'modules/sample/run.sh'), 0o755);
    const withScript = commit(base);
    assert.match(git(base, 'ls-tree', withScript, 'modules/sample/run.sh'), /^100755 /);
    fs.cpSync(path.join(base, 'modules/sample/run.sh'), path.join(seed, 'vendor/sample/run.sh'));
    fs.chmodSync(path.join(seed, 'vendor/sample/run.sh'), 0o755);
    const recorded = ok(seed, 'record-base', 'vendor/sample', 'modules/sample', withScript, '--base', base);
    assert.deepEqual(recorded.differs, []);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', withScript, '--base', base);
    const record = JSON.parse(fs.readFileSync(path.join(seed, 'base-copies.json'), 'utf8'));
    assert.deepEqual(record.copies[1].modes, {
      'vendor/sample/index.mjs': '100644', 'vendor/sample/lib/util.mjs': '100644', 'vendor/sample/run.sh': '100755',
    });
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    // The copy lost its executable bit: same bytes, different mode.
    fs.chmodSync(path.join(seed, 'vendor/sample/run.sh'), 0o644);
    let result = run(seed, 'verify-base', '--offline');
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.drift, [{kind: 'mode', path: 'vendor/sample/run.sh', copy: 'vendor/sample', expected: '100755', actual: '100644'}]);
    // Recording reports the mode difference as a difference from Base.
    assert.deepEqual(ok(seed, 'record-base', 'vendor/sample', 'modules/sample', withScript, '--base', base).differs, ['vendor/sample/run.sh']);
    // The opposite drift: a plain Base file made executable.
    fs.chmodSync(path.join(seed, 'vendor/sample/run.sh'), 0o755);
    fs.chmodSync(path.join(seed, 'vendor/sample/index.mjs'), 0o755);
    assert.deepEqual(kinds(run(seed, 'verify-base', '--offline').report), ['mode vendor/sample/index.mjs']);
    fs.chmodSync(path.join(seed, 'vendor/sample/index.mjs'), 0o644);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    // A record whose modes disagree with Base at the recorded commit is not a statement of Base.
    record.copies[1].modes['vendor/sample/index.mjs'] = '100755';
    fs.chmodSync(path.join(seed, 'vendor/sample/index.mjs'), 0o755);
    fs.writeFileSync(path.join(seed, 'base-copies.json'), JSON.stringify(record));
    assert.equal(ok(seed, 'verify-base', '--offline').ok, true);
    result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.drift, [{kind: 'origin-mode', path: 'vendor/sample/index.mjs', originPath: 'modules/sample/index.mjs', revision: withScript, expected: '100755', actual: '100644'}]);
    // Records without modes stay valid; malformed modes are refused.
    delete record.copies[1].modes;
    fs.writeFileSync(path.join(seed, 'base-copies.json'), JSON.stringify(record));
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    record.copies[1].modes = {'vendor/sample/index.mjs': '100666'};
    fs.writeFileSync(path.join(seed, 'base-copies.json'), JSON.stringify(record));
    assert.match(run(seed, 'verify-base', '--offline').error, /Invalid recorded mode/);
    assert.equal(revision.length, 40);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('verify-base does not flag tiny files such as CLAUDE.md as unrecorded Base copies', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-tiny-'));
  try {
    const {base, seed, revision} = fixture(temp);
    write(base, 'export/CLAUDE.md', '@AGENTS.md\n');
    write(base, 'export/AGENTS.md', 'Base agent guidance, long enough to be a real shared file.\n');
    commit(base);
    write(seed, 'CLAUDE.md', '@AGENTS.md\n');
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    // A file above the floor with Base's bytes is still found.
    write(seed, 'AGENTS.md', 'Base agent guidance, long enough to be a real shared file.\n');
    const result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.unrecordedCopies.map(c => c.path), ['AGENTS.md']);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('unrecorded-copy defaults exclude root LICENSE and CLAUDE.md while recorded copies still verify them', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-defaults-'));
  try {
    const {base, seed, revision} = fixture(temp);
    const license = 'Shared licence text, long enough to exceed the tiny-file floor.\n';
    const guidance = 'Shared Claude guidance, long enough to exceed the tiny-file floor.\n';
    write(base, 'LICENSE', license);
    write(base, 'export/CLAUDE.md', guidance);
    const next = commit(base);
    write(seed, 'LICENSE', license);
    write(seed, 'CLAUDE.md', guidance);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    assert.equal(ok(seed, 'verify-base', '--base', base).ok, true);
    // Exclusions apply only to discovery; explicit copy records remain authoritative.
    ok(seed, 'record-base', 'LICENSE', 'LICENSE', next, '--base', base);
    ok(seed, 'record-base', 'CLAUDE.md', 'export/CLAUDE.md', next, '--base', base);
    write(seed, 'LICENSE', 'Owner-edited licence\n');
    write(seed, 'CLAUDE.md', 'Owner-edited guidance\n');
    const result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(kinds(result.report), ['modified CLAUDE.md', 'modified LICENSE']);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('tiny-file discovery has a size boundary and never suppresses recorded copy drift', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-floor-'));
  try {
    const {base, seed, revision} = fixture(temp);
    write(base, 'tools/small.txt', 'a'.repeat(15));
    write(base, 'tools/boundary.txt', 'b'.repeat(16));
    const next = commit(base);
    write(seed, 'small.txt', 'a'.repeat(15));
    write(seed, 'boundary.txt', 'b'.repeat(16));
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    let result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.unrecordedCopies.map(copy => copy.path), ['boundary.txt']);
    ok(seed, 'record-base', 'small.txt', 'tools/small.txt', next, '--base', base);
    ok(seed, 'record-base', 'boundary.txt', 'tools/boundary.txt', next, '--base', base);
    write(seed, 'small.txt', 'changed');
    result = run(seed, 'verify-base', '--base', base);
    assert.equal(result.status, 1);
    assert.deepEqual(kinds(result.report), ['modified small.txt']);
    assert.deepEqual(result.report.unrecordedCopies, []);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('a missing record names record-base instead of a raw ENOENT', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-norecord-'));
  try {
    const {seed} = fixture(temp);
    for (const args of [[], ['--offline'], ['--record', 'custom/base-copies.json']]) {
      const result = run(seed, 'verify-base', ...args);
      assert.equal(result.status, 1);
      assert.match(result.error, /No (custom\/)?base-copies\.json found; run record-base <path> <origin-path> <commit> first/);
      assert.doesNotMatch(result.error, /ENOENT/);
    }
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('the record path is never read or written through a link and must be a regular file', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-links-'));
  try {
    const {base, seed, revision} = fixture(temp);
    const outside = path.join(temp, 'outside.json');
    // A dangling record symlink must not create its target.
    fs.symlinkSync(outside, path.join(seed, 'base-copies.json'));
    assert.match(run(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base).error, /Symlink in destination path/);
    assert.equal(fs.existsSync(outside), false);
    assert.match(run(seed, 'verify-base', '--offline').error, /Symlink in destination path/);
    // A symlink to an existing valid record is refused too, and the target is not rewritten.
    fs.rmSync(path.join(seed, 'base-copies.json'));
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    fs.renameSync(path.join(seed, 'base-copies.json'), outside);
    const before = fs.readFileSync(outside, 'utf8');
    fs.symlinkSync(outside, path.join(seed, 'base-copies.json'));
    assert.match(run(seed, 'verify-base', '--offline').error, /Symlink in destination path/);
    assert.match(run(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base).error, /Symlink in destination path/);
    assert.equal(fs.readFileSync(outside, 'utf8'), before);
    // A symlinked parent directory of a custom record path is refused.
    fs.rmSync(path.join(seed, 'base-copies.json'));
    fs.mkdirSync(path.join(temp, 'elsewhere'));
    fs.symlinkSync(path.join(temp, 'elsewhere'), path.join(seed, 'records'));
    assert.match(run(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base, '--record', 'records/base-copies.json').error, /Symlink in destination path/);
    assert.deepEqual(fs.readdirSync(path.join(temp, 'elsewhere')), []);
    // A directory at the record path is not a record.
    fs.mkdirSync(path.join(seed, 'dir.json'));
    assert.match(run(seed, 'verify-base', '--record', 'dir.json', '--offline').error, /not a regular file/);
    assert.match(run(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base, '--record', 'dir.json').error, /not a regular file/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});


test('Git copy modes use the owner executable bit', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'base-copies-git-mode-'));
  try {
    const {base, seed} = fixture(temp);
    write(base, 'modules/sample/run.sh', '#!/bin/sh\necho run\n');
    fs.chmodSync(path.join(base, 'modules/sample/run.sh'), 0o755);
    const revision = commit(base);
    fs.cpSync(path.join(base, 'modules/sample/run.sh'), path.join(seed, 'vendor/sample/run.sh'));
    fs.chmodSync(path.join(seed, 'vendor/sample/run.sh'), 0o755);
    ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base);
    ok(seed, 'record-base', 'scripts/helper.mjs', 'tools/helper.mjs', revision, '--base', base);
    // Other users retaining execute permission does not preserve the Git executable bit.
    fs.chmodSync(path.join(seed, 'vendor/sample/run.sh'), 0o645);
    git(seed, 'add', 'vendor/sample');
    assert.match(git(seed, 'ls-files', '--stage', 'vendor/sample/run.sh'), /^100644 /);
    const result = run(seed, 'verify-base', '--offline');
    assert.equal(result.status, 1);
    assert.deepEqual(result.report.drift, [{kind: 'mode', path: 'vendor/sample/run.sh', copy: 'vendor/sample', expected: '100755', actual: '100644'}]);
    assert.deepEqual(ok(seed, 'record-base', 'vendor/sample', 'modules/sample', revision, '--base', base).differs, ['vendor/sample/run.sh']);
    fs.chmodSync(path.join(seed, 'vendor/sample/run.sh'), 0o755);
    // Group-only execution likewise does not turn a plain Git file into 100755.
    fs.chmodSync(path.join(seed, 'vendor/sample/index.mjs'), 0o654);
    git(seed, 'add', 'vendor/sample');
    assert.match(git(seed, 'ls-files', '--stage', 'vendor/sample/index.mjs'), /^100644 /);
    assert.equal(ok(seed, 'verify-base', '--offline').ok, true);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});
