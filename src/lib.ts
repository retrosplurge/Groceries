import { useCallback, useEffect, useState } from 'react'
import { db, type PriceLog, type Section, type Table } from './db'

/** Rows of one table for the household, kept live as either phone changes them. */
export function useTable<T>(table: Table, householdId: string) {
  const [rows, setRows] = useState<T[]>([])
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(async () => {
    try {
      setRows(await db.select<T>(table, householdId))
    } finally {
      setLoaded(true)
    }
  }, [table, householdId])
  useEffect(() => {
    refresh()
    const off = db.subscribe(table, householdId, refresh)
    // Catch up after the phone wakes or the tab comes back.
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      off()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [table, householdId, refresh])
  return { rows, loaded, refresh }
}

export function useLocalSetting(key: string, initial: string) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial
    } catch {
      return initial
    }
  })
  const set = (v: string) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      /* ignore */
    }
  }
  return [value, set] as const
}

export const DEFAULT_STORES = ['Aldi', 'Walmart', 'Target']

export function storeNames(data: { prices: PriceLog[] }) {
  return [...new Set([...DEFAULT_STORES, ...data.prices.map((p) => p.store)])]
}

/** Normalized name used to match an item to its price history: "Bananas " -> "banana". */
export function itemKey(name: string) {
  let k = name.trim().toLowerCase().replace(/\s+/g, ' ')
  if (k.length > 3 && k.endsWith('ies')) k = k.slice(0, -3) + 'y'
  else if (k.length > 3 && /(ches|shes|oes)$/.test(k)) k = k.slice(0, -2)
  else if (k.length > 3 && k.endsWith('s') && !k.endsWith('ss')) k = k.slice(0, -1)
  return k
}

const UNITS =
  'cups?|c\\.|tbsps?|tablespoons?|tsps?|teaspoons?|lbs?|pounds?|oz|ounces?|cans?|g|grams?|kg|ml|l|liters?|cloves?|pkgs?|packages?|bunch(?:es)?|heads?|slices?|sticks?|jars?|bottles?|bags?|boxes?|dozen|pinch|dash'
const QTY_RE = new RegExp(
  `^((?:\\d+\\s+)?[\\d./½¼¾⅓⅔]+(?:\\s*-\\s*[\\d./½¼¾]+)?\\s*(?:(?:${UNITS})\\.?(?=\\s))?)\\s*(?:of\\s+)?(.+)$`,
  'i',
)

/** "2 cups flour" -> { qty: "2 cups", name: "flour" } */
export function parseIngredient(line: string): { name: string; qty: string | null } {
  const t = line.trim().replace(/^[-*•]\s*/, '')
  const m = t.match(QTY_RE)
  const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1)
  if (m) return { qty: m[1].trim(), name: cap(m[2].trim()) }
  return { qty: null, name: cap(t) }
}

const SECTION_WORDS: Record<string, string[]> = {
  Produce: ['apple', 'banana', 'lettuce', 'tomato', 'onion', 'garlic', 'potato', 'carrot', 'celery', 'pepper', 'lemon', 'lime', 'avocado', 'spinach', 'berr', 'grape', 'orange', 'cilantro', 'parsley', 'basil', 'broccoli', 'cucumber', 'mushroom', 'zucchini', 'squash', 'kale', 'cabbage', 'corn', 'ginger', 'jalape', 'scallion', 'green onion', 'fruit', 'salad'],
  'Meat & Seafood': ['chicken', 'beef', 'pork', 'turkey', 'bacon', 'sausage', 'ham', 'steak', 'salmon', 'shrimp', 'fish', 'tuna', 'ground', 'lamb', 'tilapia', 'cod'],
  'Dairy & Eggs': ['milk', 'cheese', 'butter', 'yogurt', 'cream', 'egg', 'sour cream', 'cheddar', 'mozzarella', 'parmesan'],
  Frozen: ['frozen', 'ice cream', 'pizza'],
  Household: ['paper towel', 'toilet paper', 'soap', 'detergent', 'trash bag', 'foil', 'plastic wrap', 'sponge', 'bleach', 'cleaner', 'tissue', 'napkin', 'shampoo', 'toothpaste', 'deodorant', 'battery', 'batteries', 'light bulb', 'dish', 'laundry', 'diaper', 'wipes', 'ziploc', 'bags'],
  Pantry: ['flour', 'sugar', 'salt', 'oil', 'rice', 'pasta', 'bean', 'sauce', 'marinara', 'salsa', 'pasta', 'spaghetti', 'olive', 'broth', 'stock', 'spice', 'cereal', 'bread', 'tortilla', 'vinegar', 'honey', 'peanut butter', 'coffee', 'tea', 'can', 'soup', 'oat', 'cumin', 'paprika', 'oregano', 'cinnamon', 'vanilla', 'baking', 'chips', 'cracker', 'syrup', 'ketchup', 'mustard', 'mayo', 'noodle'],
}

/** Best-guess section for an item name, falling back to "Other". */
export function guessSection(name: string, sections: Section[], history?: Map<string, string>): string | null {
  const remembered = history?.get(itemKey(name))
  if (remembered && sections.some((s) => s.id === remembered)) return remembered
  const n = name.toLowerCase()
  for (const [section, words] of Object.entries(SECTION_WORDS)) {
    if (words.some((w) => n.includes(w))) {
      const s = sections.find((x) => x.name === section)
      if (s) return s.id
    }
  }
  return sections.find((s) => s.name === 'Other')?.id ?? sections[0]?.id ?? null
}

export interface PriceStats {
  latest: PriceLog
  /** Most recent price at each store. */
  byStore: Map<string, PriceLog>
  cheapest: PriceLog
}

export function priceStats(logs: PriceLog[]): Map<string, PriceStats> {
  const sorted = [...logs].sort((a, b) => b.logged_at.localeCompare(a.logged_at))
  const out = new Map<string, PriceStats>()
  for (const log of sorted) {
    let s = out.get(log.item_key)
    if (!s) {
      s = { latest: log, byStore: new Map(), cheapest: log }
      out.set(log.item_key, s)
    }
    if (!s.byStore.has(log.store)) {
      s.byStore.set(log.store, log)
      if (Number(log.price) < Number(s.cheapest.price)) s.cheapest = log
    }
  }
  return out
}

export const money = (n: number | string) => `$${Number(n).toFixed(2)}`

export function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

/** Local YYYY-MM-DD for a date. */
export function isoDay(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)) // Monday
  return x
}
