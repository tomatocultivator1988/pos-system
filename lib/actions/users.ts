'use server'

import { createClient } from '@/lib/supabase/server'
import { requireRole } from '@/lib/auth/session'
import bcrypt from 'bcryptjs'

export interface StaffUser {
  id: string
  name: string
  username: string
  role: 'admin' | 'cashier' | 'kds'
  is_active: boolean
  created_at: string
}

export async function getStaffList(): Promise<StaffUser[]> {
  await requireRole(['admin'])()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, name, username, role, is_active, created_at')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data as StaffUser[]) ?? []
}

export async function updateStaffName(userId: string, newName: string, newPassword?: string) {
  await requireRole(['admin'])()
  if (!userId) throw new Error('User ID is required')
  const trimmedName = newName.trim()
  if (!trimmedName) throw new Error('Name cannot be empty')

  const supabase = await createClient()
  const updateData: { name: string; password_hash?: string } = {
    name: trimmedName,
  }

  if (newPassword && newPassword.trim()) {
    updateData.password_hash = await bcrypt.hash(newPassword.trim(), 12)
  }

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId)

  if (error) throw new Error(error.message)
  return { success: true }
}
