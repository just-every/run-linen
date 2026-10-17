import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {hash, json, digest} from './files.mjs';

const tools = path.dirname(fileURLToPath(import.meta.url));
const git = (root, ...args) => execFileSync('git', ['-C', root, ...args], {encoding: 'utf8', stdio: 'pipe'}).trim();
function cli(root, ...args) {
  const result = spawnSync(process.execPath, [path.join(tools, 'cli.mjs'), ...args], {cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  if (result.status !== 0) throw Error(result.stderr.trim());
  return JSON.parse(result.stdout);
}
function write(root, name, value) { fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); fs.writeFileSync(path.join(root, name), value); }
function init(root) { fs.mkdirSync(root, {recursive: true}); git(root, 'init', '--quiet'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.invalid'); }
function commit(root) { git(root, 'add', '-A'); git(root, 'commit', '--quiet', '--allow-empty', '-m', 'fixture'); return git(root, 'rev-parse', 'HEAD'); }
function repository(root, files) { init(root); for (const [name, value] of Object.entries(files)) write(root, name, value); commit(root); return root; }
const encode = files => Object.fromEntries(Object.entries(files).map(([name, value]) => [name, {data: Buffer.from(value).toString('base64'), executable: false}]));

// The private original parent and its reviewed public projection: one member's
// bytes are replaced and one presentation image is omitted.
const ORIGINAL = {'app.mjs': 'export const app = 1;\n', 'config.txt': 'token=private-value\n', 'visual/screen.png': 'PNG original bytes'};
const PROJECTED = {'app.mjs': ORIGINAL['app.mjs'], 'config.txt': 'token=example\n'};
const PARENT = 'https://example.test/parent.git';

function projection({reason = 'Presentation-only screenshot; no comparison reads it.'} = {}) {
  const originalOrigin = {repository: 'https://example.test/private.git', revision: 'a'.repeat(40), path: '.', paths: null, excludeSnapshots: true};
  const original = {key: hash(json(originalOrigin)), origin: originalOrigin, digest: digest(encode(ORIGINAL)), files: encode(ORIGINAL), dependencies: []};
  const originalSha256 = hash(json(original));
  const omitted = {originalSha256: hash(ORIGINAL['visual/screen.png']), omit: true};
  if (reason !== null) omitted.reason = reason;
  const plan = json({schemaVersion: 1, purpose: 'fixture', archives: [{selector: 'parent', originalKey: original.key, originalSha256, repository: PARENT, members: {
    'config.txt': {originalSha256: hash(ORIGINAL['config.txt']), edits: [{reason: 'Synthetic credential'}]},
    'visual/screen.png': omitted,
  }}]});
  const identity = {schemaVersion: 1, originalSha256, recipeSha256: hash(plan)};
  const origin = {repository: PARENT, projection: identity, path: '.', paths: null, excludeSnapshots: true};
  const saved = {key: hash(json(origin)), origin, digest: digest(encode(PROJECTED)), files: encode(PROJECTED), dependencies: []};
  const archive = json(saved);
  const receipt = json({schemaVersion: 1, recipeSha256: hash(plan), archives: [{selector: 'parent', originalKey: original.key, originalSha256,
    upstreamRevision: 'a'.repeat(40), key: saved.key, sha256: hash(archive), digest: saved.digest, origin,
    members: Object.keys(ORIGINAL).map(name => ({path: name, originalSha256: hash(ORIGINAL[name]), projectedSha256: name in PROJECTED ? hash(PROJECTED[name]) : null, executable: false}))}]});
  return {identity, saved, archive, plan, receipt};
}

// An edition whose parent baseline is the projection. The reviewed archive binding
// is carried into the source lock before the first refresh, as adoption requires.
function child(root, projected, {bind = true} = {}) {
  init(root);
  write(root, 'src/app.mjs', 'export const child = true;\n');
  write(root, 'edition.json', JSON.stringify({schemaVersion: 1, id: 'owner/child', toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'},
    parent: {repository: PARENT, projection: projected.identity},
    components: [{id: 'owner/child', role: 'edition', source: {kind: 'local', paths: ['src']}}]}));
  write(root, 'scripts/public-projections/plan.json', projected.plan);
  write(root, 'scripts/public-projections/receipt.json', projected.receipt);
  write(root, `.edition/sources/${projected.saved.key}.json`, projected.archive);
  if (bind) write(root, 'sources.lock.json', json({schemaVersion: 1, edition: 'owner/child', parent: {key: projected.saved.key, digest: projected.saved.digest, sha256: hash(projected.archive)}, components: []}));
  commit(root);
  return root;
}

test('a projected parent locks, checks, extracts and releases offline from its reviewed archive', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-lock-'));
  try {
    const projected = projection();
    const root = child(path.join(temp, 'child'), projected);
    const lock = cli(root, 'lock');
    assert.deepEqual(lock.parent, {key: projected.saved.key, digest: projected.saved.digest, sha256: hash(projected.archive)});
    commit(root);
    assert.equal(cli(root, 'check').ok, true);
    const extracted = path.join(temp, 'extracted');
    cli(root, 'extract', 'parent', extracted);
    assert.equal(fs.readFileSync(path.join(extracted, 'config.txt'), 'utf8'), 'token=example\n');
    assert.equal(fs.existsSync(path.join(extracted, 'visual')), false);
    const released = path.join(temp, 'released');
    cli(root, 'release', released);
    assert.equal(cli(released, 'check').ok, true);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('projection identities, archives and lock bindings fail closed', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-failures-'));
  try {
    const projected = projection();
    const root = child(path.join(temp, 'child'), projected);
    cli(root, 'lock'); commit(root);
    const recipe = JSON.parse(fs.readFileSync(path.join(root, 'edition.json')));
    for (const parent of [{...recipe.parent, revision: 'b'.repeat(40)}, {...recipe.parent, projection: {...recipe.parent.projection, extra: true}}, {...recipe.parent, projection: {...recipe.parent.projection, schemaVersion: 2}}]) {
      write(root, 'edition.json', JSON.stringify({...recipe, parent}));
      assert.throws(() => cli(root, 'inspect'), /Invalid public projection identity/);
    }
    git(root, 'checkout', '--', 'edition.json');
    const archivePath = path.join(root, '.edition/sources', projected.saved.key + '.json');
    // Same archive content, different bytes: the lock binds exact reviewed bytes.
    fs.writeFileSync(archivePath, JSON.stringify(projected.saved));
    assert.throws(() => cli(root, 'check'), /Public projection artifact differs from source lock/);
    fs.unlinkSync(archivePath);
    assert.throws(() => cli(root, 'check'), /Missing retained public projection/);
    fs.writeFileSync(archivePath, projected.archive);
    assert.equal(cli(root, 'check').ok, true);
    // A first lock never bootstraps authority from the archive's own claims.
    const unbound = child(path.join(temp, 'unbound'), projected, {bind: false});
    assert.throws(() => cli(unbound, 'lock'), /requires a selected source-lock binding/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('whole-parent comparison normalizes only planned projection identities against independent incoming and current source', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'parent-comparison-'));
  try {
    const projected = projection();
    const root = child(path.join(temp, 'child'), projected);
    cli(root, 'lock'); commit(root);
    const incoming = repository(path.join(temp, 'incoming'), ORIGINAL);
    const current = repository(path.join(temp, 'current'), ORIGINAL);
    const same = cli(root, 'compare', 'parent', incoming, current);
    assert.deepEqual(same.upstreamChanges, []);
    assert.deepEqual(same.localChanges, []);
    assert.equal(same.mappings, null);
    // Incoming source is the candidate's own Git commit, never the projection identity.
    assert.equal(same.incoming.origin.revision, git(incoming, 'rev-parse', 'HEAD'));
    assert.equal(same.incoming.origin.projection, undefined);
    write(incoming, 'visual/screen.png', 'PNG changed bytes');
    fs.chmodSync(path.join(incoming, 'app.mjs'), 0o755);
    write(incoming, 'added.mjs', 'new upstream file\n');
    commit(incoming);
    write(current, 'config.txt', 'token=another-private-value\n');
    git(current, 'rm', '--quiet', 'app.mjs');
    commit(current);
    const changed = cli(root, 'compare', 'parent', incoming, current);
    assert.deepEqual(changed.upstreamChanges.map(c => `${c.change} ${c.path}`), ['added added.mjs', 'modified app.mjs', 'added visual/screen.png']);
    assert.equal(changed.upstreamChanges[1].after.executable, true);
    assert.deepEqual(changed.localChanges.map(c => `${c.change} ${c.path}`), ['removed app.mjs', 'modified config.txt']);
    // Without an independent checkout the edition itself is the current source.
    const own = cli(root, 'compare', 'parent', incoming);
    assert.ok(own.currentFiles['src/app.mjs']);
    // A changed comparison policy after locking is refused.
    write(root, 'scripts/public-projections/receipt.json', projected.receipt.replace('"schemaVersion": 1', '"schemaVersion":1'));
    assert.throws(() => cli(root, 'compare', 'parent', incoming, current), /Parent comparison policy differs from source lock/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('a planned omission must state its reason', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'parent-omission-'));
  try {
    const projected = projection({reason: null});
    const root = child(path.join(temp, 'child'), projected);
    cli(root, 'lock'); commit(root);
    const incoming = repository(path.join(temp, 'incoming'), ORIGINAL);
    assert.throws(() => cli(root, 'compare', 'parent', incoming), /Only planned omissions with a recorded reason may be omitted/);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('an ordinary Git parent compares as a whole without any projection plan', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'plain-parent-'));
  try {
    const parent = repository(path.join(temp, 'parent'), {'app.mjs': 'parent\n', 'README.md': 'parent docs\n'});
    const root = path.join(temp, 'child');
    init(root);
    write(root, 'app.mjs', 'parent\n');
    write(root, 'edition.json', JSON.stringify({schemaVersion: 1, id: 'owner/child', toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'},
      parent: {repository: parent, revision: git(parent, 'rev-parse', 'HEAD')}, components: [{id: 'owner/child', role: 'edition', source: {kind: 'local', paths: ['app.mjs']}}]}));
    commit(root); cli(root, 'lock'); commit(root);
    write(parent, 'README.md', 'newer parent docs\n'); commit(parent);
    const result = cli(root, 'compare', 'parent', parent);
    assert.deepEqual(result.upstreamChanges.map(c => `${c.change} ${c.path}`), ['modified README.md']);
    assert.deepEqual(result.localChanges.map(c => `${c.change} ${c.path}`).sort(), ['added edition.json', 'added sources.lock.json', 'removed README.md']);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});

test('promotion keeps a projected Git selection on its projection identity; workspaces are refused', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'projection-promote-'));
  try {
    const files = encode({'logic.mjs': 'export const value = 1;\n'});
    const identity = {schemaVersion: 1, originalSha256: hash('original module'), recipeSha256: hash('module recipe')};
    const origin = {repository: 'https://example.test/source.git', projection: identity, path: '.', paths: null, excludeSnapshots: false};
    const saved = {key: hash(json(origin)), origin, digest: digest(files), files, dependencies: []};
    const archive = json(saved);
    const selected = {kind: 'git', repository: origin.repository, projection: identity, path: '.', destination: 'components/module'};
    const root = path.join(temp, 'edition');
    init(root);
    write(root, 'app.mjs', 'export const app = true;\n');
    const recipe = {schemaVersion: 1, id: 'owner/edition', toolchain: {id: 'runeditrun/edition-authoring', version: '1.1.0'}, parent: null, components: [
      {id: 'owner/edition', role: 'edition', source: {kind: 'local', paths: ['app.mjs']}},
      {id: 'shared/module', role: 'module', source: selected}]};
    write(root, 'edition.json', JSON.stringify(recipe));
    write(root, `.edition/sources/${saved.key}.json`, archive);
    write(root, 'sources.lock.json', json({schemaVersion: 1, edition: 'owner/edition', parent: null, components: [{id: 'shared/module', source: selected, baseline: {key: saved.key, digest: saved.digest, sha256: hash(archive)}}]}));
    commit(root);
    write(root, 'edition.json', JSON.stringify({...recipe, components: [recipe.components[0], {...recipe.components[1], source: {...selected, workspace: temp}}]}));
    assert.throws(() => cli(root, 'materialize', path.join(temp, 'build')), /Public projections cannot select workspace source/);
    write(root, 'edition.json', JSON.stringify(recipe));
    cli(root, 'lock');
    cli(root, 'promote', 'shared/module');
    const promoted = JSON.parse(fs.readFileSync(path.join(root, 'edition.json'))).components[1].source;
    assert.deepEqual(promoted, {kind: 'local', paths: ['components/module'], origin: {repository: origin.repository, projection: identity, path: '.'}});
    assert.equal(fs.readFileSync(path.join(root, 'components/module/logic.mjs'), 'utf8'), 'export const value = 1;\n');
    git(root, 'add', '-A');
    cli(root, 'lock'); commit(root);
    assert.equal(cli(root, 'check').ok, true);
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});
