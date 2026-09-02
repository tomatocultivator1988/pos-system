import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { sha256 } from '@/lib/crypto'

export async function GET() {
  try {
    // Catalog, recipes, and ingredient stock levels must not be public.
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get('cafe_session')
    if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const tokenHash = await sha256(sessionCookie.value)
    const authClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
    const { data: session } = await authClient
      .from('sessions')
      .select('user:users(id, role, is_active)')
      .eq('token_hash', tokenHash)
      .gte('expires_at', new Date().toISOString())
      .is('revoked_at', null)
      .single()
    const user = session?.user as { is_active?: boolean } | undefined
    if (!user || user.is_active === false) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Stock availability per menu item. Checkout consumes the variant recipe
    // when the chosen variant has one, otherwise the base recipe — so the
    // estimate must consider both (min servings across base + variant recipes).
    const { data: recipeLines } = await supabase
      .from('recipe_lines')
      .select('menu_item_id, menu_item_variant_id, addon_id, ingredient_id, quantity_required')
    const { data: ingredientObjs } = await supabase
      .from('ingredients')
      .select('id, quantity_on_hand')
    const stockMap = new Map((ingredientObjs || []).map((i: any) => [i.id, Number(i.quantity_on_hand)]))

    const servingsFor = (lines: any[]) => {
      let servings: number | null = null
      for (const r of lines) {
        const stock = stockMap.get(r.ingredient_id) ?? 0
        const s = Math.floor(stock / Number(r.quantity_required))
        servings = servings === null ? s : Math.min(servings, s)
      }
      return servings
    }

    const itemAvailability: Record<string, { servings: number | null; status: 'out' | 'low' | 'ok' }> = {}
    for (const mi of items || []) {
      const baseLines = (recipeLines || []).filter((r: any) => r.menu_item_id === mi.id && r.menu_item_variant_id === null && r.addon_id === null)
      const variantIds = new Set((variants || []).filter((v: any) => v.menu_item_id === mi.id && v.is_active).map((v: any) => v.id))
      const variantLines = (recipeLines || []).filter((r: any) => r.menu_item_variant_id !== null && variantIds.has(r.menu_item_variant_id))
      const baseServings = servingsFor(baseLines)
      const variantServings = servingsFor(variantLines)
      let servings: number | null = null
      if (baseServings !== null) servings = baseServings
      if (variantServings !== null) servings = servings === null ? variantServings : Math.min(servings, variantServings)
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
