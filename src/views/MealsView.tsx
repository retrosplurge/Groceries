import { useState } from 'react'
import type { Data } from '../App'
import { addToList } from '../actions'
import { db } from '../db'
import { isoDay, startOfWeek } from '../lib'

export default function MealsView({ data, goToList }: { data: Data; goToList: () => void }) {
  const [offset, setOffset] = useState(0)
  const [notice, setNotice] = useState('')
  const start = startOfWeek(new Date())
  start.setDate(start.getDate() + offset * 7)
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
  const dayKeys = new Set(days.map(isoDay))
  const today = isoDay(new Date())
  const recipeName = new Map(data.recipes.map((r) => [r.id, r.name]))
  const weekMeals = data.meals.filter((m) => dayKeys.has(m.day))
  const weekRecipes = [...new Set(weekMeals.map((m) => m.recipe_id).filter(Boolean))] as string[]

  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString(undefined, o)

  const addWeek = async () => {
    const entries = data.ingredients
      .filter((i) => weekRecipes.includes(i.recipe_id))
      .map((i) => ({ name: i.name, qty: i.qty, recipe_id: i.recipe_id }))
    const n = await addToList(data, entries)
    setNotice(n ? `Added ${n} item${n === 1 ? '' : 's'} for this week's meals.` : 'Everything for this week is already on the list.')
    setTimeout(() => setNotice(''), 3500)
  }

  return (
    <div>
      <div className="row weeknav">
        <button aria-label="Previous week" onClick={() => setOffset(offset - 1)}>‹</button>
        <div className="grow centered">
          <b>Week of {fmt(start, { month: 'short', day: 'numeric' })}</b>
          {offset !== 0 && <button className="link" onClick={() => setOffset(0)}>This week</button>}
        </div>
        <button aria-label="Next week" onClick={() => setOffset(offset + 1)}>›</button>
      </div>
      <button className="primary wide" disabled={!weekRecipes.length} onClick={addWeek}>
        Add this week's ingredients to the list
      </button>
      {notice && (
        <p className="notice">
          {notice} <button className="link" onClick={goToList}>View list</button>
        </p>
      )}
      {data.recipes.length === 0 && <p className="muted small">Tip: save some recipes first so you can plan them here.</p>}
      {days.map((d) => {
        const key = isoDay(d)
        const meals = weekMeals.filter((m) => m.day === key).sort((a, b) => a.created_at.localeCompare(b.created_at))
        return (
          <div key={key} className={`day ${key === today ? 'today' : ''}`}>
            <div className="dayname">
              <b>{fmt(d, { weekday: 'short' })}</b>
              <span className="muted small">{fmt(d, { month: 'numeric', day: 'numeric' })}</span>
            </div>
            <div className="grow">
              {meals.map((m) => (
                <span key={m.id} className="chip">
                  {m.recipe_id ? recipeName.get(m.recipe_id) ?? 'Deleted recipe' : m.label}
                  <button aria-label="Remove" onClick={() => db.remove('meal_plan', [m.id])}>✕</button>
                </span>
              ))}
              <AddMeal data={data} day={key} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AddMeal({ data, day }: { data: Data; day: string }) {
  const [custom, setCustom] = useState<string | null>(null)
  const add = (fields: { recipe_id?: string; label?: string }) =>
    db.insert('meal_plan', [{ household_id: data.householdId, day, recipe_id: null, label: null, ...fields }])

  if (custom !== null)
    return (
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault()
          if (custom.trim()) add({ label: custom.trim() })
          setCustom(null)
        }}
      >
        <input autoFocus className="grow" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Leftovers, eat out…" />
        <button className="small primary" type="submit">Add</button>
      </form>
    )
  return (
    <select
      className="addmeal"
      value=""
      onChange={(e) => {
        const v = e.target.value
        if (v === '__custom') setCustom('')
        else if (v) add({ recipe_id: v })
      }}
    >
      <option value="">+ Add meal</option>
      {data.recipes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      <option value="__custom">Something else…</option>
    </select>
  )
}
