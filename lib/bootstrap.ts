import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

async function sha256(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function bootstrapAdmin() {
  if (process.env.APP_ENV === 'production') {
    console.error('bootstrap-admin must not run in production')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { count } = await supabase.from('users').select('*', { count: 'exact', head: true })
  if (count && count > 0) {
    console.error('Admin already exists. Use --force to override.')
    process.exit(1)
  }

  const username = process.env.ADMIN_USERNAME || 'admin'
  const password = process.env.ADMIN_PASSWORD || 'admin123'
  const password_hash = await bcrypt.hash(password, 12)

  const { error } = await supabase.from('users').insert({
    name: 'Admin',
    username,
    password_hash,
    role: 'admin',
    is_active: true,
  })

  if (error) {
    console.error('Failed to create admin:', error.message)
    process.exit(1)
  }

  console.log(`Admin user created: ${username}`)
}

export async function seedDemoData() {
  if (process.env.APP_ENV === 'production') {
    console.error('Seed must not run in production')
    process.exit(1)
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  // Guard: skip if already seeded (categories exist)
  const { count: catCount } = await supabase.from('menu_categories').select('*', { count: 'exact', head: true })
  if (catCount && catCount > 0) {
    console.log('Seed data already exists, skipping.')
    return
  }

  // Business settings
  await supabase.from('business_settings').insert({
    business_name: 'Bean Brewyage',
    timezone: 'Asia/Manila',
    currency_code: 'PHP',
    business_day_cutoff_time: '00:00',
  }).maybeSingle()

  // Cashier
  const cashierHash = await bcrypt.hash('1234', 12)
  await supabase.from('users').insert({
    name: 'Cashier Juan',
    username: 'cashier1',
    password_hash: cashierHash,
    role: 'cashier',
    is_active: true,
  })

  // Categories
  const { data: cat1 } = await supabase.from('menu_categories').insert({ name: 'Coffee', sort_order: 1 }).select().single()
  const { data: cat2 } = await supabase.from('menu_categories').insert({ name: 'Pastries', sort_order: 2 }).select().single()

  let item: any
  let item2: any

  if (cat1) {
    const { data: i } = await supabase.from('menu_items').insert({
      category_id: cat1.id, name: 'Latte', base_price: 150, loyalty_points_earned: 5, is_active: true, send_to_kds: true, sort_order: 1
    }).select().single()
    item = i

    if (item) {
      const { data: variant } = await supabase.from('menu_item_variants').insert({
        menu_item_id: item.id, name: 'Small', price_mode: 'adjustment', price_adjustment: 0, is_default: true
      }).select().single()

      await supabase.from('menu_item_variants').insert({
        menu_item_id: item.id, name: 'Large', price_mode: 'adjustment', price_adjustment: 50
      })
    }

    const { data: i2 } = await supabase.from('menu_items').insert({
      category_id: cat1.id, name: 'Americano', base_price: 120, loyalty_points_earned: 3, is_active: true, send_to_kds: true, sort_order: 2
    }).select().single()
    item2 = i2

    if (item2) {
      await supabase.from('menu_item_variants').insert({
        menu_item_id: item2.id, name: 'Regular', price_mode: 'override', price_override: 120, is_default: true
      })
    }
  }

  if (cat2) {
    await supabase.from('menu_items').insert({
      category_id: cat2.id, name: 'Croissant', base_price: 80, loyalty_points_earned: 2, is_active: true, send_to_kds: false, sort_order: 1
    })
  }

  // Ingredients
  const { data: ing1 } = await supabase.from('ingredients').insert({
    name: 'Coffee Beans', base_unit: 'g', quantity_on_hand: 5000, reorder_level: 1000, weighted_average_unit_cost: 0.50
  }).select().single()

  const { data: ing2 } = await supabase.from('ingredients').insert({
    name: 'Milk', base_unit: 'ml', quantity_on_hand: 10000, reorder_level: 2000, weighted_average_unit_cost: 0.03
  }).select().single()

  // Recipes (base-item level)
  if (item) {
    await supabase.from('recipe_lines').insert([
      { menu_item_id: item.id, ingredient_id: ing1!.id, quantity_required: 20 },
      { menu_item_id: item.id, ingredient_id: ing2!.id, quantity_required: 200 },
    ])
  }
  if (item2) {
    await supabase.from('recipe_lines').insert([
      { menu_item_id: item2.id, ingredient_id: ing1!.id, quantity_required: 18 },
    ])
  }

  // Customers
  await supabase.from('customers').insert({
    member_number: 'MEM-0001', name: 'Maria Santos', mobile_number: '09171234567', loyalty_points_balance: 0
  })

  // Expense categories
  await supabase.from('expense_categories').insert({ name: 'Utilities', sort_order: 1 })
  await supabase.from('expense_categories').insert({ name: 'Supplies', sort_order: 2 })

  console.log('Demo data seeded')
}
