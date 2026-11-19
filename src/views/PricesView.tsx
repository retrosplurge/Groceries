import { useState } from 'react'
import type { Data } from '../App'
import { addToList } from '../actions'
import { db } from '../db'
import { ago, itemKey, money, priceStats, storeNames } from '../lib'

export default function PricesView({ data }: { data: Data }) {
  const [query, setQuery] = useState('')
  const [item, setItem] = useState('')
  const [store, setStore] = useState('')
  const [price, setPrice] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const stats = priceStats(data.prices)
  const stores = storeNames(data)
  const onList = new Set(data.items.filter((i) => !i.checked).map((i) => itemKey(i.name)))

  const log = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(price.replace('$', ''))
    if (!item.trim() || !store.trim() || !(n >= 0)) return
    await db.insert('price_logs', [
      { household_id: data.householdId, item_key: itemKey(item), item_name: item.trim(), store: store.trim(), price: n },
    ])
    setItem('')
    setPrice('')
  }

  const rows = [...stats.entries()]
    .filter(([, s]) => s.latest.item_name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a[1].latest.item_name.localeCompare(b[1].latest.item_name))

  return (
    <div>
      <form className="card logprice" onSubmit={log}>
        <b>Log a price</b>
        <div className="row wrap">
          <input className="grow" placeholder="Item" value={item} onChange={(e) => setItem(e.target.value)} list="known-items" />
          <input className="store" placeholder="Store" value={store} onChange={(e) => setStore(e.target.value)} list="stores" />
          <input className="money" inputMode="decimal" placeholder="$0.00" value={price} onChange={(e) => setPrice(e.target.value)} />
          <button className="primary" type="submit">Save</button>
        </div>
        <datalist id="stores">{stores.map((s) => <option key={s} value={s} />)}</datalist>
        <datalist id="known-items">
          {[...new Set([...data.items.map((i) => i.name), ...data.prices.map((p) => p.item_name)])].map((n) => <option key={n} value={n} />)}
        </datalist>
      </form>

      <p className="muted small">
        Prices come from what you two log. Check items off in the store and type what you paid, or log one here.
      </p>
      {stats.size > 6 && <input placeholder="Search prices…" value={query} onChange={(e) => setQuery(e.target.value)} />}
      {stats.size === 0 && <p className="empty">No prices yet.</p>}

      {rows.map(([key, s]) => {
        const storeRows = [...s.byStore.values()].sort((a, b) => Number(a.price) - Number(b.price))
        const history = data.prices.filter((p) => p.item_key === key).sort((a, b) => b.logged_at.localeCompare(a.logged_at))
        return (
          <div key={key} className="card priceitem">
            <div className="row" onClick={() => setOpen(open === key ? null : key)}>
              <b className="grow">{s.latest.item_name}</b>
              {onList.has(key) ? (
                <span className="muted small">On list</span>
              ) : (
                <button className="small" onClick={(e) => { e.stopPropagation(); addToList(data, [{ name: s.latest.item_name }]) }}>+ List</button>
              )}
            </div>
            <div className="stores">
              {storeRows.map((p, idx) => (
                <span key={p.store} className={idx === 0 && storeRows.length > 1 ? 'best' : ''}>
                  {p.store} <b>{money(p.price)}</b> <span className="muted small">{ago(p.logged_at)}</span>
                </span>
              ))}
            </div>
            {open === key && (
              <ul className="history">
                {history.map((p) => (
                  <li key={p.id}>
                    {new Date(p.logged_at).toLocaleDateString()} · {p.store} · {money(p.price)}
                    <button className="icon small" aria-label="Delete entry" onClick={() => db.remove('price_logs', [p.id])}>✕</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
