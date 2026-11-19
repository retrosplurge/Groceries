import type { Data } from './App'
import { db } from './db'
import { guessSection, itemKey } from './lib'

/** Remembers which section each item was last put in, so re-adding it lands in the same place. */
export function sectionHistory(data: Data) {
  const m = new Map<string, string>()
  const sorted = [...data.items].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const i of sorted) if (i.section_id) m.set(itemKey(i.name), i.section_id)
  return m
}

/**
 * Adds items to the shopping list, skipping ones already on it and unchecked.
 * Returns how many were added.
 */
export async function addToList(
  data: Data,
  entries: { name: string; qty?: string | null; recipe_id?: string | null; section_id?: string | null }[],
) {
  const onList = new Set(data.items.filter((i) => !i.checked).map((i) => itemKey(i.name)))
  const history = sectionHistory(data)
  const rows = []
  for (const e of entries) {
    const key = itemKey(e.name)
    if (!key || onList.has(key)) continue
    onList.add(key)
    rows.push({
      household_id: data.householdId,
      name: e.name.trim(),
      qty: e.qty || null,
      recipe_id: e.recipe_id ?? null,
      section_id: e.section_id ?? guessSection(e.name, data.sections, history),
    })
  }
  await db.insert('items', rows)
  return rows.length
}
