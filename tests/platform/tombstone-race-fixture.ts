import type { Env } from '../../src/platform/types'

// Test-only scheduling barrier. Every statement/result still comes from real D1.
// The competing request commits its tombstone after guard construction, before SQL.
const barriers = new Map<string, { ready: boolean; released: boolean }>()
export function raceState(key: string) { return { ready: barriers.get(key)?.ready ?? false } }
export function releaseRace(key: string) { const barrier=barriers.get(key); if(barrier)barrier.released=true }
export function raceDatabase(db: Env['DB'], key: string, fragment: string): Env['DB'] {
 const barrier = { ready: false, released: false }; barriers.set(key, barrier)
 const originals = new WeakMap<object, D1PreparedStatement>()
 const queries = new WeakMap<object, string>()
 async function pause(sql: string) {
  if (!sql.includes(fragment) || barrier.ready) return
  barrier.ready = true
  const deadline=Date.now()+10000
  while(!barrier.released){if(Date.now()>deadline)throw Error('Race barrier timed out');await new Promise(resolve=>setTimeout(resolve,10))}
  barriers.delete(key)
 }
 function wrap(statement: D1PreparedStatement, sql: string): D1PreparedStatement {
  const proxy = new Proxy(statement, { get(target, prop) {
   if (prop === 'bind') return (...args: unknown[]) => wrap(target.bind(...args), sql)
   if (prop === 'run') return async () => { await pause(sql); return target.run() }
   const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value
  } })
  originals.set(proxy, statement); queries.set(proxy, sql); return proxy
 }
 return new Proxy(db, { get(target, prop) {
  if (prop === 'prepare') return (sql: string) => wrap(target.prepare(sql), sql)
  if (prop === 'batch') return async (statements: D1PreparedStatement[]) => {
   await pause(statements.map(s => queries.get(s) ?? '').join('\n'))
   return target.batch(statements.map(s => originals.get(s) ?? s))
  }
  const value = Reflect.get(target, prop); return typeof value === 'function' ? value.bind(target) : value
 } })
}
