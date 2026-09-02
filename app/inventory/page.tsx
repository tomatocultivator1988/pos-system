'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { useModal } from '@/lib/contexts/modal-context'
import { Plus, Edit2, AlertCircle, Search } from 'lucide-react'
import { getIngredients, getLowStockIngredients, getInventoryValuation, updateIngredient, getInventoryMovements, getDailyUsage, createIngredient, createAdjustment, createStockReceipt } from '@/lib/actions/inventory'
import { formatPHP } from '@/lib/currency'
import { getBusinessDate } from '@/lib/business-date'
import type { Ingredient } from '@/lib/types'

export default function InventoryPage() {
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [lowStock, setLowStock] = useState<Ingredient[]>([])
  const [valuation, setValuation] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'low' | 'out'>('all')
  const [showInactive, setShowInactive] = useState(false)
  const { showConfirmation, hideConfirmation } = useModal()

  const [tab, setTab] = useState<'stock' | 'log'>('stock')
  const [movements, setMovements] = useState<any[]>([])
  const [movCount, setMovCount] = useState(0)
  const [movPage, setMovPage] = useState(1)
  const [movIngredient, setMovIngredient] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [dailyUsage, setDailyUsage] = useState<{ total_cost: number; lines: any[] } | null>(null)
  const [usageDate, setUsageDate] = useState(getBusinessDate())
  const [allIngredients, setAllIngredients] = useState<any[]>([])

  const [ingOpen, setIngOpen] = useState(false)
  const [ingName, setIngName] = useState('')
  const [ingUnit, setIngUnit] = useState('g')
  const [ingReorder, setIngReorder] = useState('0')
  const [ingCost, setIngCost] = useState('0')
  const [ingSaving, setIngSaving] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editItem, setEditItem] = useState<any>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [adjOpen, setAdjOpen] = useState(false)
  const [adjItem, setAdjItem] = useState<any>(null)
  const [adjType, setAdjType] = useState<'waste' | 'spoilage' | 'manual_count' | 'correction'>('manual_count')
  const [adjDelta, setAdjDelta] = useState('0')
  const [adjReason, setAdjReason] = useState('')
  const [adjSaving, setAdjSaving] = useState(false)
  const [restockOpen, setRestockOpen] = useState(false)
  const [restockItem, setRestockItem] = useState<any>(null)
  const [restockQty, setRestockQty] = useState('')
  const [restockCost, setRestockCost] = useState('')
  const [restockSaving, setRestockSaving] = useState(false)

  const openEdit = (item: any) => { setEditItem(item); setIngName(item.name); setIngUnit(item.base_unit); setIngReorder(String(item.reorder_level)); setIngCost(String(item.weighted_average_unit_cost ?? 0)); setEditOpen(true) }
  const saveEdit = async () => {
    if (!editItem || editSaving) return
    setEditSaving(true)
    try {
      await updateIngredient(editItem.id, { name: ingName, base_unit: ingUnit, reorder_level: parseFloat(ingReorder) || 0, weighted_average_unit_cost: parseFloat(ingCost) || 0 })
      setEditOpen(false)
      getIngredients().then(setIngredients)
    } catch (e: any) {
      showConfirmation({ title: 'Error', description: e.message || 'Failed to save ingredient', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    } finally { setEditSaving(false) }
  }
  const createIng = async () => {
    if (!ingName.trim() || ingSaving) return
    setIngSaving(true)
    try { await createIngredient({ name: ingName, base_unit: ingUnit, reorder_level: parseFloat(ingReorder) || 0, weighted_average_unit_cost: parseFloat(ingCost) || 0 }); setIngOpen(false); getIngredients().then(setIngredients) } catch (e: any) { showConfirmation({ title: 'Error', description: e.message || 'Failed to create ingredient', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } finally { setIngSaving(false) }
  }
  const openAdj = (item: any) => { setAdjItem(item); setAdjType('manual_count'); setAdjDelta('0'); setAdjReason(''); setAdjOpen(true) }
  const saveAdj = async () => {
    if (!adjItem || adjSaving) return
    setAdjSaving(true)
    try { await createAdjustment(adjItem.id, adjType, parseFloat(adjDelta) || 0, adjReason || 'manual'); setAdjOpen(false); getIngredients().then(setIngredients) } catch (e: any) { showConfirmation({ title: 'Error', description: e.message || 'Adjustment failed', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } finally { setAdjSaving(false) }
  }
  const openRestock = (item: any) => { setRestockItem(item); setRestockQty(''); setRestockCost(String(item.weighted_average_unit_cost ?? 0)); setRestockOpen(true) }
  const saveRestock = async () => {
    if (!restockItem || restockSaving) return
    const qty = parseFloat(restockQty)
    if (!qty || qty <= 0) {
      showConfirmation({ title: 'Invalid Quantity', description: 'Quantity received must be greater than 0.', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
      return
    }
    setRestockSaving(true)
    try { await createStockReceipt([{ ingredientId: restockItem.id, quantity: qty, unitCost: parseFloat(restockCost) || 0 }]); setRestockOpen(false); getIngredients().then(setIngredients) } catch (e: any) { showConfirmation({ title: 'Error', description: e.message || 'Restock failed', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false }) } finally { setRestockSaving(false) }
  }

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getIngredients(), getLowStockIngredients(), getInventoryValuation()
    ]).then(([ings, low, val]) => {
      setIngredients(ings)
      setLowStock(low)
      setValuation(val)
    }).catch((err: any) => {
      setLoadError(err.message || 'Failed to load inventory')
    }).finally(() => setLoading(false))
  }, [])

  const filteredItems = ingredients.filter(item => {
    if (!showInactive && !item.is_active) return false
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
    const qty = Number(item.quantity_on_hand)
    const reorder = Number(item.reorder_level)
    const matchesStatus =
      filterStatus === 'all' ? true :
      filterStatus === 'low' ? qty > 0 && qty <= reorder :
      qty === 0
    return matchesSearch && matchesStatus
  })

  const lowStockCount = lowStock.filter(i => Number(i.quantity_on_hand) > 0).length
  const outOfStockCount = lowStock.filter(i => Number(i.quantity_on_hand) === 0).length

  const loadMovements = async (page = 1) => {
    try {
      const { data, count } = await getInventoryMovements(movIngredient || undefined, dateFrom || undefined, dateTo || undefined, page, 30)
      setMovements(data); setMovCount(count); setMovPage(page)
    } catch { /* silently handle */ }
  }
  const loadDailyUsage = async () => {
    try {
      const u = await getDailyUsage(usageDate)
      setDailyUsage(u)
    } catch { setDailyUsage(null) }
  }
  useEffect(() => { getIngredients().then(setAllIngredients) }, [])

  const switchTab = (t: 'stock' | 'log') => { setTab(t); if (t === 'log') { loadMovements(1); loadDailyUsage() } }

  const handleToggleActive = (item: Ingredient) => {
    showConfirmation({
      title: item.is_active ? 'Deactivate Ingredient' : 'Activate Ingredient',
      description: `${item.is_active ? 'Deactivate' : 'Activate'} "${item.name}"?`,
      confirmText: 'Confirm',
      cancelText: 'Cancel',
      onConfirm: async () => {
        await updateIngredient(item.id, { is_active: !item.is_active })
        setIngredients(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !item.is_active } : i))
        hideConfirmation()
      },
      isDestructive: !item.is_active,
    })
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        <div className="mb-6 lg:mb-8">
          <h1 className="text-2xl lg:text-3xl font-semibold mb-1 lg:mb-2">Inventory Management</h1>
          <p className="text-muted-foreground text-sm">Track and manage stock levels</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />)}
            </div>
            <div className="animate-pulse bg-muted rounded-xl h-64" />
          </div>
        ) : loadError ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{loadError}</p>
            <button onClick={() => window.location.reload()} className="bg-accent text-white px-4 py-2 rounded-lg">Retry</button>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Total Ingredients</p>
            <p className="text-2xl font-semibold">{ingredients.length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-muted-foreground mb-1">Total Value</p>
            <p className="text-2xl font-semibold">{formatPHP(valuation)}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-yellow-700 mb-1 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Low Stock
            </p>
            <p className="text-2xl font-semibold text-yellow-700">{lowStockCount}</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 animate-slideInUp">
            <p className="text-sm text-red-700 mb-1 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> Out of Stock
            </p>
            <p className="text-2xl font-semibold text-red-700">{outOfStockCount}</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search ingredients..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <button onClick={() => { setIngName(''); setIngUnit('g'); setIngReorder('0'); setIngCost('0'); setIngOpen(true) }} className="w-full sm:w-auto bg-accent text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all">
              <Plus className="w-4 h-4" />
              New Ingredient
            </button>
          </div>

          <div className="flex gap-2 flex-wrap">
            {['all', 'low', 'out'].map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status as any)}
                className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filterStatus === status
                    ? 'bg-accent text-white'
                    : 'bg-muted text-foreground hover:bg-muted/80'
                }`}
              >
                {status === 'all' ? 'All Items' : status === 'low' ? 'Low Stock' : 'Out of Stock'}
              </button>
            ))}
            <button
              onClick={() => setShowInactive(v => !v)}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showInactive ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'
              }`}
            >
              {showInactive ? 'Hide Inactive' : 'Show Inactive'}
            </button>
          </div>
        </div>

        {tab === 'stock' && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Mobile: ingredient cards */}
          <div className="md:hidden divide-y divide-border">
            {filteredItems.length === 0 ? (
              <p className="px-4 py-12 text-center text-muted-foreground">No ingredients found</p>
            ) : filteredItems.map((item) => {
              const qty = Number(item.quantity_on_hand)
              const reorder = Number(item.reorder_level)
              const unitCost = Number(item.weighted_average_unit_cost)
              const status = qty === 0 ? 'out' : qty <= reorder ? 'low' : 'normal'
              const statusColors = {
                out: 'bg-red-50 text-red-700',
                low: 'bg-yellow-50 text-yellow-700',
                normal: 'bg-green-50 text-green-700',
              }
              const statusLabels = { out: 'Out of Stock', low: 'Low Stock', normal: 'In Stock' }
              return (
                <div key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.base_unit}</p>
                    </div>
                    <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}>
                      {statusLabels[status]}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Stock</p><p className="font-medium">{qty.toLocaleString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">Unit Cost</p><p>{formatPHP(unitCost)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{formatPHP(qty * unitCost)}</p></div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => openEdit(item)} className="flex-1 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium flex items-center justify-center gap-1"><Edit2 className="w-3.5 h-3.5" /> Edit</button>
                    <button onClick={() => openAdj(item)} className="flex-1 py-1.5 rounded-lg bg-muted text-foreground text-xs font-medium">Adjust</button>
                    <button onClick={() => openRestock(item)} className="flex-1 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium">Stock In</button>
                    <button onClick={() => handleToggleActive(item)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${item.is_active ? 'bg-muted text-destructive' : 'bg-accent text-white'}`}>{item.is_active ? 'Deactivate' : 'Activate'}</button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-6 py-4 text-left text-sm font-semibold">Ingredient</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Unit</th>
                <th className="px-6 py-4 text-right text-sm font-semibold">Stock Level</th>
                <th className="px-6 py-4 text-right text-sm font-semibold">Unit Cost</th>
                <th className="px-6 py-4 text-right text-sm font-semibold">Total Value</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Status</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No ingredients found</td></tr>
              ) : filteredItems.map((item) => {
                const qty = Number(item.quantity_on_hand)
                const reorder = Number(item.reorder_level)
                const unitCost = Number(item.weighted_average_unit_cost)
                const status = qty === 0 ? 'out' : qty <= reorder ? 'low' : 'normal'
                const statusColors = {
                  out: 'bg-red-50 text-red-700',
                  low: 'bg-yellow-50 text-yellow-700',
                  normal: 'bg-green-50 text-green-700',
                }
                const statusLabels = { out: 'Out of Stock', low: 'Low Stock', normal: 'In Stock' }

                return (
                  <tr key={item.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium">{item.name}</td>
                    <td className="px-6 py-4 text-sm">{item.base_unit}</td>
                    <td className="px-6 py-4 text-sm text-right font-medium">{qty.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-right">{formatPHP(unitCost)}</td>
                    <td className="px-6 py-4 text-sm text-right font-semibold">{formatPHP(qty * unitCost)}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[status]}`}>
                        {statusLabels[status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="text-accent hover:text-accent/80 transition-colors"
                          aria-label="Edit ingredient"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openAdj(item)}
                          className="text-foreground hover:text-accent transition-colors text-xs font-medium px-2 py-1 rounded bg-muted"
                        >
                          Adjust
                        </button>
                        <button
                          onClick={() => openRestock(item)}
                          className="text-accent hover:text-accent/80 transition-colors text-xs font-medium px-2 py-1 rounded bg-accent/10"
                        >
                          Stock In
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className={`text-xs font-medium px-2 py-1 rounded ${item.is_active ? 'bg-muted text-destructive hover:bg-muted/80' : 'bg-accent text-white hover:opacity-90'}`}
                        >
                          {item.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
        )}

        <div className="flex gap-2 mb-6">
          <button onClick={() => switchTab('stock')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium ${tab === 'stock' ? 'bg-accent text-white' : 'bg-muted text-foreground'}`}>Stock</button>
          <button onClick={() => switchTab('log')} className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium ${tab === 'log' ? 'bg-accent text-white' : 'bg-muted text-foreground'}`}>Movement Log</button>
        </div>

        {tab === 'log' && (
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="text-lg font-semibold">Daily Usage</h2>
                <div className="flex items-center gap-2">
                  <input type="date" value={usageDate} onChange={e => { setUsageDate(e.target.value); setDailyUsage(null) }} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
                  <button onClick={loadDailyUsage} className="bg-accent text-white px-3 py-1.5 rounded-lg text-sm">Refresh</button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-1">Total Cost Used (sales): <span className="font-semibold text-foreground">{formatPHP(dailyUsage?.total_cost ?? 0)}</span></p>
              <div className="space-y-1 mt-2">
                {(dailyUsage?.lines ?? []).map(l => (
                  <div key={l.ingredient_id} className="flex justify-between text-sm bg-muted rounded px-3 py-1.5">
                    <span className="min-w-0 truncate">{l.ingredient_name}</span>
                    <span className="shrink-0">{l.quantity_out} used · {formatPHP(l.cost)}</span>
                  </div>
                ))}
                {(dailyUsage?.lines ?? []).length === 0 && <p className="text-sm text-muted-foreground">No usage recorded for this date.</p>}
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <select value={movIngredient} onChange={e => setMovIngredient(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm flex-1 sm:flex-none sm:min-w-40"><option value="">All ingredients</option>{allIngredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}</select>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm flex-1 sm:flex-none" />
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm flex-1 sm:flex-none" />
                <button onClick={() => loadMovements(1)} className="bg-accent text-white px-3 py-1.5 rounded-lg text-sm flex-1 sm:flex-none">Filter</button>
              </div>

              {/* Mobile: movement cards */}
              <div className="md:hidden divide-y divide-border">
                {movements.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">No movements found.</p>
                ) : movements.map(m => (
                  <div key={m.id} className="py-3">
                    <div className="flex justify-between items-start gap-2">
                      <p className="text-sm font-medium truncate">{m.ingredient?.name ?? '—'}</p>
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-muted capitalize">{m.movement_type.replace(/_/g, ' ')}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{new Date(m.created_at).toLocaleString()}</p>
                    <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
                      <div><span className="text-xs text-muted-foreground">In</span> <span className="font-medium">{Number(m.quantity_in) || '—'}</span></div>
                      <div><span className="text-xs text-muted-foreground">Out</span> <span className="font-medium text-destructive">{Number(m.quantity_out) || '—'}</span></div>
                      <div><span className="text-xs text-muted-foreground">Cost</span> <span>{formatPHP(Number(m.total_cost))}</span></div>
                      <div><span className="text-xs text-muted-foreground">Balance</span> <span className="font-medium">{Number(m.quantity_balance_after)}</span></div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: movement table */}
              <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-border bg-muted text-left text-sm font-semibold">
                    <th className="px-3 py-2">Date/Time</th><th className="px-3 py-2">Ingredient</th><th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">In</th><th className="px-3 py-2 text-right">Out</th><th className="px-3 py-2 text-right">Cost</th><th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map(m => (
                    <tr key={m.id} className="border-b border-border text-sm">
                      <td className="px-3 py-2">{new Date(m.created_at).toLocaleString()}</td>
                      <td className="px-3 py-2">{m.ingredient?.name ?? '—'}</td>
                      <td className="px-3 py-2 capitalize">{m.movement_type.replace(/_/g, ' ')}</td>
                      <td className="px-3 py-2 text-right">{Number(m.quantity_in) || ''}</td>
                      <td className="px-3 py-2 text-right text-destructive">{Number(m.quantity_out) || ''}</td>
                      <td className="px-3 py-2 text-right">{formatPHP(Number(m.total_cost))}</td>
                      <td className="px-3 py-2 text-right">{Number(m.quantity_balance_after)}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No movements found.</td></tr>}
                </tbody>
              </table>
              </div>
              {movCount > 30 && (
                <div className="flex justify-between items-center mt-4">
                  <span className="text-sm text-muted-foreground">Page {movPage}</span>
                  <div className="flex gap-2">
                    <button disabled={movPage <= 1} onClick={() => loadMovements(movPage - 1)} className="px-3 py-1.5 rounded-lg bg-muted disabled:opacity-40">Prev</button>
                    <button disabled={movPage * 30 >= movCount} onClick={() => loadMovements(movPage + 1)} className="px-3 py-1.5 rounded-lg bg-muted disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
          </>
        )}
      </div>

      {ingOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">New Ingredient</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input id="ing-name" placeholder="e.g. Coffee Beans" value={ingName} onChange={e => setIngName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Unit</label>
                <select id="ing-unit" value={ingUnit} onChange={e => setIngUnit(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option><option value="pc">pc</option><option value="pack">pack</option><option value="bottle">bottle</option></select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Reorder Level</label>
                <input placeholder="0" type="number" value={ingReorder} onChange={e => setIngReorder(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Unit Cost (₱)</label>
                <input placeholder="0.00" type="number" step="0.01" min="0" value={ingCost} onChange={e => setIngCost(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6"><button onClick={() => setIngOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={createIng} disabled={ingSaving} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">{ingSaving ? 'Creating...' : 'Create'}</button></div>
          </div>
        </div>
      )}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Edit Ingredient</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Name</label>
                <input value={ingName} onChange={e => setIngName(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Unit</label>
                <select value={ingUnit} onChange={e => setIngUnit(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background"><option value="g">g</option><option value="kg">kg</option><option value="ml">ml</option><option value="L">L</option><option value="pc">pc</option><option value="pack">pack</option><option value="bottle">bottle</option></select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Reorder Level</label>
                <input type="number" value={ingReorder} onChange={e => setIngReorder(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Unit Cost (₱)</label>
                <input type="number" step="0.01" min="0" value={ingCost} onChange={e => setIngCost(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6"><button onClick={() => setEditOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={saveEdit} disabled={editSaving} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">{editSaving ? 'Saving...' : 'Save'}</button></div>
          </div>
        </div>
      )}
      {adjOpen && adjItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Adjust Stock — {adjItem.name}</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Type</label>
                <select value={adjType} onChange={e => setAdjType(e.target.value as any)} className="w-full px-3 py-2 border border-border rounded-lg bg-background"><option value="manual_count">Manual Count</option><option value="correction">Correction</option><option value="waste">Waste</option><option value="spoilage">Spoilage</option></select>
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Delta (+/−)</label>
                <input placeholder="e.g. 10 or -5" type="number" step="0.001" value={adjDelta} onChange={e => setAdjDelta(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Reason</label>
                <input placeholder="Reason" value={adjReason} onChange={e => setAdjReason(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6"><button onClick={() => setAdjOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={saveAdj} disabled={adjSaving} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">{adjSaving ? 'Applying...' : 'Apply'}</button></div>
          </div>
        </div>
      )}
      {restockOpen && restockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-4">Stock In — {restockItem.name}</h2>
            <p className="text-sm text-muted-foreground mb-4">Current: {restockItem.quantity_on_hand} {restockItem.base_unit} · cost {formatPHP(Number(restockItem.weighted_average_unit_cost))}</p>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1">Quantity Received</label>
                <input type="number" step="0.001" min="0" value={restockQty} onChange={e => setRestockQty(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">Unit Cost (₱)</label>
                <input type="number" step="0.01" min="0" value={restockCost} onChange={e => setRestockCost(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg bg-background" />
              </div>
              <p className="text-xs text-muted-foreground">The new cost is blended into the weighted-average unit cost automatically.</p>
            </div>
            <div className="flex justify-end gap-2 mt-6"><button onClick={() => setRestockOpen(false)} className="px-4 py-2 rounded-lg bg-muted">Cancel</button><button onClick={saveRestock} disabled={restockSaving} className="px-4 py-2 rounded-lg bg-accent text-white disabled:opacity-50">{restockSaving ? 'Saving...' : 'Save'}</button></div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
