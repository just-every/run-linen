import type { Env } from './types'

/** Wraps env.DB so the caller learns whether anything run through it changed a row.
 * Statements keep their own results; only meta.changes and meta.rows_written are read. */
export function trackWrites(env: Env) {
  const state = { wrote: false }
  const note = (meta?: { changes?: number; rows_written?: number }) => {
    if ((meta?.changes ?? 0) > 0 || (meta?.rows_written ?? 0) > 0) state.wrote = true
  }
  const raw = new WeakMap<object, D1PreparedStatement>()
  const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
    const proxy: D1PreparedStatement = new Proxy(statement, {
      get(target, key) {
        if (key === 'bind') return (...values: unknown[]) => wrap(target.bind(...values))
        if (key === 'run' || key === 'all') return async () => { const result = await (target as any)[key](); note(result.meta); return result }
        const value = (target as any)[key]
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    raw.set(proxy, statement)
    return proxy
  }
  const DB: D1Database = new Proxy(env.DB, {
    get(target, key) {
      if (key === 'prepare') return (sql: string) => wrap(target.prepare(sql))
      if (key === 'batch') return async (list: D1PreparedStatement[]) => {
        const results = await target.batch(list.map(statement => raw.get(statement) ?? statement))
        for (const result of results) note(result.meta)
        return results
      }
      const value = (target as any)[key]
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return { env: { ...env, DB } as Env, get wrote() { return state.wrote } }
}
