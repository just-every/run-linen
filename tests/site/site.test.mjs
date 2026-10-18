// The run site (run-linen.com) as `rer build --site` writes it: the homepage leads to /run, every page's links and files
// resolve inside the site, no page links an instance-only route, and the homepage shows the one-line start and nothing
// from a running installation (no loopback address, no RER_ output).
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = new URL('../..', import.meta.url).pathname
const site = join(root, 'dist/site')
const pages = dir => readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? pages(join(dir, entry.name)) : entry.name.endsWith('.html') ? [join(dir, entry.name)] : [])
const served = path => [path, `${path}.html`, join(path, 'index.html')].some(candidate => existsSync(join(site, candidate)) && !candidate.endsWith('/'))
const attrs = (html, name) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, 'gi'))].map(match => match[1].replaceAll('&amp;', '&'))

test('the run site builds, Run Linen opens /run, and every link and file it names resolves', () => {
  execFileSync(join(root, 'node_modules/.bin/rer'), ['build', '--site'], { cwd: root, stdio: 'pipe' })
  const home = readFileSync(join(site, 'index.html'), 'utf8')
  assert.match(home, /<a class="run-button" href="\/run">Run Linen/, 'the homepage leads with Run Linen to /run')
  assert.ok(home.includes('npx -y @runeditrun/rer dev <span class="nowrap">just-every/run-linen</span>'), 'the homepage shows the one-line start')
  assert.doesNotMatch(home, /localhost|127\.0\.0\.1|RER_[A-Z]/, 'the homepage shows nothing from a running installation')
  assert.ok(served('run') && served('docs'), '/run and /docs are built')
  const all = pages(site)
  for (const file of all) {
    const html = readFileSync(file, 'utf8'), where = relative(site, file)
    const refs = [...attrs(html, 'href'), ...attrs(html, 'src'), ...attrs(html, 'srcset').flatMap(set => set.split(',').map(part => part.trim().split(/\s+/)[0]))]
    for (const ref of refs.filter(ref => ref.startsWith('/') && !ref.startsWith('//'))) {
      const path = decodeURIComponent(ref.split(/[?#]/)[0])
      assert.doesNotMatch(path, /^\/(signin|login|sign-in|setup|app|auth)(\/|$)/, `${where} links the instance-only ${path}`)
      if (path !== '/') assert.ok(served(path), `${where} names ${path}, which the site does not serve`)
    }
  }
})
