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
  useEffect(() => {
    db.getUser().then(setUser)
    return db.onAuthChange(setUser)
  }, [])

  if (user === undefined) return <div className="center muted">Loading…</div>
  if (!user) return <SignIn />
  return <HouseholdGate user={user} />
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="center">
      <div className="card narrow">
        <h1>🛒 Groceries</h1>
        {sent ? (
          <p>Check <b>{email}</b> for a sign-in link. Open it on this phone.</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setError('')
              try {
                await db.sendMagicLink(email.trim())
                setSent(true)
              } catch (err) {
                setError((err as Error).message)
              }
            }}
          >
            <p className="muted">Sign in with your email. We'll send you a link, no password needed.</p>
            <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="primary" type="submit">Send sign-in link</button>
            {error && <p className="error">{error}</p>}
          </form>
        )}
      </div>
    </div>
  )
}

function HouseholdGate({ user }: { user: User }) {
  const [household, setHousehold] = useState<Household | null | undefined>(undefined)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const reload = () => db.myHousehold().then(setHousehold).catch((e) => setError(e.message))
  useEffect(() => {
    reload()
  }, [user.id])

  if (household === undefined) return <div className="center muted">Loading…</div>
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
