import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )

    const { data: categories } = await supabase
      .from('menu_categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    const { data: items } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    const { data: variants } = await supabase
      .from('menu_item_variants')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')

    const uniqueVariants = (variants || []).filter((v, i, arr) =>
      arr.findIndex(x =>
        x.menu_item_id === v.menu_item_id &&
        x.name === v.name &&
        x.price_mode === v.price_mode &&
        (x.price_override ?? 0) === (v.price_override ?? 0) &&
        (x.price_adjustment ?? 0) === (v.price_adjustment ?? 0)
      ) === i
    )

    const { data: addonGroups } = await supabase
      .from('addon_groups')
      .select('*, addons(*)')
      .eq('is_active', true)
      .order('sort_order')

    // Stock availability per menu item: min servings across its recipe (base
    // or default variant). undefined => no recipe configured (ignore).
    const { data: recipeLines } = await supabase
      .from('recipe_lines')
      .select('menu_item_id, menu_item_variant_id, addon_id, ingredient_id, quantity_required')
    const { data: ingredientObjs } = await supabase
      .from('ingredients')
      .select('id, quantity_on_hand')
    const stockMap = new Map((ingredientObjs || []).map((i: any) => [i.id, Number(i.quantity_on_hand)]))

    const itemAvailability: Record<string, { servings: number | null; status: 'out' | 'low' | 'ok' }> = {}
    for (const mi of items || []) {
      const recipes = (recipeLines || []).filter((r: any) => r.menu_item_variant_id === null && r.addon_id === null && r.menu_item_id === mi.id)
      let servings: number | null = null
      for (const r of recipes) {
        const stock = stockMap.get(r.ingredient_id) ?? 0
        const s = Math.floor(stock / Number(r.quantity_required))
        servings = servings === null ? s : Math.min(servings, s)
      }
      itemAvailability[mi.id] = {
        servings,
        status: servings === null || servings === undefined ? 'ok' : servings <= 0 ? 'out' : servings <= 5 ? 'low' : 'ok',
      }
    }

    return NextResponse.json({ categories: categories || [], items: items || [], variants: uniqueVariants, addonGroups: addonGroups || [], availability: itemAvailability })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to load menu', categories: [], items: [], variants: [], addonGroups: [] }, { status: 500 })
  }
}
