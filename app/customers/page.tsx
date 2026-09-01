'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { getCustomers, createCustomer, adjustCustomerPoints } from '@/lib/actions/customers'
import { useAuth } from '@/lib/contexts/auth-context'
import { Plus, Search, Phone, Mail, X } from 'lucide-react'

interface Customer {
  id: string; member_number?: string; name: string
  mobile_number?: string; email?: string; loyalty_points_balance: number
  is_active: boolean; created_at: string; updated_at: string
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustMobile, setNewCustMobile] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustSaving, setNewCustSaving] = useState(false)

  const { currentStaff } = useAuth()
  const [adjustCustomer, setAdjustCustomer] = useState<Customer | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const data = await getCustomers()
        setCustomers(data)
      } catch { /* silently fail, show empty */ }
    })()
  }, [])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.mobile_number?.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const totalCustomers = customers.length
  const loyaltyMembers = customers.filter(c => c.loyalty_points_balance > 0).length

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Customer Management</h1>
          <p className="text-muted-foreground">View and manage customer profiles</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Total Customers</p>
            <p className="text-2xl font-semibold">{totalCustomers}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Loyalty Members</p>
            <p className="text-2xl font-semibold">{loyaltyMembers}</p>
          </div>
          <div className="bg-accent/10 border border-accent rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-accent mb-1">Average Loyalty Points</p>
            <p className="text-2xl font-semibold text-accent">
              {totalCustomers > 0 ? Math.round(customers.reduce((sum, c) => sum + c.loyalty_points_balance, 0) / totalCustomers) : 0}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <button onClick={() => {
              setNewCustName(''); setNewCustMobile(''); setNewCustEmail('')
              setShowNewCustomer(true)
            }} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90 active:scale-95 transition-all">
              <Plus className="w-4 h-4" />
              New Customer
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(customer => (
            <div key={customer.id} className="bg-card border border-border rounded-xl p-6 hover:border-accent transition-colors animate-fadeIn">
              <div className="mb-4">
                <h3 className="text-lg font-semibold mb-1">{customer.name}</h3>
                <p className="text-sm text-muted-foreground">{customer.member_number || 'No member number'}</p>
              </div>

              <div className="space-y-3 mb-4 pb-4 border-b border-border">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{customer.mobile_number || 'N/A'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-muted-foreground" />
                  <span className="truncate">{customer.email || 'N/A'}</span>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Loyalty Points:</span>
                  <span className="font-medium text-accent">{customer.loyalty_points_balance}</span>
                </div>
              </div>

              {currentStaff?.role === 'admin' && (
                <button
                  onClick={() => { setAdjustCustomer(customer); setAdjustDelta(''); setAdjustReason('') }}
                  className="w-full bg-muted text-foreground py-2 rounded-lg hover:bg-muted/80 text-sm font-medium transition-colors"
                >
                  Adjust Points
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Customer</h2>
              <button onClick={() => setShowNewCustomer(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Name *" value={newCustName} onChange={e => setNewCustName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              <input placeholder="Mobile Number" value={newCustMobile} onChange={e => setNewCustMobile(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              <input placeholder="Email" type="email" value={newCustEmail} onChange={e => setNewCustEmail(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowNewCustomer(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button>
              <button onClick={async () => {
                if (!newCustName.trim() || newCustSaving) return
                setNewCustSaving(true)
                try {
                  await createCustomer({ name: newCustName, mobile_number: newCustMobile || undefined, email: newCustEmail || undefined })
                  setShowNewCustomer(false)
                  const data = await getCustomers()
                  setCustomers(data)
                } catch { /* handle silently */ } finally { setNewCustSaving(false) }
              }} disabled={newCustSaving} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">{newCustSaving ? 'Creating...' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {adjustCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Adjust Points — {adjustCustomer.name}</h2>
              <button onClick={() => setAdjustCustomer(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">Current balance: <span className="font-medium text-accent">{adjustCustomer.loyalty_points_balance}</span></p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Points (+ to add, − to deduct)</label>
                <input
                  type="number"
                  placeholder="e.g. 10 or -5"
                  value={adjustDelta}
                  onChange={e => setAdjustDelta(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Reason (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. birthday bonus, manual correction"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setAdjustCustomer(null)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button>
              <button
                onClick={async () => {
                  const delta = parseInt(adjustDelta)
                  if (!delta || adjustSaving) return
                  setAdjustSaving(true)
                  try {
                    await adjustCustomerPoints(adjustCustomer.id, delta, adjustReason || undefined)
                    setAdjustCustomer(null)
                    const data = await getCustomers()
                    setCustomers(data)
                  } catch { /* handle silently */ } finally { setAdjustSaving(false) }
                }}
                disabled={adjustSaving}
                className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50"
              >
                {adjustSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
