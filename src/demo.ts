import { verifyOwnerClaim, OwnerClaimError } from './modules/owner-claim/index.mjs'
import { readInput } from './modules/operator-auth/input.mjs'
import { operatorAuth, originBindings } from './platform/base-auth/service'
import { nativeAccounts } from './platform/base-auth/accounts'
import { nativeStore } from './platform/base-auth/store'
import type { Env } from './platform/types'
import type { WorkContext } from './features/work/core'
import { seedDemoModel } from './demo/model'
import { seedDemoWork } from './demo/work'
import { seedDemoDecisionHolder } from './demo/people'
import { upsertPerson, acquireAsset } from './features/work/resources'
import { saveArticle } from './features/work/knowledge'
import { createCatalogItem } from './features/work/requests'
import { create, list } from './features/services/store'
import { newDecision } from './features/services/decisions'

/** Each demo uses its own session secret to derive its private connection key. */
export async function demoBindings(env: Env): Promise<Env> {
 if (env.RER_DEMO !== '1') return env
 const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('linen-demo-connections:' + env.SESSION_SECRET)))
 return { ...env, ENCRYPTION_KEY: btoa(String.fromCharCode(...bytes)) }
}

export async function demoOwner(env: Env) {
 return (await nativeAccounts(nativeStore(env)).owner())?.email ?? null
}

/** Only the demo accepts this transport; ordinary Linen keeps its existing auth routes. */
export async function demoOwnerClaim(request: Request, input: Env): Promise<Response | null> {
 if (input.RER_DEMO !== '1' || new URL(request.url).pathname !== '/auth/owner-claim') return null
 const env = originBindings(input), headers = { 'cache-control': 'no-store' }
 if (request.method !== 'POST' || request.headers.get('origin') !== env.AUTH_ORIGIN || new URL(request.url).search)
  return Response.json({ error: 'invalid_request' }, { status: 403, headers })
 try {
  const data = await readInput(request)
  await verifyOwnerClaim(data.token, {
   issuer: env.RER_OWNER_CLAIM_ISSUER!, installationId: env.RER_OWNER_CLAIM_INSTALLATION_ID!,
   appOrigin: env.AUTH_ORIGIN!, expectedEmail: env.OWNER_EMAIL!,
   publicKeys: JSON.parse(env.RER_OWNER_CLAIM_PUBLIC_KEYS ?? 'null'),
  })
  // Base verifies the signature; Linen's existing atomic bootstrap admits exactly
  // one owner and issues its native session. A replay cannot claim it again.
  const result = await operatorAuth(env).bootstrap(request, { token: env.SETUP_TOKEN!, displayName: data.displayName ?? 'Alex Morgan', returnTo: '/app' })
  return new Response(null, { status: 303, headers: { ...headers, 'set-cookie': result.cookie, location: result.returnTo } })
 } catch (error) {
  const known = error as { status?: number; code?: string }
  return Response.json({ error: known.code ?? 'claim_unavailable' }, { status: error instanceof OwnerClaimError ? error.status : known.status ?? 503, headers })
 }
}

