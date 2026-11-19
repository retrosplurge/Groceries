import { useState } from 'react'
import type { Data } from '../App'
import { addToList } from '../actions'
import { db, type Recipe } from '../db'
import { parseIngredient } from '../lib'

export default function RecipesView({ data, goToList }: { data: Data; goToList: () => void }) {
  const [editing, setEditing] = useState<Recipe | 'new' | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')

  if (editing) return <RecipeForm data={data} recipe={editing === 'new' ? null : editing} done={() => setEditing(null)} />

  const shown = data.recipes.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()))
  const flash = (m: string) => {
    setNotice(m)
    setTimeout(() => setNotice(''), 3000)
  }

  return (
    <div>
      <div className="row">
        <input className="grow" placeholder="Search recipes…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="primary" onClick={() => setEditing('new')}>+ New recipe</button>
      </div>
      {notice && (
        <p className="notice">
          {notice} <button className="link" onClick={goToList}>View list</button>
        </p>
      )}
      {data.recipes.length === 0 && <p className="empty">Save the recipes you like here. Then add all their ingredients to the list with one tap.</p>}
      {shown.map((r) => {
        const ings = data.ingredients.filter((i) => i.recipe_id === r.id)
        const isOpen = open === r.id
        return (
          <div key={r.id} className="card recipe">
            <div className="row" onClick={() => setOpen(isOpen ? null : r.id)}>
              <div className="grow">
                <b>{r.name}</b>
                <div className="muted small">{ings.length} ingredients</div>
              </div>
              <button
                className="small primary"
                onClick={async (e) => {
                  e.stopPropagation()
                  const n = await addToList(data, ings.map((i) => ({ name: i.name, qty: i.qty, recipe_id: r.id })))
                  flash(n ? `Added ${n} item${n === 1 ? '' : 's'} from ${r.name}.` : `Everything for ${r.name} is already on the list.`)
                }}
              >
                Add to list
              </button>
            </div>
            {isOpen && (
              <div className="details">
                {r.url && <p><a href={r.url} target="_blank" rel="noreferrer">Open recipe ↗</a></p>}
                <ul>
                  {ings.map((i) => (
                    <li key={i.id}>
                      {i.qty && <span className="qtytag">{i.qty}</span>} {i.name}
                      <button className="icon small" aria-label={`Add ${i.name}`} onClick={async () => {
                        const n = await addToList(data, [{ name: i.name, qty: i.qty, recipe_id: r.id }])
                        flash(n ? `Added ${i.name}.` : `${i.name} is already on the list.`)
                      }}>+</button>
                    </li>
                  ))}
                </ul>
                {r.notes && <p className="notes">{r.notes}</p>}
                <div className="row">
                  <button onClick={() => setEditing(r)}>Edit</button>
                  <button className="danger" onClick={() => confirmDelete(r)}>Delete</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function confirmDelete(r: Recipe) {
  if (window.confirm(`Delete "${r.name}"? It will also be removed from the meal plan.`)) db.remove('recipes', [r.id])
}

function RecipeForm({ data, recipe, done }: { data: Data; recipe: Recipe | null; done: () => void }) {
  const existing = recipe ? data.ingredients.filter((i) => i.recipe_id === recipe.id) : []
  const [name, setName] = useState(recipe?.name ?? '')
  const [url, setUrl] = useState(recipe?.url ?? '')
  const [notes, setNotes] = useState(recipe?.notes ?? '')
  const [ings, setIngs] = useState(existing.map((i) => (i.qty ? `${i.qty} ${i.name}` : i.name)).join('\n'))
  const [saving, setSaving] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const id = recipe?.id ?? crypto.randomUUID()
      const fields = { name: name.trim(), url: url.trim() || null, notes: notes.trim() || null }
      if (recipe) await db.update('recipes', id, fields)
      else await db.insert('recipes', [{ id, household_id: data.householdId, ...fields }])
      await db.remove('recipe_ingredients', existing.map((i) => i.id))
      const rows = ings
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => ({ household_id: data.householdId, recipe_id: id, ...parseIngredient(l) }))
      await db.insert('recipe_ingredients', rows)
      done()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="card" onSubmit={save}>
      <h2>{recipe ? 'Edit recipe' : 'New recipe'}</h2>
      <label>Name</label>
      <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken tacos" />
      <label>Link (optional)</label>
      <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      <label>Ingredients, one per line</label>
      <textarea rows={8} value={ings} onChange={(e) => setIngs(e.target.value)} placeholder={'2 lb chicken thighs\n1 onion\n8 tortillas\n1 cup sour cream'} />
      <label>Notes (optional)</label>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="row">
        <button className="primary" type="submit" disabled={saving}>Save</button>
        <button type="button" onClick={done}>Cancel</button>
      </div>
    </form>
  )
}
