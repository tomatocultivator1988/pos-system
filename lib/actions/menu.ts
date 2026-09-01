'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'

export async function getCategories() {
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

export async function getMenuItems(categoryId?: string) {
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
  price_override: number; price_adjustment: number
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

export async function getAddonGroups(menuItemId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('addon_groups')
    .select('*, addons(*)')
    .eq('menu_item_id', menuItemId)
    .eq('is_active', true)
    .order('sort_order')
  return data ?? []
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

export async function getRecipeLines(params: {
  menuItemId: string
  scope: 'item' | 'variant' | 'addon'
  refId?: string
}) {
  const supabase = await createClient()
  let query = supabase
    .from('recipe_lines')
    .select('ingredient_id, quantity_required, ingredients(name)')
    .eq('menu_item_id', params.menuItemId)

  if (params.scope === 'variant') {
    query = query.eq('menu_item_variant_id', params.refId ?? '').is('addon_id', null)
  } else if (params.scope === 'addon') {
    query = query.eq('addon_id', params.refId ?? '').is('menu_item_variant_id', null)
  } else {
    query = query.is('menu_item_variant_id', null).is('addon_id', null)
  }

  const { data } = await query.order('created_at')
  return (data ?? []).map((r: any) => ({
    ingredient_id: r.ingredient_id,
    ingredient_name: r.ingredients?.name ?? 'Unknown',
    quantity_required: Number(r.quantity_required),
  }))
}

export async function getRecipeCounts() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('recipe_lines')
    .select('menu_item_id')
    .is('menu_item_variant_id', null)
    .is('addon_id', null)
  const counts: Record<string, number> = {}
  for (const r of data ?? []) {
    counts[r.menu_item_id] = (counts[r.menu_item_id] || 0) + 1
  }
  return counts
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
  const supabase = await createClient()
  const { data } = await supabase
    .from('menu_items')
    .select('*, menu_item_variants(*)')
    .eq('is_active', false)
    .order('sort_order')
  return data ?? []
}
