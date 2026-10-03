'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

export async function getCategories() {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('menu_categories')
    .select('*')
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

export async function createCategory(data: { name: string; sort_order?: number }) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('menu_categories')
    .insert({ name: data.name, sort_order: data.sort_order ?? 0 })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateCategory(id: string, data: { name?: string; sort_order?: number; is_active?: boolean }) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('menu_categories')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function deleteCategory(id: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { error } = await supabase
    .from('menu_categories')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function getMenuItems(categoryId?: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase
    .from('menu_items')
    .select('*, menu_item_variants(*)')
    .eq('is_active', true)
    .order('sort_order')
  if (categoryId) query = query.eq('category_id', categoryId)
  const { data } = await query
  return data ?? []
}

export async function createMenuItem(data: {
  category_id: string; name: string; description?: string
  base_price: number; sort_order?: number; send_to_kds?: boolean
  loyalty_points_earned?: number; image_url?: string | null
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('menu_items')
    .insert({ ...data, description: data.description ?? '', sort_order: data.sort_order ?? 0, send_to_kds: data.send_to_kds ?? false })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateMenuItem(id: string, data: Partial<{
  category_id: string; name: string; description: string
  base_price: number; is_active: boolean; sort_order: number; send_to_kds: boolean
  loyalty_points_earned: number;   image_url: string | null
}>) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('menu_items')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function getVariants(menuItemId: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('menu_item_variants')
    .select('*')
    .eq('menu_item_id', menuItemId)
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
}

export async function createVariant(data: {
  menu_item_id: string; name: string; price_mode: 'override' | 'adjustment'
  price_override?: number; price_adjustment?: number; is_default?: boolean
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('menu_item_variants')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateVariant(id: string, data: Partial<{
  name: string; price_mode: 'override' | 'adjustment'
  price_override: number | null; price_adjustment: number | null
  is_default: boolean; is_active: boolean; sort_order: number
}>) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('menu_item_variants')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function deleteVariant(id: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { error } = await supabase
    .from('menu_item_variants')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  return { success: true }
}

export async function getAddonGroups(menuItemId: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('addon_groups')
    .select('*, addons(*)')
    .eq('menu_item_id', menuItemId)
    .eq('is_active', true)
    .order('sort_order')
  return (data as any[] ?? []).map((g: any) => ({
    ...g,
    addons: (g.addons || []).filter((a: any) => a.is_active !== false),
  }))
}

export async function createAddonGroup(data: {
  menu_item_id: string; name: string
  min_selections?: number; max_selections?: number; is_required?: boolean
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('addon_groups')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function deleteAddonGroup(id: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { error } = await supabase
    .from('addon_groups')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  return { success: true }
}

export async function createAddon(data: {
  addon_group_id: string; name: string; price_adjustment?: number; sort_order?: number
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('addons')
    .insert(data)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function updateAddon(id: string, data: Partial<{
  name: string
  price_adjustment: number
  is_active: boolean
  sort_order: number
}>) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data: result, error } = await supabase
    .from('addons')
    .update(data)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return result
}

export async function deleteAddon(id: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { error } = await supabase
    .from('addons')
    .update({ is_active: false })
    .eq('id', id)
  if (error) throw new Error(error.message)
  return { success: true }
}

export async function copyAddonsToMenuItems(params: {
  sourceMenuItemId: string
  targetMenuItemIds: string[]
  includeRecipes: boolean
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  if (!params.targetMenuItemIds || params.targetMenuItemIds.length === 0) {
    return { success: true, count: 0 }
  }

  // 1. Fetch source groups with active addons
  const { data: rawSourceGroups, error: groupsErr } = await supabase
    .from('addon_groups')
    .select('*, addons(*)')
    .eq('menu_item_id', params.sourceMenuItemId)
    .eq('is_active', true)
    .order('sort_order')

  if (groupsErr) throw new Error(groupsErr.message)

  const sourceGroups = (rawSourceGroups || []).map((g: any) => ({
    ...g,
    addons: (g.addons || []).filter((a: any) => a.is_active !== false),
  })).filter((g: any) => g.addons.length > 0)

  if (sourceGroups.length === 0) {
    throw new Error('No active add-ons to copy from this item.')
  }

  // 2. Fetch recipe lines for source addons if requested
  const sourceAddonIds = sourceGroups.flatMap((g: any) => g.addons.map((a: any) => a.id))
  const recipeMap: Record<string, { ingredient_id: string; quantity_required: number }[]> = {}

  if (params.includeRecipes && sourceAddonIds.length > 0) {
    const { data: lines, error: linesErr } = await supabase
      .from('recipe_lines')
      .select('addon_id, ingredient_id, quantity_required')
      .in('addon_id', sourceAddonIds)

    if (linesErr) throw new Error(linesErr.message)

    for (const r of lines || []) {
      if (!recipeMap[r.addon_id]) recipeMap[r.addon_id] = []
      recipeMap[r.addon_id].push({
        ingredient_id: r.ingredient_id,
        quantity_required: Number(r.quantity_required),
      })
    }
  }

  // 3. For each target item, deactivate existing addon groups and insert copied ones
  for (const targetId of params.targetMenuItemIds) {
    if (targetId === params.sourceMenuItemId) continue

    await supabase
      .from('addon_groups')
      .update({ is_active: false })
      .eq('menu_item_id', targetId)

    for (const sg of sourceGroups) {
      const { data: newGroup, error: ngErr } = await supabase
        .from('addon_groups')
        .insert({
          menu_item_id: targetId,
          name: sg.name,
          min_selections: sg.min_selections ?? 0,
          max_selections: sg.max_selections ?? 0,
          is_required: sg.is_required ?? false,
          sort_order: sg.sort_order ?? 0,
          is_active: true,
        })
        .select()
        .single()

      if (ngErr || !newGroup) continue

      for (const sa of sg.addons) {
        const { data: newAddon, error: naErr } = await supabase
          .from('addons')
          .insert({
            addon_group_id: newGroup.id,
            name: sa.name,
            price_adjustment: sa.price_adjustment ?? 0,
            sort_order: sa.sort_order ?? 0,
            is_active: true,
          })
          .select()
          .single()

        if (naErr || !newAddon) continue

        const recipes = recipeMap[sa.id] || []
        if (recipes.length > 0) {
          await supabase
            .from('recipe_lines')
            .insert(recipes.map(r => ({
              addon_id: newAddon.id,
              ingredient_id: r.ingredient_id,
              quantity_required: r.quantity_required,
            })))
        }
      }
    }
  }

  return { success: true, count: params.targetMenuItemIds.length }
}

export async function syncAddonRecipeToAllItems(params: {
  addonName: string
  lines: { ingredientId: string; quantity: number }[]
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  if (!params.addonName.trim()) {
    throw new Error('Addon name is required')
  }

  // Find all active addons with the same name (case-insensitive)
  const { data: matchingAddons, error: addErr } = await supabase
    .from('addons')
    .select('id, name')
    .ilike('name', params.addonName.trim())
    .eq('is_active', true)

  if (addErr) throw new Error(addErr.message)
  if (!matchingAddons || matchingAddons.length === 0) {
    return { success: true, count: 0 }
  }

  const addonIds = matchingAddons.map((a: any) => a.id)

  // Remove existing recipe_lines for these addons
  const { error: delErr } = await supabase
    .from('recipe_lines')
    .delete()
    .in('addon_id', addonIds)

  if (delErr) throw new Error(delErr.message)

  // Insert the new lines for all matching addons
  if (params.lines && params.lines.length > 0) {
    const toInsert = addonIds.flatMap((aid: string) =>
      params.lines.map((l: any) => ({
        addon_id: aid,
        ingredient_id: l.ingredientId,
        quantity_required: l.quantity,
      }))
    )

    const { error: insErr } = await supabase
      .from('recipe_lines')
      .insert(toInsert)

    if (insErr) throw new Error(insErr.message)
  }

  return { success: true, count: matchingAddons.length }
}

export async function getRecipeLines(params: {
  menuItemId: string
  scope: 'item' | 'variant' | 'addon'
  refId?: string
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  let query = supabase
    .from('recipe_lines')
    .select('ingredient_id, quantity_required, ingredients(name)')

  if (params.scope === 'variant') {
    query = query.eq('menu_item_variant_id', params.refId ?? '').is('addon_id', null)
  } else if (params.scope === 'addon') {
    query = query.eq('addon_id', params.refId ?? '').is('menu_item_variant_id', null)
  } else {
    query = query.eq('menu_item_id', params.menuItemId).is('menu_item_variant_id', null).is('addon_id', null)
  }

  const { data } = await query.order('created_at')
  return (data ?? []).map((r: any) => ({
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? 'Unknown',
    quantity_required: Number(r.quantity_required),
  }))
}

export type MenuItemRecipeCounts = {
  base: number
  variant: number
  addon: number
  total: number
}

export async function getRecipeCounts(): Promise<Record<string, MenuItemRecipeCounts>> {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('recipe_lines')
    .select('menu_item_id, menu_item_variant_id, addon_id, menu_item_variants(menu_item_id), addons(addon_groups(menu_item_id))')

  const counts: Record<string, MenuItemRecipeCounts> = {}
  for (const r of (data as any[]) ?? []) {
    let itemId = r.menu_item_id
    let type: 'base' | 'variant' | 'addon' = 'base'
    if (r.menu_item_variant_id) {
      itemId = r.menu_item_variants?.menu_item_id
      type = 'variant'
    } else if (r.addon_id) {
      itemId = r.addons?.addon_groups?.menu_item_id
      type = 'addon'
    }
    if (!itemId) continue
    if (!counts[itemId]) counts[itemId] = { base: 0, variant: 0, addon: 0, total: 0 }
    counts[itemId][type]++
    counts[itemId].total++
  }
  return counts
}

export async function getItemRecipeSummary(menuItemId: string) {
  await requireRole(['admin'])()
  const supabase = await createClient()

  const [{ data: vs }, { data: groups }] = await Promise.all([
    supabase.from('menu_item_variants').select('id').eq('menu_item_id', menuItemId),
    supabase.from('addon_groups').select('id, addons(id)').eq('menu_item_id', menuItemId).eq('is_active', true),
  ])

  const variantIds = (vs || []).map((v: any) => v.id)
  const addonIds = (groups || []).flatMap((g: any) => g.addons || []).map((a: any) => a.id)

  const orClauses = [`menu_item_id.eq.${menuItemId}`]
  if (variantIds.length > 0) orClauses.push(`menu_item_variant_id.in.(${variantIds.join(',')})`)
  if (addonIds.length > 0) orClauses.push(`addon_id.in.(${addonIds.join(',')})`)

  const { data: lines } = await supabase
    .from('recipe_lines')
    .select('ingredient_id, menu_item_id, menu_item_variant_id, addon_id')
    .or(orClauses.join(','))

  const baseCount = (lines || []).filter((l: any) => l.menu_item_id === menuItemId && !l.menu_item_variant_id && !l.addon_id).length
  const variantCounts: Record<string, number> = {}
  const addonCounts: Record<string, number> = {}

  for (const l of (lines as any[]) || []) {
    if (l.menu_item_variant_id) {
      variantCounts[l.menu_item_variant_id] = (variantCounts[l.menu_item_variant_id] || 0) + 1
    } else if (l.addon_id) {
      addonCounts[l.addon_id] = (addonCounts[l.addon_id] || 0) + 1
    }
  }

  return {
    baseCount,
    variantCounts,
    addonCounts,
  }
}

export async function upsertRecipeLines(params: {
  menuItemId: string
  scope: 'item' | 'variant' | 'addon'
  refId?: string
  lines: { ingredientId: string; quantity: number }[]
}) {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { error } = await supabase.rpc('upsert_recipe_lines_v1', {
    p_menu_item_id: params.menuItemId,
    p_scope: params.scope,
    p_ref_id: params.refId || null,
    p_lines: params.lines,
  })
  if (error) throw new Error(error.message)
}

export async function uploadMenuImage(formData: FormData) {
  await requireRole(['admin'])()
  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) throw new Error('No file provided')
  if (file.size === 0) throw new Error('File is empty')
  if (file.size > 5 * 1024 * 1024) throw new Error('File too large (max 5MB)')
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  if (!allowedTypes.includes(file.type)) throw new Error('Invalid file type')
  const ext = file.name.split('.').pop() || 'png'
  const filename = `${crypto.randomUUID()}.${ext}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('menu-images')
    .upload(filename, file, { contentType: file.type, upsert: true })
  if (error) throw new Error(error.message)
  const { data: { publicUrl } } = supabase.storage
    .from('menu-images')
    .getPublicUrl(data.path)
  return publicUrl
}

export async function deleteMenuImage(publicUrl: string) {
  await requireRole(['admin'])()
  const match = /\/menu-images\/([^?]+)/.exec(publicUrl)
  if (!match) return
  const supabase = await createClient()
  await supabase.storage.from('menu-images').remove([decodeURIComponent(match[1])])
}

export async function getInactiveMenuItems() {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data } = await supabase
    .from('menu_items')
    .select('*, menu_item_variants(*)')
    .eq('is_active', false)
    .order('sort_order')
  return data ?? []
}
