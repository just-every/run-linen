import { realpath, lstat, readFile, writeFile, mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, relative, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const hash = x => createHash('sha256').update(x).digest('hex');
const check = (v, m) => {
    if (!v)
        throw Error(m);
};
async function command(argv, cwd, options = {}) {
    return new Promise((ok, no) => {
        let output = '', size = 0;
        const p = spawn(argv[0], argv.slice(1), { cwd, env: { PATH: process.env.PATH, HOME: options.home || cwd, TMPDIR: options.temp || tmpdir(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'], timeout: options.timeout || 60000 });
        const collect = b => {
            size += b.length;
            if (size < 1000000)
                output += b;
            else
                p.kill('SIGKILL');
        };
        p.stdout.on('data', collect);
        p.stderr.on('data', collect);
        p.on('error', no);
        p.on('exit', (exitCode, signal) => ok({ exitCode, signal, output }));
    });
}
async function git(cwd, ...args) {
    const r = await command(['git', '-c', 'core.hooksPath=/dev/null', ...args], cwd);
    check(r.exitCode === 0, `git ${args[0]} failed: ${r.output}`);
    return r.output.trim();
}
async function safePath(root, path) {
    check(typeof path === 'string' && path.length && !path.startsWith('/') && !path.split('/').some(p => p === '..' || p === '.git' || p === ''), 'Path escape denied');
    const dest = resolve(root, path);
    check(relative(root, dest) && !relative(root, dest).startsWith('..'), 'Path escape denied');
    let parent = root;
    for (const part of path.split('/')) {
        parent = join(parent, part);
        try {
            const st = await lstat(parent);
            check(!st.isSymbolicLink(), 'Symlink escape denied');
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
    return dest;
}
function permitted(path, allowed) {
    return allowed.some(a => a.endsWith('/') ? path.startsWith(a) : path === a);
}
async function sandbox(argv, cwd, temp) {
    let executable = argv[0];
    if (!executable.includes('/')) {
        let found;
        for (const dir of (process.env.PATH || '').split(':')) {
            const candidate = join(dir, executable);
            try {
                await access(candidate);
                found = candidate;
                break;
            }
            catch {
            }
        }
        check(found, 'Granted executable unavailable');
        executable = found;
    }
    executable = await realpath(executable);
    argv = [executable, ...argv.slice(1)];
    if (process.platform === 'darwin') {
        const esc = s => s.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
        const profile = `(version 1)(deny default)(allow process*)(allow sysctl-read)(allow file-read-metadata)(allow file-read* (require-all (require-not (subpath "/Users")) (require-not (subpath "/private/tmp")) (require-not (subpath "/private/var/folders"))))(allow file-read* (subpath "${esc(cwd)}") (subpath "${esc(temp)}") (subpath "${esc(dirname(executable))}"))(allow file-write* (subpath "${esc(cwd)}") (subpath "${esc(temp)}") (literal "/dev/null"))(deny network*)`;
        return command(['/usr/bin/sandbox-exec', '-p', profile, ...argv], cwd, { temp, home: temp });
    }
    if (process.platform === 'linux') {
        const mounts = [];
        for (const dir of ['/usr', '/bin', '/lib', '/lib64', '/sbin', dirname(executable)]) {
            try {
                await access(dir);
                mounts.push('--ro-bind', dir, dir);
            }
            catch {
            }
        }
        return command(['bwrap', '--die-with-parent', '--unshare-all', ...mounts, '--bind', cwd, cwd, '--bind', temp, temp, '--proc', '/proc', '--dev', '/dev', '--chdir', cwd, ...argv], cwd, { temp, home: temp });
    }
    throw Error('OS execution sandbox required');
}
export async function runEngineeringJob({ job, grant, receiptDirectory, authorize, design }) {
    const config = grant.config, repo = await realpath(config.repository);
    check(repo === resolve(config.repository), 'Repository symlink denied');
    check(await git(repo, 'rev-parse', '--show-toplevel') === repo, 'Exact owned repository required');
    check(await git(repo, 'rev-parse', 'HEAD') === config.baseCommit, 'Source pin changed');
    check((await git(repo, 'status', '--porcelain')) === '', 'Owned repository must be clean');
    check(Array.isArray(config.allowedPaths) && Array.isArray(config.independentPaths), 'Explicit path grants required');
    check(/^refs\/heads\/[a-zA-Z0-9/_-]+$/.test(config.releaseRef), 'Invalid release ref');
    const root = await realpath(await mkdtemp(join(tmpdir(), 'linen-engineering-'))), work = join(root, 'work'), independent = join(root, 'independent'), scratch = join(root, 'scratch');
    await mkdir(scratch);
    const receipt = { jobId: job.id, grantId: grant.id, grantVersion: grant.version, state: 'running', baseCommit: config.baseCommit, commands: [], startedAt: new Date().toISOString() };
    await mkdir(receiptDirectory, { recursive: true });
    const path = join(receiptDirectory, job.id + '.json');
    const persist = () => writeFile(path, JSON.stringify(receipt, null, 2), { mode: 0o600 });
    const auth = async () => {
        check(await authorize({ jobId: job.id, grantId: grant.id, grantVersion: grant.version }), 'Engineering grant revoked');
        await persist();
    };
    try {
        await auth();
        await git(root, 'clone', '--no-hardlinks', '--no-local', repo, work);
        await git(work, 'checkout', '--detach', config.baseCommit);
        const run = async (phase, cwd = work) => {
            await auth();
            const argv = config.commands[phase];
            check(Array.isArray(argv) && argv.length && argv.every(a => typeof a === 'string'), 'Granted command missing');
            const before = Date.now();
            const result = await sandbox(argv, cwd, scratch);
            receipt.commands.push({ phase, argv, exitCode: result.exitCode, signal: result.signal, output: result.output, elapsedMs: Date.now() - before });
            await persist();
            return result;
        };
        const reproducer = await run('reproducer');
        check(Number.isInteger(reproducer.exitCode) && reproducer.exitCode !== 0, 'Reproducer must demonstrate failure before edits');
        let edits = job.spec.edits;
        if (!edits?.length) {
            check(typeof design === 'function', 'Configured real engineering model required');
            const files = [];
            for (const file of config.contextPaths) {
                const target = await safePath(work, file);
                let content;
                try {
                    content = await readFile(target, 'utf8');
                }
                catch (e) {
                    if (e.code !== 'ENOENT')
                        throw e;
                    content = '';
                }
                check(content.length <= 40000, 'Engineering context too large');
                files.push({ path: file, content, sha256: hash(content) });
            }
            await auth();
            const proposal = await design(files);
            edits = proposal.edits;
            receipt.modelAttemptId = proposal.attemptId;
            await persist();
        }
        check(Array.isArray(edits) && edits.length > 0, 'No engineering edits');
        for (const e of edits) {
            await auth();
            check(permitted(e.path, config.allowedPaths), 'Edit outside granted paths');
            check(!config.independentPaths.some(p => e.path === p || e.path.startsWith(p + '/')), 'Independent checks cannot be edited');
            const target = await safePath(work, e.path);
            let before;
            try {
                before = await readFile(target);
            }
            catch (err) {
                if (err.code !== 'ENOENT')
                    throw err;
                before = Buffer.alloc(0);
            }
            check(hash(before) === e.beforeSha256, 'Edit preimage mismatch');
            await mkdir(dirname(target), { recursive: true });
            await writeFile(target, e.content);
        }
        check((await run('test')).exitCode === 0, 'Tests failed');
        await git(work, 'add', '--all');
        receipt.diff = await git(work, 'diff', '--cached', '--binary');
        check(receipt.diff.length > 0, 'No real patch');
        const changed = (await git(work, 'diff', '--cached', '--name-only')).split('\n');
        check(changed.every(p => permitted(p, config.allowedPaths) && !config.independentPaths.some(q => p === q || p.startsWith(q + '/'))), 'Command changed ungranted files');
        await git(work, '-c', 'user.name=Linen engineering', '-c', 'user.email=linen@localhost', 'commit', '-m', `Linen engineering ${job.id}`);
        receipt.commit = await git(work, 'rev-parse', 'HEAD');
        await git(root, 'clone', '--no-local', work, independent);
        check((await run('check', independent)).exitCode === 0, 'Independent check failed');
        check((await git(independent, 'status', '--porcelain')) === '', 'Independent check mutated source');
        check((await run('canary')).exitCode === 0, 'Canary failed');
        check((await run('release')).exitCode === 0, 'Release command failed');
        check(await git(work, 'rev-parse', 'HEAD') === receipt.commit && (await git(work, 'status', '--porcelain')) === '', 'Release changed validated source');
        await auth();
        check(await git(repo, 'rev-parse', 'HEAD') === config.baseCommit && (await git(repo, 'status', '--porcelain')) === '', 'Owner repository changed');
        await git(repo, 'fetch', work, receipt.commit);
        let old = '';
        try {
            old = await git(repo, 'rev-parse', '--verify', config.releaseRef);
        }
        catch {
        }
        await git(repo, 'update-ref', config.releaseRef, receipt.commit, old || '0000000000000000000000000000000000000000');
        receipt.adoptedRef = config.releaseRef;
        check((await run('adoption', independent)).exitCode === 0, 'Adoption observation failed');
        check(await git(repo, 'rev-parse', config.releaseRef) === receipt.commit, 'Adopted version mismatch');
        receipt.state = 'adopted';
        receipt.finishedAt = new Date().toISOString();
        await persist();
        return receipt;
    }
    catch (e) {
        receipt.state = receipt.adoptedRef ? 'unknown' : 'failed';
        receipt.error = e.message;
        receipt.finishedAt = new Date().toISOString();
        await persist();
        return receipt;
    }
    finally {
        await rm(root, { recursive: true, force: true });
    }
}
