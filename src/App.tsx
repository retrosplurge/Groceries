import { useEffect, useState } from 'react'
import { db, type Household, type Ingredient, type Item, type Meal, type PriceLog, type Recipe, type Section, type User } from './db'
import { useLocalSetting, useTable } from './lib'
import ListView from './views/ListView'
import RecipesView from './views/RecipesView'
import MealsView from './views/MealsView'
import PricesView from './views/PricesView'

export interface Data {
  householdId: string
  sections: Section[]
  items: Item[]
  recipes: Recipe[]
  ingredients: Ingredient[]
  meals: Meal[]
  prices: PriceLog[]
}

type Tab = 'list' | 'recipes' | 'meals' | 'prices'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'list', label: 'List', icon: '🛒' },
  { id: 'recipes', label: 'Recipes', icon: '📖' },
  { id: 'meals', label: 'Meals', icon: '📅' },
  { id: 'prices', label: 'Prices', icon: '🏷️' },
]

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined)
  const [authError] = useState(() => {
    // Supabase puts sign-in link problems (expired, already used) in the URL.
    const params = new URLSearchParams(window.location.hash.slice(1) + '&' + window.location.search.slice(1))
    return params.get('error_description')
  })
  useEffect(() => {
    withTimeout(db.getUser(), 15000)
      .then(setUser)
      .catch(() => setUser(null))
    return db.onAuthChange(setUser)
  }, [])

  if (user === undefined) return <div className="center muted">Signing in…</div>
  if (!user) return <SignIn linkError={authError} />
  return <HouseholdGate user={user} />
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('The server took too long to answer.')), ms)),
  ])
}

function SignIn({ linkError }: { linkError: string | null }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(linkError ? `That sign-in link didn't work (${linkError}).` : '')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') await db.signIn(email.trim(), password)
      else await db.signUp(email.trim(), password)
    } catch (err) {
      setError(friendly((err as Error).message))
    } finally {
      setBusy(false)
    }
  }
  const signup = mode === 'signup'
  return (
    <div className="center">
      <form className="card narrow" onSubmit={submit}>
        <h1>🛒 Groceries</h1>
        <p className="muted">{signup ? 'Create your account. You only do this once.' : 'Sign in to your shared list.'}</p>
        <label>Email</label>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <label>Password</label>
        <input
          type="password"
          required
          minLength={6}
          autoComplete={signup ? 'new-password' : 'current-password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="primary" type="submit" disabled={busy}>{signup ? 'Create account' : 'Sign in'}</button>
        {error && <p className="error">{error}</p>}
        <button type="button" className="link" onClick={() => { setMode(signup ? 'signin' : 'signup'); setError('') }}>
          {signup ? 'I already have an account' : 'New here? Create an account'}
        </button>
      </form>
    </div>
  )
}

function friendly(msg: string) {
  if (/invalid login credentials/i.test(msg)) return "That email and password don't match. New here? Create an account below."
  if (/already registered|already exists/i.test(msg)) return 'That email already has an account. Sign in instead.'
  if (/email not confirmed|confirm/i.test(msg))
    return 'Supabase is asking for email confirmation. Turn off "Confirm email" in Supabase (Authentication, Sign In / Providers, Email), then try again.'
  if (/rate limit/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.'
  return msg
}

function HouseholdGate({ user }: { user: User }) {
  const [household, setHousehold] = useState<Household | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const reload = () => {
    setError('')
    return withTimeout(db.myHousehold(), 15000)
      .then(setHousehold)
      .catch((e) => setError(e.message))
  }
  useEffect(() => {
    reload()
  }, [user.id])

  if (household === undefined)
    return (
      <div className="center">
        {error ? (
          <div className="card narrow">
            <p className="error">Couldn't load your household: {error}</p>
            <button className="primary" onClick={reload}>Try again</button>
            <button onClick={() => db.signOut()}>Sign out</button>
          </div>
        ) : (
          <div className="muted">Loading your list…</div>
        )}
      </div>
    )
  if (household) return <Main household={household} />

  const run = async (fn: () => Promise<void>) => {
    setError('')
    try {
      await fn()
      await reload()
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="center">
      <div className="card narrow">
        <h1>Welcome!</h1>
        <label>Your first name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Caleb" />
        <h2>Start a new shared list</h2>
        <button className="primary" disabled={!name} onClick={() => run(() => db.createHousehold(name))}>
          Create our household
        </button>
        <h2>…or join your partner's</h2>
        <p className="muted small">Ask them for the 6-letter code on their Settings screen.</p>
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
        <button disabled={!name || code.length < 6} onClick={() => run(() => db.joinHousehold(code, name))}>
          Join
        </button>
        {error && <p className="error">{error}</p>}
        <button className="link" onClick={() => db.signOut()}>Sign out ({user.email})</button>
      </div>
    </div>
  )
}

function Main({ household }: { household: Household }) {
  const id = household.id
  const [tab, setTab] = useLocalSetting('groceries-tab', 'list')
  const [showSettings, setShowSettings] = useState(false)
  const sections = useTable<Section>('sections', id)
  const items = useTable<Item>('items', id)
  const recipes = useTable<Recipe>('recipes', id)
  const ingredients = useTable<Ingredient>('recipe_ingredients', id)
  const meals = useTable<Meal>('meal_plan', id)
  const prices = useTable<PriceLog>('price_logs', id)

  const data: Data = {
    householdId: id,
    sections: [...sections.rows].sort((a, b) => a.sort - b.sort),
    items: items.rows,
    recipes: [...recipes.rows].sort((a, b) => a.name.localeCompare(b.name)),
    ingredients: ingredients.rows,
    meals: meals.rows,
    prices: prices.rows,
  }
  const go = (t: Tab) => setTab(t)

  return (
    <div className="app">
      <header>
        <h1>{TABS.find((t) => t.id === tab)?.label ?? 'Groceries'}</h1>
        <button className="icon" aria-label="Settings" onClick={() => setShowSettings(!showSettings)}>⚙️</button>
      </header>
      {db.mode === 'demo' && (
        <div className="banner">Demo mode: data is saved in this browser only. Open a second tab to see live sync.</div>
      )}
      {showSettings && <Settings household={household} onClose={() => setShowSettings(false)} />}
      <main>
        {tab === 'list' && <ListView data={data} />}
        {tab === 'recipes' && <RecipesView data={data} goToList={() => go('list')} />}
        {tab === 'meals' && <MealsView data={data} goToList={() => go('list')} />}
        {tab === 'prices' && <PricesView data={data} />}
      </main>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => go(t.id)}>
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function Settings({ household, onClose }: { household: Household; onClose: () => void }) {
  return (
    <div className="card settings">
      <p>
        Share code: <b className="code">{household.join_code}</b>
      </p>
      <p className="muted small">Your partner signs in, picks "join", and enters this code to share this list.</p>
      <div className="row">
        {db.mode === 'supabase' && <button onClick={() => db.signOut()}>Sign out</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </div>
  )
}
