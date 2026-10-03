'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/app-layout'
import {
  getCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  reactivateCustomer,
  adjustCustomerPoints,
} from '@/lib/actions/customers'
import { useAuth } from '@/lib/contexts/auth-context'
import type { Customer } from '@/lib/types'
import {
  Plus,
  Search,
  Phone,
  Mail,
  X,
  Edit2,
  Trash2,
  RotateCcw,
  Calendar,
  ShoppingBag,
  UserCheck,
  UserX,
  AlertTriangle,
} from 'lucide-react'

function formatLastVisit(dateStr?: string | null): string {
  if (!dateStr) return 'Never'
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return 'Never'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffHours < 1) {
    const diffMins = Math.max(1, Math.floor(diffMs / (1000 * 60)))
    return `${diffMins}m ago`
  }
  if (diffHours < 24 && now.getDate() === date.getDate()) {
    return `Today, ${date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true })}`
  }
  if (diffDays === 1 || (diffHours < 48 && now.getDate() !== date.getDate())) {
    return 'Yesterday'
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`
  }
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  // Create modal state
  const [showNewCustomer, setShowNewCustomer] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustMobile, setNewCustMobile] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustSaving, setNewCustSaving] = useState(false)
  const [newCustError, setNewCustError] = useState('')

  // Edit modal state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [editName, setEditName] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState('')

  // Delete modal state
  const [deletingCustomer, setDeletingCustomer] = useState<Customer | null>(null)
  const [deleteSaving, setDeleteSaving] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Reactivate modal state
  const [reactivatingCustomer, setReactivatingCustomer] = useState<Customer | null>(null)
  const [reactivateSaving, setReactivateSaving] = useState(false)

  const { currentStaff } = useAuth()

  // Adjust points state
  const [adjustCustomer, setAdjustCustomer] = useState<Customer | null>(null)
  const [adjustDelta, setAdjustDelta] = useState('')
  const [adjustReason, setAdjustReason] = useState('')
  const [adjustSaving, setAdjustSaving] = useState(false)
  const [adjustError, setAdjustError] = useState('')

  const loadCustomersData = useCallback(async (inactiveState: boolean) => {
    setLoading(true)
    try {
      const data = await getCustomers({ showInactive: inactiveState })
      setCustomers(data)
    } catch {
      /* silently fail, show empty */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadCustomersData(showInactive)
  }, [loadCustomersData, showInactive])

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.member_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.mobile_number?.includes(searchTerm) ||
    c.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const activeCustomers = customers.filter(c => c.is_active)
  const totalCustomers = activeCustomers.length
  const loyaltyMembers = activeCustomers.filter(c => c.loyalty_points_balance > 0).length
  const totalVisits = activeCustomers.reduce((sum, c) => sum + (c.visit_count || 0), 0)

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c)
    setEditName(c.name || '')
    setEditMobile(c.mobile_number || '')
    setEditEmail(c.email || '')
    setEditError('')
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-6xl">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Customer Management</h1>
            <p className="text-muted-foreground">View and manage customer profiles, visit history, and loyalty</p>
          </div>
          <button
            onClick={() => {
              setNewCustName('')
              setNewCustMobile('')
              setNewCustEmail('')
              setNewCustError('')
              setShowNewCustomer(true)
            }}
            className="bg-accent text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all shadow-sm font-medium self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            New Customer
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Active Customers</p>
            <p className="text-2xl font-semibold">{totalCustomers}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Loyalty Members</p>
            <p className="text-2xl font-semibold">{loyaltyMembers}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Total Member Visits</p>
            <p className="text-2xl font-semibold">{totalVisits}</p>
          </div>
          <div className="bg-accent/10 border border-accent rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-accent mb-1">Average Loyalty Points</p>
            <p className="text-2xl font-semibold text-accent">
              {totalCustomers > 0 ? Math.round(activeCustomers.reduce((sum, c) => sum + c.loyalty_points_balance, 0) / totalCustomers) : 0}
            </p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search by name, member ID, phone, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowInactive(!showInactive)}
              className={`px-3 py-2 border rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                showInactive
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {showInactive ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
              {showInactive ? 'Showing Inactive Members' : 'Show Inactive Members'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Loading customers...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border rounded-2xl text-muted-foreground">
            {searchTerm ? 'No customers found matching your search.' : showInactive ? 'No inactive customers found.' : 'No active customers registered yet.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(customer => {
              const isInactive = !customer.is_active
              return (
                <div
                  key={customer.id}
                  className={`bg-card border rounded-xl p-5 hover:border-accent transition-all flex flex-col justify-between ${
                    isInactive ? 'opacity-70 bg-muted/20 border-destructive/30' : 'border-border'
                  }`}
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-semibold leading-tight">{customer.name}</h3>
                          {isInactive && (
                            <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-destructive/10 text-destructive border border-destructive/20">
                              Inactive
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{customer.member_number || 'No ID'}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          title="Edit Customer Info"
                          onClick={() => openEditModal(customer)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {currentStaff?.role === 'admin' && (
                          isInactive ? (
                            <button
                              title="Reactivate Member"
                              onClick={() => setReactivatingCustomer(customer)}
                              className="p-1.5 rounded-md hover:bg-green-100 text-green-700 transition-colors"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              title="Deactivate Member"
                              onClick={() => {
                                setDeletingCustomer(customer)
                                setDeleteError('')
                              }}
                              className="p-1.5 rounded-md hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    </div>

                    {/* Contact Info */}
                    <div className="space-y-1.5 mb-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-foreground font-mono text-xs">{customer.mobile_number || 'No contact number'}</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate text-foreground text-xs">{customer.email || 'No email registered'}</span>
                      </div>
                    </div>

                    {/* CRM Visit Stats: Visits & Last Visit */}
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/40 border border-border/50 text-xs mb-3">
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">Total Visits</span>
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <ShoppingBag className="w-3.5 h-3.5 text-accent shrink-0" />
                          <span>{customer.visit_count ?? 0} {(customer.visit_count === 1) ? 'visit' : 'visits'}</span>
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[11px] mb-0.5">Last Visit</span>
                        <span
                          className="font-semibold text-foreground flex items-center gap-1.5"
                          title={customer.last_visit_at ? new Date(customer.last_visit_at).toLocaleString('en-PH') : undefined}
                        >
                          <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{formatLastVisit(customer.last_visit_at)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Loyalty Points */}
                    <div className="flex justify-between items-center text-sm py-1 border-t border-border/60">
                      <span className="text-xs text-muted-foreground">Loyalty Points:</span>
                      <span className="font-bold text-accent">{customer.loyalty_points_balance} pts</span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  {currentStaff?.role === 'admin' && (
                    <div className="mt-3 pt-2 border-t border-border/60 flex gap-2">
                      <button
                        onClick={() => {
                          setAdjustCustomer(customer)
                          setAdjustDelta('')
                          setAdjustReason('')
                          setAdjustError('')
                        }}
                        className="w-full bg-muted text-foreground py-1.5 rounded-lg hover:bg-muted/80 text-xs font-medium transition-colors"
                      >
                        Adjust Points
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New Customer Modal */}
      {showNewCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New Customer Registration</h2>
              <button onClick={() => setShowNewCustomer(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Customer Name *</label>
                <input
                  placeholder="e.g. Maria Santos"
                  value={newCustName}
                  onChange={e => setNewCustName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Contact Number</label>
                <input
                  placeholder="e.g. 09171234567"
                  value={newCustMobile}
                  onChange={e => setNewCustMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Email Address</label>
                <input
                  placeholder="e.g. maria@gmail.com"
                  type="email"
                  value={newCustEmail}
                  onChange={e => setNewCustEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowNewCustomer(false)} className="px-4 py-2 rounded-lg bg-muted text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!newCustName.trim() || newCustSaving) return
                  setNewCustSaving(true)
                  setNewCustError('')
                  try {
                    await createCustomer({
                      name: newCustName.trim(),
                      mobile_number: newCustMobile.trim() || undefined,
                      email: newCustEmail.trim() || undefined,
                    })
                    setShowNewCustomer(false)
                    await loadCustomersData(showInactive)
                  } catch (e: any) {
                    setNewCustError(e.message || 'Failed to create customer')
                  } finally {
                    setNewCustSaving(false)
                  }
                }}
                disabled={newCustSaving || !newCustName.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
              >
                {newCustSaving ? 'Registering...' : 'Register'}
              </button>
            </div>
            {newCustError && <p className="text-xs text-destructive mt-3">{newCustError}</p>}
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold">Edit Customer Profile</h2>
                <p className="text-xs text-muted-foreground font-mono">{editingCustomer.member_number}</p>
              </div>
              <button onClick={() => setEditingCustomer(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Customer Name *</label>
                <input
                  placeholder="Customer Name"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Contact Number</label>
                <input
                  placeholder="e.g. 09171234567"
                  value={editMobile}
                  onChange={e => setEditMobile(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Email Address</label>
                <input
                  placeholder="e.g. customer@gmail.com"
                  type="email"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setEditingCustomer(null)} className="px-4 py-2 rounded-lg bg-muted text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editName.trim() || editSaving) return
                  setEditSaving(true)
                  setEditError('')
                  try {
                    await updateCustomer(editingCustomer.id, {
                      name: editName.trim(),
                      mobile_number: editMobile.trim() || undefined,
                      email: editEmail.trim() || undefined,
                    })
                    setEditingCustomer(null)
                    await loadCustomersData(showInactive)
                  } catch (e: any) {
                    setEditError(e.message || 'Failed to update customer')
                  } finally {
                    setEditSaving(false)
                  }
                }}
                disabled={editSaving || !editName.trim()}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
            {editError && <p className="text-xs text-destructive mt-3">{editError}</p>}
          </div>
        </div>
      )}

      {/* Delete / Deactivate Customer Modal */}
      {deletingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center gap-3 mb-4 text-destructive">
              <div className="p-2.5 rounded-full bg-destructive/10">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Deactivate Member?</h2>
                <p className="text-xs text-muted-foreground">{deletingCustomer.name} ({deletingCustomer.member_number})</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
              Are you sure you want to deactivate this member profile? They will no longer appear in POS checkout or active member listings.
            </p>
            <p className="text-xs text-muted-foreground bg-muted/50 p-2.5 rounded-lg mb-6">
              ℹ Past order history, receipts, and financial audit logs will remain completely intact. You can view or reactivate this member anytime using &quot;Show Inactive Members&quot;.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeletingCustomer(null)}
                className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deleteSaving) return
                  setDeleteSaving(true)
                  setDeleteError('')
                  try {
                    await deleteCustomer(deletingCustomer.id)
                    setDeletingCustomer(null)
                    await loadCustomersData(showInactive)
                  } catch (e: any) {
                    setDeleteError(e.message || 'Failed to deactivate member')
                  } finally {
                    setDeleteSaving(false)
                  }
                }}
                disabled={deleteSaving}
                className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {deleteSaving ? 'Deactivating...' : 'Deactivate Member'}
              </button>
            </div>
            {deleteError && <p className="text-xs text-destructive mt-3">{deleteError}</p>}
          </div>
        </div>
      )}

      {/* Reactivate Member Modal */}
      {reactivatingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center gap-3 mb-4 text-green-600">
              <div className="p-2.5 rounded-full bg-green-100">
                <RotateCcw className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Reactivate Member?</h2>
                <p className="text-xs text-muted-foreground">{reactivatingCustomer.name} ({reactivatingCustomer.member_number})</p>
              </div>
            </div>

            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              This will restore <span className="font-semibold text-foreground">{reactivatingCustomer.name}</span> as an active member. They will immediately become available in POS checkout and active customer lists.
            </p>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReactivatingCustomer(null)}
                className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (reactivateSaving) return
                  setReactivateSaving(true)
                  try {
                    await reactivateCustomer(reactivatingCustomer.id)
                    setReactivatingCustomer(null)
                    await loadCustomersData(showInactive)
                  } catch {
                    /* handle error if needed */
                  } finally {
                    setReactivateSaving(false)
                  }
                }}
                disabled={reactivateSaving}
                className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {reactivateSaving ? 'Reactivating...' : 'Reactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjust Points Modal */}
      {adjustCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl animate-fadeIn">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Adjust Points — {adjustCustomer.name}</h2>
              <button onClick={() => setAdjustCustomer(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Current balance: <span className="font-medium text-accent">{adjustCustomer.loyalty_points_balance} pts</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Points (+ to add, − to deduct)</label>
                <input
                  type="number"
                  placeholder="e.g. 10 or -5"
                  value={adjustDelta}
                  onChange={e => setAdjustDelta(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Reason (optional)</label>
                <input
                  type="text"
                  placeholder="e.g. birthday bonus, manual correction"
                  value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setAdjustCustomer(null)} className="px-4 py-2 rounded-lg bg-muted text-sm font-medium">
                Cancel
              </button>
              <button
                onClick={async () => {
                  const delta = Number(adjustDelta)
                  if (adjustSaving) return
                  if (!adjustDelta.trim() || !Number.isInteger(delta) || delta === 0) {
                    setAdjustError('Enter a non-zero whole number, e.g. 10 or -5')
                    return
                  }
                  setAdjustSaving(true)
                  setAdjustError('')
                  try {
                    await adjustCustomerPoints(adjustCustomer.id, delta, adjustReason || undefined)
                    setAdjustCustomer(null)
                    await loadCustomersData(showInactive)
                  } catch (e: any) {
                    setAdjustError(e.message || 'Failed to adjust points')
                  } finally {
                    setAdjustSaving(false)
                  }
                }}
                disabled={adjustSaving}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium disabled:opacity-50"
              >
                {adjustSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
            {adjustError && <p className="text-xs text-destructive mt-3">{adjustError}</p>}
          </div>
        </div>
      )}
    </AppLayout>
  )
}