/** A fictional service desk, created through Linen's normal domain operations. */
export async function seedDemo(env: Env, { ownerEmail, now }: { ownerEmail: string; now: Date }) {
 if (env.RER_DEMO !== '1') return
 env = await demoBindings(env)
 const owner = await nativeStore(env).byEmail(ownerEmail)
 if (!owner) throw Error('Demo owner is missing')
 const ctx: WorkContext = { env, principal: { userId: owner.id, workspaceId: owner.workspaceId, roles: ['owner'] } }
 await Promise.all([seedDemoModel(ctx, now), seedDemoDecisionHolder(ctx, ownerEmail, now)])
 const db = env.DB, w = owner.workspaceId, day = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString()
 const exists = (table: string, field: string, value: string) => db.prepare(`SELECT 1 FROM ${table} WHERE workspace_id=? AND ${field}=?`).bind(w, value).first()
 const people = ['Priya Shah', 'Jordan Lee', 'Samira Khan', 'Theo Bennett', 'Maya Chen', 'Oliver Brooks', 'Amelia Wilson', 'Noah Patel']
 await Promise.all(people.map(async (name, index) => {
  if (!await exists('work_people', 'source_id', `northstar-${index}`))
   await upsertPerson(ctx, { source: 'Northstar team directory · demo sample', sourceId: `northstar-${index}`, name, effectiveAt: day(-30 - index), observedAt: day(-1) })
 }))
 const requests = [
  ['Priya needs Figma for the brand refresh', 'Please arrange a Figma seat for Priya before the brand workshop tomorrow. The design team has confirmed the project budget.', 'request'],
  ['Jordan cannot connect to the office VPN', 'Jordan can sign in, but the VPN disconnects after a minute on the office Wi-Fi. Started this morning after the laptop update.', 'incident'],
  ['Prepare Samira’s first day', `Samira joins the customer team on ${day(4).slice(0, 10)}. Please prepare a laptop, email and the shared support workspace.`, 'request'],
  ['Theo needs access to the revenue dashboard', 'Theo is covering the weekly operations report. Read-only dashboard access is enough until the end of this month.', 'request'],
  ['Maya’s meeting room camera is intermittent', 'The camera in the Aspen room cuts out during video calls. Maya has tried a second cable; audio still works.', 'incident'],
  ['Replace Oliver’s damaged laptop charger', 'Oliver’s USB-C charger has a damaged cable. A replacement can be collected from the Denver front desk tomorrow.', 'request'],
  ['Amelia’s invoice export is timing out', 'The finance export completes for small date ranges but times out for the full quarter. Amelia needs it for Friday’s close.', 'incident'],
  ['Return Noah’s loan laptop', 'Noah’s repaired laptop is ready. Arrange the handover and collect the loan device so custody stays accurate.', 'request'],
  ['Add a shared mailbox for the workshop', 'The customer workshop needs a shared mailbox for three organizers. Keep access limited to the workshop team.', 'request'],
  ['Guest Wi-Fi is slow in Denver', 'Guests on level two report slow browsing. Staff Wi-Fi is unaffected. Please compare the access points before changing settings.', 'incident'],
  ['Renew the design team’s software seats', 'The design subscription renews next month. Confirm the current roster and unused seats before committing to another year.', 'request'],
  ['Archive the completed project workspace', 'The Harbor launch has finished. Confirm retention with the project lead before removing collaborator access.', 'request'],
 ]
 for (const [index, location] of ['Denver front desk', 'Austin supply room', 'Denver front desk', 'Portland studio'].entries()) {
  const serial = `NST-LT-${2401 + index}`
  if (!await exists('work_assets', 'serial', serial)) await acquireAsset(ctx, { serial, source: 'Demo sample · stocktake', location })
 }
 for (const [name, kind, target, capacity] of [ ['Figma design seat', 'software', 'Design workspace', 3], ['Revenue dashboard', 'access', 'Read-only revenue reports', 20], ['Loan laptop', 'device', 'Northstar loan pool', 2], ['Shared mailbox', 'access', 'Workshop organisers', 5], ['Replacement charger', 'device', 'Denver charger stock', 8], ['Project workspace archive', 'access', 'Project retention and access', 20] ] as const) {
  if (!await exists('work_catalog', 'name', name)) await createCatalogItem(ctx, { name, kind, target, capacity, ownerId: owner.id, requiresManager: true })
 }
 for (const [title, body] of [
  ['Connect to the office VPN', 'Open your approved VPN client and select Northstar. Use your work account and approve the sign-in prompt. If the connection drops, include the time and network name in your request. Never share your password or recovery codes.'],
  ['Borrow a laptop for a few days', 'Ask in Linen with your collection location and return date. The service desk will confirm availability and record the handover. A request alone does not reserve a device.'],
  ['Request access to a shared workspace', 'Describe the work you need to do, the workspace and when access should end. Linen keeps the purpose, responsible owner and required decision in one conversation.'],
  ['Before returning a device', 'Save your work to the approved team drive, sign out of personal accounts and bring the charger. The service desk records receipt before custody changes.'],
 ]) {
  if (!await exists('work_knowledge', 'title', title)) await saveArticle(ctx, { title, body, scope: 'employees', expiresAt: day(90), review: true })
 }
 let services = await list(db, ctx.principal, 'service')
 for (const [name, description, businessImpact] of [
  ['Team collaboration', 'Shared workspaces, email and video meetings.', 'Keeps customer and delivery teams working together.'],
  ['Office connectivity', 'Office Wi-Fi and secure remote access.', 'Reliable access for Denver, Austin and Portland.'],
  ['Business reporting', 'Revenue dashboards and finance exports.', 'Timely weekly reporting and month-end close.'],
 ]) if (!services.some(s => s.data.name === name)) await create(db, ctx.principal, 'service', { name, description, businessImpact, source: 'Demo sample · service review', observedAt: day(-1), freshnessMs: 604800000 }, { visibility: 'workspace' })
 services = await list(db, ctx.principal, 'service')
 await seedDemoWork(ctx, requests, people, now)
 const decisions = await list(db, ctx.principal, 'decision')
 for (const [title, quote, impact] of [
  ['Choose the design renewal term', 'Twelve monthly seats cost $180 per month. An annual commitment saves $360, with no refund for unused seats.', 'The design roster may change after the launch.'],
  ['Choose the Denver meeting room repair window', 'The replacement camera is available tomorrow. Installation needs a 45-minute room closure.', 'A morning repair would move the customer workshop to another room.'],
 ]) if (!decisions.some(d => d.data.title === title)) await newDecision(db, ctx.principal, { title, contextId: services[0].id, holderId: owner.id, holderRoles: ['owner'], quote, quoteSource: 'Demo sample · supplier planning note', terms: 'Planning only; no supplier order has been placed.', cohorts: ['Northstar team'], impact, reversibility: 'The choice can be revised before any order or change is authorized.', deadline: day(2), uncertainty: 'Supplier availability must be checked before execution.', options: [{ id: 'flexible', label: 'Keep flexibility', consequences: 'Retain the current arrangement while the team confirms its needs.' }, { id: 'commit', label: 'Commit to the proposed plan', consequences: 'Proceed with planning; any external effect still needs its own current authority.' }], recommendation: 'flexible' })
 await db.prepare('INSERT INTO platform_first_run VALUES(1,?,?) ON CONFLICT(singleton) DO NOTHING').bind(owner.id, now.getTime()).run()
}
