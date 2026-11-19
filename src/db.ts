import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type Table =
  | 'sections'
  | 'items'
  | 'recipes'
  | 'recipe_ingredients'
  | 'meal_plan'
  | 'price_logs'

export interface Section { id: string; household_id: string; name: string; sort: number }
export interface Item {
  id: string; household_id: string; section_id: string | null; recipe_id: string | null
  name: string; qty: string | null; checked: boolean; created_at: string
}
export interface Recipe { id: string; household_id: string; name: string; url: string | null; notes: string | null; created_at: string }
export interface Ingredient { id: string; household_id: string; recipe_id: string; name: string; qty: string | null }
export interface Meal { id: string; household_id: string; day: string; recipe_id: string | null; label: string | null; created_at: string }
export interface PriceLog {
  id: string; household_id: string; item_key: string; item_name: string
  store: string; price: number; logged_at: string
}
export interface Household { id: string; name: string; join_code: string }
export interface User { id: string; email: string }

/** The few operations the app needs, implemented by Supabase or by a local demo store. */
export interface Backend {
  mode: 'supabase' | 'demo'
  getUser(): Promise<User | null>
  onAuthChange(cb: (u: User | null) => void): () => void
  sendMagicLink(email: string): Promise<void>
  verifyCode(email: string, token: string): Promise<void>
  signOut(): Promise<void>
  myHousehold(): Promise<Household | null>
  createHousehold(displayName: string): Promise<void>
  joinHousehold(code: string, displayName: string): Promise<void>
  select<T>(table: Table, householdId: string): Promise<T[]>
  insert(table: Table, rows: Record<string, unknown>[]): Promise<void>
  update(table: Table, id: string, patch: Record<string, unknown>): Promise<void>
  remove(table: Table, ids: string[]): Promise<void>
  /** Calls cb whenever any row in the table changes (from either phone). */
  subscribe(table: Table, householdId: string, cb: () => void): () => void
}

// ---------- Supabase ----------

function supabaseBackend(sb: SupabaseClient): Backend {
  const toUser = (u: { id: string; email?: string } | null | undefined): User | null =>
    u ? { id: u.id, email: u.email ?? '' } : null
  const check = (error: { message: string } | null) => {
    if (error) throw new Error(error.message)
  }
  return {
    mode: 'supabase',
    async getUser() {
      const { data } = await sb.auth.getSession()
      return toUser(data.session?.user)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, s) => cb(toUser(s?.user)))
      return () => data.subscription.unsubscribe()
    },
    async sendMagicLink(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      check(error)
    },
    async verifyCode(email, token) {
      check((await sb.auth.verifyOtp({ email, token, type: 'email' })).error)
    },
    async signOut() {
      await sb.auth.signOut()
    },
    async myHousehold() {
      const { data, error } = await sb
        .from('household_members')
        .select('households(id, name, join_code)')
        .limit(1)
      check(error)
      const row = data?.[0] as unknown as { households: Household } | undefined
      return row?.households ?? null
    },
    async createHousehold(display) {
      check((await sb.rpc('create_household', { display })).error)
    },
    async joinHousehold(code, display) {
      check((await sb.rpc('join_household', { code, display })).error)
    },
    async select<T>(table: Table, householdId: string) {
      const { data, error } = await sb.from(table).select('*').eq('household_id', householdId)
      check(error)
      return (data ?? []) as T[]
    },
    async insert(table, rows) {
      if (rows.length) check((await sb.from(table).insert(rows)).error)
    },
    async update(table, id, patch) {
      check((await sb.from(table).update(patch).eq('id', id)).error)
    },
    async remove(table, ids) {
      if (ids.length) check((await sb.from(table).delete().in('id', ids)).error)
    },
    subscribe(table, householdId, cb) {
      const ch = sb
        .channel(`${table}-${householdId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter: `household_id=eq.${householdId}` },
          cb,
        )
        // Deletes don't carry household_id unless replica identity is full, so refetch on any delete.
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, cb)
        .subscribe()
      return () => {
        sb.removeChannel(ch)
      }
    },
  }
}

// ---------- Demo (this browser only, syncs across tabs) ----------

const DEMO_KEY = 'groceries-demo-v1'
type DemoData = Record<string, Record<string, unknown>[]>

function demoBackend(): Backend {
  const user: User = { id: 'demo-user', email: 'demo@example.com' }
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(DEMO_KEY) : null
  const listeners = new Set<(table: string) => void>()
  const load = (): DemoData => {
    try {
      return JSON.parse(localStorage.getItem(DEMO_KEY) || '{}')
    } catch {
      return {}
    }
  }
  const save = (d: DemoData, table: string) => {
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(d))
    } catch {
      /* storage unavailable: keep working in memory for this session */
    }
    listeners.forEach((l) => l(table))
    channel?.postMessage(table)
  }
  channel?.addEventListener('message', (e) => listeners.forEach((l) => l(e.data)))

  let memory: DemoData | null = null
  const data = () => (memory ??= load())

  const household = (): Household => {
    const d = data()
    let h = d.households?.[0] as unknown as Household | undefined
    if (!h) {
      h = { id: 'demo-household', name: 'Demo household', join_code: 'DEMO42' }
      d.households = [h as unknown as Record<string, unknown>]
      const names = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Pantry', 'Frozen', 'Household', 'Other']
      d.sections = names.map((name, i) => ({ id: crypto.randomUUID(), household_id: h!.id, name, sort: i + 1 }))
      save(d, 'sections')
    }
    return h
  }

  return {
    mode: 'demo',
    async getUser() { return user },
    onAuthChange() { return () => {} },
    async sendMagicLink() {},
    async verifyCode() {},
    async signOut() {},
    async myHousehold() { return household() },
    async createHousehold() { household() },
    async joinHousehold() { household() },
    async select<T>(table: Table, householdId: string) {
      memory = load()
      return (data()[table] ?? []).filter((r) => r.household_id === householdId) as T[]
    },
    async insert(table, rows) {
      const d = data()
      const now = new Date().toISOString()
      d[table] = [
        ...(d[table] ?? []),
        ...rows.map((r) => ({
          id: crypto.randomUUID(), created_at: now, ...(table === 'price_logs' ? { logged_at: now } : {}),
          ...(table === 'items' ? { checked: false } : {}), ...r,
        })),
      ]
      save(d, table)
    },
    async update(table, id, patch) {
      const d = data()
      d[table] = (d[table] ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r))
      save(d, table)
    },
    async remove(table, ids) {
      const d = data()
      const gone = new Set(ids)
      d[table] = (d[table] ?? []).filter((r) => !gone.has(r.id as string))
      if (table === 'recipes') {
        d.recipe_ingredients = (d.recipe_ingredients ?? []).filter((r) => !gone.has(r.recipe_id as string))
        d.meal_plan = (d.meal_plan ?? []).filter((r) => !gone.has(r.recipe_id as string))
        save(d, 'recipe_ingredients')
        save(d, 'meal_plan')
      }
      save(d, table)
    },
    subscribe(table, _householdId, cb) {
      const l = (t: string) => t === table && cb()
      listeners.add(l)
      return () => { listeners.delete(l) }
    },
  }
}

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const db: Backend = url && key ? supabaseBackend(createClient(url, key)) : demoBackend()
