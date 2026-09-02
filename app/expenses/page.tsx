'use client'

import { useEffect, useState } from 'react'
import AppLayout from '@/components/app-layout'
import { getExpenseCategories, createExpense, getExpenses } from '@/lib/actions/expenses'
import { formatPHP } from '@/lib/currency'
import { getBusinessDate } from '@/lib/business-date'
import { useModal } from '@/lib/contexts/modal-context'
import { Plus, Receipt } from 'lucide-react'
import { PAYMENT_METHODS, paymentLabel } from '@/lib/utils/payment-methods'

interface ExpenseCategory { id: string; name: string }
interface Expense {
  id: string; description: string; amount: number; expense_date: string
  business_date: string; payment_method?: string; reference_number?: string
  notes?: string; created_at: string; expense_category?: { name?: string } | null
}

export default function ExpensesPage() {
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [categoryId, setCategoryId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [expenseDate, setExpenseDate] = useState(getBusinessDate())
  const [paymentMethod, setPaymentMethod] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const { showConfirmation, hideConfirmation } = useModal()

  const load = async () => {
    try {
      setLoading(true)
      setLoadError(null)
      const [cats, list] = await Promise.all([getExpenseCategories(), getExpenses()])
      setCategories(cats as ExpenseCategory[])
      setExpenses(list as Expense[])
      if (cats.length > 0) setCategoryId(prev => prev || (cats[0] as ExpenseCategory).id)
    } catch (e: any) {
      setLoadError(e.message || 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const save = async () => {
    if (saving) return
    const amt = parseFloat(amount)
    if (!categoryId) { setFormError('Select a category'); return }
    if (!description.trim()) { setFormError('Description is required'); return }
    if (!amt || amt <= 0) { setFormError('Amount must be greater than 0'); return }
    setSaving(true)
    setFormError('')
    try {
      await createExpense({
        expense_category_id: categoryId,
        description: description.trim(),
        amount: amt,
        expense_date: expenseDate || undefined,
        payment_method: paymentMethod || undefined,
        reference_number: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      })
      setFormOpen(false)
      setAmount(''); setDescription(''); setReference(''); setNotes(''); setPaymentMethod('')
      await load()
    } catch (e: any) {
      setFormError(e.message || 'Failed to record expense')
    } finally { setSaving(false) }
  }

  const removeConfirm = () => {
    showConfirmation({
      title: 'Clear Form',
      description: 'Clear the expense form? Nothing has been saved yet.',
      confirmText: 'Clear', cancelText: 'Keep editing', isDestructive: false,
      onConfirm: () => {
        setFormOpen(false); setAmount(''); setDescription(''); setReference(''); setNotes('')
        setPaymentMethod(''); setFormError('')
        hideConfirmation()
      },
    })
  }

  const total = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <AppLayout>
      <div className="p-8 max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold mb-2">Expenses</h1>
            <p className="text-muted-foreground">Record operating expenses — these feed the Expenses report</p>
          </div>
          <button onClick={() => { setFormOpen(v => !v); setFormError('') }} className="bg-accent text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:opacity-90">
            <Plus className="w-4 h-4" /> New Expense
          </button>
        </div>

        {loading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />)}</div>
        ) : loadError ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{loadError}</p>
            <button onClick={load} className="bg-accent text-white px-4 py-2 rounded-lg">Retry</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Total Recorded</p>
                <p className="text-2xl font-semibold text-destructive">{formatPHP(total)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Entries</p>
                <p className="text-2xl font-semibold">{expenses.length}</p>
              </div>
            </div>

            {formOpen && (
              <div className="bg-card border border-border rounded-2xl p-6 mb-6">
                <h2 className="text-lg font-semibold mb-4">New Expense</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium block mb-1">Category *</label>
                    <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm">
                      {categories.length === 0 && <option value="">No categories yet</option>}
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Amount (₱) *</label>
                    <input type="number" step="0.01" min="0" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-medium block mb-1">Description *</label>
                    <input placeholder="e.g. Meralco bill — August" value={description} onChange={e => setDescription(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Expense Date</label>
                    <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Payment Method</label>
                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm">
                      <option value="">—</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{paymentLabel(m)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Reference #</label>
                    <input placeholder="e.g. OR-1234" value={reference} onChange={e => setReference(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Notes</label>
                    <input placeholder="Optional" value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm" />
                  </div>
                </div>
                {formError && <p className="text-sm text-destructive mt-3">{formError}</p>}
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={removeConfirm} className="px-4 py-2 rounded-lg bg-muted text-sm">Cancel</button>
                  <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-accent text-white text-sm disabled:opacity-50">{saving ? 'Saving...' : 'Save Expense'}</button>
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-left">Category</th>
                    <th className="px-4 py-3 text-left">Method</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground"><Receipt className="w-8 h-8 mx-auto mb-2 opacity-40" />No expenses recorded yet</td></tr>
                  ) : expenses.slice(0, 100).map(e => (
                    <tr key={e.id} className="border-b border-border hover:bg-muted/50">
                      <td className="px-4 py-3 text-muted-foreground">{e.expense_date}</td>
                      <td className="px-4 py-3 font-medium">{e.description}{e.reference_number ? <span className="text-xs text-muted-foreground ml-1">({e.reference_number})</span> : null}</td>
                      <td className="px-4 py-3">{e.expense_category?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{e.payment_method ? paymentLabel(e.payment_method) : '—'}</td>
                      <td className="px-4 py-3 text-right font-medium text-destructive">{formatPHP(Number(e.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
