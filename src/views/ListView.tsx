import { useState } from 'react'
import type { Data } from '../App'
import { addToList } from '../actions'
import { db, type Item } from '../db'
import { ago, storeNames, itemKey, money, priceStats, useLocalSetting, type PriceStats } from '../lib'

export default function ListView({ data }: { data: Data }) {
  const [name, setName] = useState('')
  const [qty, setQty] = useState('')
  const [section, setSection] = useState('auto')
  const [store, setStore] = useLocalSetting('groceries-store', '')
  const stats = priceStats(data.prices)
  const stores = storeNames(data)
  const recipeName = new Map(data.recipes.map((r) => [r.id, r.name]))

  const open = data.items.filter((i) => !i.checked)
  const cart = data.items.filter((i) => i.checked)

  let total = 0
  let priced = 0
  for (const i of data.items) {
    const s = stats.get(itemKey(i.name))
    const p = s && ((store && s.byStore.get(store)) || s.latest)
    if (p) {
      total += Number(p.price)
      priced++
    }
  }

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const n = await addToList(data, [{ name, qty, section_id: section === 'auto' ? undefined : section }])
    if (!n) alertInline(`"${name.trim()}" is already on the list`)
    setName('')
    setQty('')
  }
  const [notice, setNotice] = useState('')
  const alertInline = (msg: string) => {
    setNotice(msg)
    setTimeout(() => setNotice(''), 2500)
  }

  const bySection = data.sections
    .map((s) => ({ section: s, items: open.filter((i) => i.section_id === s.id) }))
    .concat([{ section: { id: '', name: 'Unsorted', sort: 99, household_id: '' }, items: open.filter((i) => !i.section_id || !data.sections.some((s) => s.id === i.section_id)) }])
    .filter((g) => g.items.length)

  return (
    <div>
      <div className="toolbar">
        <label className="inline">
          Shopping at
          <select value={store} onChange={(e) => setStore(e.target.value)}>
            <option value="">Any store</option>
            {stores.map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        {priced > 0 && (
          <div className="total" title={`${priced} of ${data.items.length} items have a price`}>
            Est. <b>{money(total)}</b>
            {priced < data.items.length && <span className="muted small"> ({priced}/{data.items.length} priced)</span>}
          </div>
        )}
      </div>

      <form className="add" onSubmit={add}>
        <input className="grow" placeholder="Add an item…" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="qty" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)} />
        <select value={section} onChange={(e) => setSection(e.target.value)} aria-label="Section">
          <option value="auto">Auto</option>
          {data.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button className="primary" type="submit">Add</button>
      </form>
      {notice && <p className="notice">{notice}</p>}

      {open.length === 0 && cart.length === 0 && (
        <p className="empty">Your list is empty. Add items above, or add a recipe's ingredients from Recipes or Meals.</p>
      )}

      {bySection.map(({ section: s, items }) => (
        <section key={s.id} className="group">
          <h3>{s.name}</h3>
          {items.map((i) => (
            <ItemRow key={i.id} item={i} stats={stats.get(itemKey(i.name))} store={store} recipe={i.recipe_id ? recipeName.get(i.recipe_id) : undefined} sections={data.sections} />
          ))}
        </section>
      ))}

      {cart.length > 0 && (
        <section className="group cart">
          <h3>
            In the cart ({cart.length})
            <button className="small" onClick={() => db.remove('items', cart.map((i) => i.id))}>Clear cart</button>
          </h3>
          <p className="muted small">Type what you paid to keep price history (optional).</p>
          {cart.map((i) => (
            <CartRow key={i.id} item={i} data={data} store={store} stores={stores} stats={stats.get(itemKey(i.name))} />
          ))}
        </section>
      )}
    </div>
  )
}

function PriceHint({ stats, store }: { stats?: PriceStats; store: string }) {
  if (!stats) return null
  const here = store ? stats.byStore.get(store) : undefined
  const shown = here ?? stats.latest
  const cheaper = stats.cheapest.store !== shown.store && Number(stats.cheapest.price) < Number(shown.price)
  return (
    <span className="price">
      {money(shown.price)} {shown.store}
      <span className="muted"> · {ago(shown.logged_at)}</span>
      {cheaper && <span className="deal"> · {money(stats.cheapest.price)} at {stats.cheapest.store}</span>}
    </span>
  )
}

function ItemRow({ item, stats, store, recipe, sections }: { item: Item; stats?: PriceStats; store: string; recipe?: string; sections: Data['sections'] }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="item">
      <input type="checkbox" checked={false} onChange={() => db.update('items', item.id, { checked: true })} aria-label={`Got ${item.name}`} />
      <div className="grow" onClick={() => setEditing(!editing)}>
        <div>
          {item.name}
          {item.qty && <span className="qtytag">{item.qty}</span>}
          {recipe && <span className="tag">{recipe}</span>}
        </div>
        <PriceHint stats={stats} store={store} />
        {editing && (
          <div className="row edit" onClick={(e) => e.stopPropagation()}>
            <select value={item.section_id ?? ''} onChange={(e) => db.update('items', item.id, { section_id: e.target.value || null })}>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input className="qty" defaultValue={item.qty ?? ''} placeholder="Qty" onBlur={(e) => db.update('items', item.id, { qty: e.target.value || null })} />
          </div>
        )}
      </div>
      <button className="icon" aria-label={`Remove ${item.name}`} onClick={() => db.remove('items', [item.id])}>✕</button>
    </div>
  )
}

function CartRow({ item, data, store, stores, stats }: { item: Item; data: Data; store: string; stores: string[]; stats?: PriceStats }) {
  const [price, setPrice] = useState('')
  const [at, setAt] = useState(store || stores[0])
  const key = itemKey(item.name)
  const today = new Date().toDateString()
  const loggedToday = data.prices.find((p) => p.item_key === key && new Date(p.logged_at).toDateString() === today)
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = parseFloat(price.replace('$', ''))
    if (!(n >= 0)) return
    await db.insert('price_logs', [{ household_id: data.householdId, item_key: key, item_name: item.name, store: store || at, price: n }])
    setPrice('')
  }
  return (
    <div className="item checked">
      <input type="checkbox" checked onChange={() => db.update('items', item.id, { checked: false })} aria-label={`Put back ${item.name}`} />
      <div className="grow">
        <div className="strike">{item.name}</div>
        {loggedToday ? (
          <span className="price">Price logged today: {money(loggedToday.price)} at {loggedToday.store}</span>
        ) : (
          <form className="row" onSubmit={save}>
            <input className="money" inputMode="decimal" placeholder={stats ? money(stats.latest.price) : '$0.00'} value={price} onChange={(e) => setPrice(e.target.value)} />
            {!store && (
              <select value={at} onChange={(e) => setAt(e.target.value)}>
                {stores.map((s) => <option key={s}>{s}</option>)}
              </select>
            )}
            {price && <button className="small primary" type="submit">Save</button>}
          </form>
        )}
      </div>
    </div>
  )
}
