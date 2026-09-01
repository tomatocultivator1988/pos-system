'use client'

import { useEffect, useState, useCallback } from 'react'
import AppLayout from '@/components/app-layout'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingCart, RefreshCw, AlertTriangle, Package, Coffee, Download, Ban, UserCheck, Trash2 } from 'lucide-react'
import { formatPHP } from '@/lib/currency'
import { getBusinessDate } from '@/lib/business-date'
import { paymentLabel } from '@/lib/utils/payment-methods'

type Tab = 'sales' | 'expenses' | 'inventory' | 'voids' | 'customers'

function csvEscape(v: any) {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = "'" + s
  return `"${s.replace(/"/g, '""')}"`
}

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('sales')
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return getBusinessDate(d) })
  const [dateTo, setDateTo] = useState(() => getBusinessDate())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sales, setSales] = useState<any>(null)
  const [expenses, setExpenses] = useState<any>(null)
  const [inventory, setInventory] = useState<any[]>([])
  const [voids, setVoids] = useState<any>(null)
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mod] = await Promise.all([import('@/lib/actions/reports')])
      if (tab === 'sales') {
        const [s, p] = await Promise.all([mod.getSalesReport(dateFrom, dateTo), mod.getProductPerformanceReport(dateFrom, dateTo)])
        setSales(s); setProducts(p); setExpenses(null); setInventory([]); setVoids(null); setCustomers([])
      } else if (tab === 'expenses') {
        const [e, s] = await Promise.all([mod.getExpenseReport(dateFrom, dateTo), mod.getSalesReport(dateFrom, dateTo)])
        const paid = (s.orders || []).filter((o: any) => o.status !== 'voided' && o.payment_status !== 'voided' && o.payment_status !== 'refunded')
        const totalSales = paid.reduce((sum: number, o: any) => sum + Number(o.grand_total), 0)
        setExpenses(e); setSales({ ...s, summary: { ...s.summary, total_sales: Math.round(totalSales * 100) / 100 } }); setInventory([]); setVoids(null); setCustomers([])
      } else if (tab === 'inventory') {
        const inv = await mod.getInventoryUsageReport(dateFrom, dateTo)
        setInventory(inv); setSales(null); setExpenses(null); setVoids(null); setCustomers([])
      } else if (tab === 'voids') {
        const s = await mod.getSalesReport(dateFrom, dateTo)
        const all = s.orders || []
        const voidList = all.filter((o: any) => o.status === 'voided' || o.payment_status === 'voided')
        const refundList = all.filter((o: any) => o.payment_status === 'refunded')
        setVoids({ voidList, refundList, voidTotal: voidList.reduce((s: number, o: any) => s + Number(o.grand_total), 0), refundTotal: refundList.reduce((s: number, o: any) => s + Number(o.grand_total), 0) })
        setSales(null); setExpenses(null); setInventory([]); setCustomers([])
      } else if (tab === 'customers') {
        const s = await mod.getSalesReport(dateFrom, dateTo)
        const cust: Record<string, { name: string; member_number: string; spend: number; visits: number }> = {}
        for (const o of s.orders || []) {
          if (!o.customer_id) continue
          if (o.status === 'voided' || o.payment_status === 'voided' || o.payment_status === 'refunded') continue
          const c = o.customers as any
          const nm = c?.name || o.customer_id
          const mem = c?.member_number || ''
          if (!cust[o.customer_id]) cust[o.customer_id] = { name: nm, member_number: mem, spend: 0, visits: 0 }
          cust[o.customer_id].spend += Number(o.grand_total)
          cust[o.customer_id].visits++
        }
        setCustomers(Object.entries(cust).map(([id, v]) => ({ id, ...v, spend: Math.round(v.spend * 100) / 100 })).sort((a, b) => b.spend - a.spend))
        setSales(null); setExpenses(null); setInventory([]); setVoids(null)
      }
    } catch (e: any) { setError(e.message || 'Failed to load') } finally { setLoading(false) }
  }, [tab, dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const exportCSV = (headers: string[], rows: string[][], filename: string) => {
    const csv = [headers.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); URL.revokeObjectURL(a.href)
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'sales', label: 'Sales', icon: DollarSign },
    { key: 'expenses', label: 'Expenses', icon: TrendingUp },
    { key: 'inventory', label: 'Inventory Usage', icon: Package },
    { key: 'voids', label: 'Voids/Refunds', icon: Trash2 },
    { key: 'customers', label: 'Customers', icon: UserCheck },
  ]

  const paymentMethodData = sales ? Object.entries(sales.summary.by_method || {}).map(([name, value]: any) => ({ name: paymentLabel(name), value })) : []

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold mb-1">Reports</h1>
            <p className="text-muted-foreground text-sm">Sales, expenses, and business analytics</p>
          </div>
          <div className="flex gap-2 items-center">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-accent text-white' : 'bg-muted text-foreground hover:bg-muted/80'}`}>
              <t.icon className="w-4 h-4 inline mr-1.5" />{t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="animate-shimmer h-28 rounded-xl" />)}</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to load</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <button onClick={fetchData} className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl"><RefreshCw className="w-4 h-4" /> Retry</button>
          </div>
        ) : (
          <>

            {/* === SALES TAB === */}
            {tab === 'sales' && sales && (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-card border border-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Total Sales</p><p className="text-2xl font-semibold">{formatPHP(sales.summary.total_sales)}</p></div>
                  <div className="bg-card border border-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Transactions</p><p className="text-2xl font-semibold">{sales.summary.total_orders}</p></div>
                  <div className="bg-card border border-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Avg Order</p><p className="text-2xl font-semibold">{formatPHP(sales.summary.average_order_value)}</p></div>
                  <div className="bg-card border border-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Discounts</p><p className="text-2xl font-semibold text-red-500">{formatPHP(sales.summary.total_discount || 0)}</p></div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                  <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                    <h3 className="text-lg font-semibold mb-4">Sales Trend</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={(sales.orders || []).filter((o: any) => o.status !== 'voided' && o.payment_status !== 'voided' && o.payment_status !== 'refunded').slice().reverse().map((o: any) => ({ name: new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), sales: Number(o.grand_total) }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" /><XAxis dataKey="name" stroke="#999" fontSize={12} /><YAxis stroke="#999" fontSize={12} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }} formatter={(v: any) => formatPHP(Number(v))} />
                        <Line type="monotone" dataKey="sales" stroke="hsl(140 71% 45%)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                    <h3 className="text-lg font-semibold mb-4">Payment Methods</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={paymentMethodData}><CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" /><XAxis dataKey="name" stroke="#999" fontSize={12} /><YAxis stroke="#999" fontSize={12} />
                        <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }} formatter={(v: any) => formatPHP(Number(v))} />
                        <Bar dataKey="value" fill="hsl(140 71% 45%)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Order List</h3>
                  <button onClick={() => exportCSV(['Order #', 'Date', 'Discount', 'Total', 'Method', 'Status'], (sales.orders || []).filter((o: any) => o.status !== 'voided' && o.payment_status !== 'voided' && o.payment_status !== 'refunded').map((o: any) => [o.order_number, o.created_at, o.discount_total || 0, o.grand_total, o.payment_method, o.status]), 'sales.csv')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80"><Download className="w-3 h-3" /> CSV</button>
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted"><th className="px-4 py-3 text-left">Order #</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right">Discount</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-left">Method</th></tr></thead>
                    <tbody>{(sales.orders || []).filter((o: any) => o.status !== 'voided' && o.payment_status !== 'voided' && o.payment_status !== 'refunded').slice(0, 50).map((o: any) => (
                      <tr key={o.id} className="border-b border-border hover:bg-muted/50"><td className="px-4 py-3 font-medium">{o.order_number}</td><td className="px-4 py-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td><td className="px-4 py-3 text-right">{Number(o.discount_total) > 0 ? <span className="text-red-500">-{formatPHP(Number(o.discount_total))}</span> : '—'}</td><td className="px-4 py-3 text-right font-medium">{formatPHP(Number(o.grand_total))}</td><td className="px-4 py-3 capitalize">{o.payment_method}</td></tr>
                    ))}</tbody></table>
                </div>

                {products && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                    <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                      <h3 className="text-lg font-semibold mb-4">Top Items</h3>
                      {products.top.map((item: any, idx: number) => <div key={item.id} className="flex justify-between p-2 bg-muted rounded mb-1 text-sm"><span>{idx + 1}. {item.name}</span><span className="font-medium">{item.quantity} sold · {formatPHP(item.revenue)}</span></div>)}
                    </div>
                    <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                      <h3 className="text-lg font-semibold mb-4">Least Selling</h3>
                      {products.least.map((item: any, idx: number) => <div key={item.id} className="flex justify-between p-2 bg-muted rounded mb-1 text-sm"><span>{idx + 1}. {item.name}</span><span className="font-medium text-destructive">{item.quantity} sold · {formatPHP(item.revenue)}</span></div>)}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* === EXPENSES TAB === */}
            {tab === 'expenses' && expenses && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-card border border-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Total Expenses</p><p className="text-2xl font-semibold text-destructive">{formatPHP(expenses.summary.total_expenses)}</p></div>
                  {sales && <div className="bg-card border border-border rounded-xl p-4"><p className="text-sm text-muted-foreground">Net Profit</p><p className={`text-2xl font-semibold ${(sales.summary.total_sales - expenses.summary.total_expenses) >= 0 ? 'text-accent' : 'text-destructive'}`}>{formatPHP(sales.summary.total_sales - expenses.summary.total_expenses)}</p></div>}
                </div>

                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Expenses by Category</h3>
                  <button onClick={() => exportCSV(['Category', 'Total', 'Count'], (expenses.summary.by_category || []).map((c: any) => [c.name, String(c.total), String(c.count)]), 'expenses.csv')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80"><Download className="w-3 h-3" /> CSV</button>
                </div>
                <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={expenses.summary.by_category || []}><CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" /><XAxis dataKey="name" stroke="#999" fontSize={12} /><YAxis stroke="#999" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }} formatter={(v: any) => formatPHP(Number(v))} />
                      <Bar dataKey="total" fill="hsl(0 70% 50%)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-6 bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted"><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-left">Description</th><th className="px-4 py-3 text-left">Category</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
                    <tbody>{(expenses.expenses || []).slice(0, 50).map((e: any) => (
                      <tr key={e.id} className="border-b border-border hover:bg-muted/50"><td className="px-4 py-3 text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</td><td className="px-4 py-3">{e.description}</td><td className="px-4 py-3">{(e.expense_category as any)?.name || '—'}</td><td className="px-4 py-3 text-right font-medium text-destructive">{formatPHP(Number(e.amount))}</td></tr>
                    ))}</tbody></table>
                </div>
              </>
            )}

            {/* === INVENTORY TAB === */}
            {tab === 'inventory' && (
              <>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Ingredient Consumption</h3>
                  <button onClick={() => exportCSV(['Ingredient', 'Unit', 'Added', 'Used', 'Adjusted', 'Opening', 'Closing'], inventory.map((i: any) => [i.ingredient_name, i.base_unit, String(i.added || 0), String(i.used), String(i.adjusted), String(i.opening), String(i.closing)]), 'inventory-usage.csv')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80"><Download className="w-3 h-3" /> CSV</button>
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted"><th className="px-4 py-3 text-left">Ingredient</th><th className="px-4 py-3 text-left">Unit</th><th className="px-4 py-3 text-right">Added</th><th className="px-4 py-3 text-right">Used</th><th className="px-4 py-3 text-right">Adjusted</th><th className="px-4 py-3 text-right">Opening</th><th className="px-4 py-3 text-right">Closing</th></tr></thead>
                    <tbody>{inventory.length === 0 ? <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No inventory usage data for this period</td></tr> : inventory.map((i: any) => (
                      <tr key={i.ingredient_name} className="border-b border-border hover:bg-muted/50"><td className="px-4 py-3 font-medium">{i.ingredient_name}</td><td className="px-4 py-3 text-muted-foreground">{i.base_unit}</td><td className="px-4 py-3 text-right">{i.added || 0}</td><td className="px-4 py-3 text-right text-destructive">{i.used}</td><td className="px-4 py-3 text-right">{i.adjusted}</td><td className="px-4 py-3 text-right">{i.opening}</td><td className="px-4 py-3 text-right font-medium">{i.closing}</td></tr>
                    ))}</tbody></table>
                </div>
              </>
            )}

            {/* === VOIDS/REFUNDS TAB === */}
            {tab === 'voids' && voids && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  <div className="bg-card border border-destructive/20 rounded-xl p-4"><p className="text-sm text-muted-foreground">Total Voided</p><p className="text-2xl font-semibold text-destructive">{formatPHP(voids.voidTotal)}<span className="text-sm font-normal ml-2">({voids.voidList.length} orders)</span></p></div>
                  <div className="bg-card border border-yellow-200 rounded-xl p-4"><p className="text-sm text-muted-foreground">Total Refunded</p><p className="text-2xl font-semibold text-yellow-700">{formatPHP(voids.refundTotal)}<span className="text-sm font-normal ml-2">({voids.refundList.length} orders)</span></p></div>
                </div>

                <div className="flex justify-between items-center mb-3"><h3 className="text-lg font-semibold">Voided Orders</h3></div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden mb-6">
                  <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted"><th className="px-4 py-3 text-left">Order #</th><th className="px-4 py-3 text-left">Date</th><th className="px-4 py-3 text-right">Amount</th></tr></thead>
                    <tbody>{voids.voidList.length === 0 ? <tr><td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">No voided orders</td></tr> : voids.voidList.map((o: any) => (
                      <tr key={o.id} className="border-b border-border hover:bg-muted/50"><td className="px-4 py-3 font-medium">{o.order_number}</td><td className="px-4 py-3 text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td><td className="px-4 py-3 text-right text-destructive">{formatPHP(Number(o.grand_total))}</td></tr>
                    ))}</tbody></table>
                </div>
              </>
            )}

            {/* === CUSTOMERS TAB === */}
            {tab === 'customers' && (
              <>
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-lg font-semibold">Top Customers by Spend</h3>
                  <button onClick={() => exportCSV(['Customer', 'Member #', 'Spend', 'Visits'], customers.map((c: any) => [c.name, c.member_number, String(c.spend), String(c.visits)]), 'customers.csv')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80"><Download className="w-3 h-3" /> CSV</button>
                </div>
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <table className="w-full text-sm"><thead><tr className="border-b border-border bg-muted"><th className="px-4 py-3 text-left">Customer</th><th className="px-4 py-3 text-left">Member #</th><th className="px-4 py-3 text-right">Total Spend</th><th className="px-4 py-3 text-right">Visits</th></tr></thead>
                    <tbody>{customers.length === 0 ? <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No customer orders in this period</td></tr> : customers.map((c: any) => (
                      <tr key={c.id} className="border-b border-border hover:bg-muted/50"><td className="px-4 py-3 font-medium">{c.name}</td><td className="px-4 py-3 text-muted-foreground">{c.member_number}</td><td className="px-4 py-3 text-right font-medium">{formatPHP(c.spend)}</td><td className="px-4 py-3 text-right">{c.visits}</td></tr>
                    ))}</tbody></table>
                </div>
              </>
            )}

          </>
        )}
      </div>
    </AppLayout>
  )
}
