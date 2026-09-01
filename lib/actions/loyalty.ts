'use server'

import { createClient } from '@/lib/supabase/server'
import { getSession } from '@/lib/auth/session'

export async function getCustomerByPhone(phone: string) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const { data } = await supabase
    .from('customers')
    .select('*')
    .eq('mobile_number', phone)
    .single()

  return data
}

export async function createCustomer(data: {
  name: string
  mobile_number: string
  email?: string
}) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const memberNumber = `MEM-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`

  const { data: customer, error } = await supabase
    .from('customers')
    .insert({
      member_number: memberNumber,
      name: data.name,
      mobile_number: data.mobile_number,
      email: data.email,
      loyalty_points_balance: 0,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return customer
}

export async function getLoyaltyTransactions(customerId: string) {
  const user = await getSession()
  if (!user) throw new Error('Unauthorized')

  const supabase = await createClient()
  const { data } = await supabase
    .from('loyalty_transactions')
    .select('*, actor:users!loyalty_transactions_actor_user_id_fkey(name)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  return data || []
}
