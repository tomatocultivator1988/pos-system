'use client'

import { useEffect, useState, useCallback } from 'react'
import AppLayout from '@/components/app-layout'
import { Download, RefreshCw, AlertTriangle, Trophy } from 'lucide-react'
import { formatPHP } from '@/lib/currency'
import { getBusinessDate } from '@/lib/business-date'
import { getSalesByItemReport } from '@/lib/actions/reports'

interface Row {
  id: string
  menu_item_id: string
  name: string
  category: string
  customer: string
  qty: number
  sales: number
  net: number
  cost: number
  profit: number
  margin: number
}

interface Totals { items_sold: number; sales: number; net: number; cost: number; profit: number }
interface TopProduct { name: string; sales: number }

function csvEscape(v: any) {
  let s = String(v ?? '')
  if (/^[=+\-@]/.test(s)) s = "'" + s
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

export default function SalesByItemPage() {
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return getBusinessDate(d) })
  const [dateTo, setDateTo] = useState(() => getBusinessDate())
  const [rows, setRows] = useState<Row[]>([])
  const [totals, setTotals] = useState<Totals>({ items_sold: 0, sales: 0, net: 0, cost: 0, profit: 0 })
  const [topProduct, setTopProduct] = useState<TopProduct | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await getSalesByItemReport(dateFrom, dateTo)
      setRows(r.rows)
      setTotals(r.totals)
      setTopProduct(r.topProduct)
    } catch (e: any) {
      setError(e.message || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }, [dateFrom, dateTo])

  useEffect(() => { fetchData() }, [fetchData])

  const groups: { category: string; rows: Row[]; sub: Totals }[] = []
  const seen = new Map<string, number>()
  for (const r of rows) {
    if (!seen.has(r.category)) {
      seen.set(r.category, groups.length)
      groups.push({ category: r.category, rows: [], sub: { items_sold: 0, sales: 0, net: 0, cost: 0, profit: 0 } })
    }
    const g = groups[seen.get(r.category)!]
    g.rows.push(r)
    g.sub.items_sold += r.qty
    g.sub.sales += r.sales
    g.sub.net += r.net
    g.sub.cost += r.cost
    g.sub.profit += r.profit
  }

  const exportCSV = () => {
    const headers = ['Category', 'Product', 'Customer', 'Qty', 'Gross Sales', 'Net Sales', 'Cost', 'Profit', 'Margin %']
    const csv = [headers.join(','), ...rows.map(r => [r.category, r.name, r.customer, r.qty, r.sales, r.net, r.cost, r.profit, r.margin].map(csvEscape).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'sales-by-item.csv'; a.click(); URL.revokeObjectURL(a.href)
  }

  const money = (v: number) => formatPHP(v)

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold mb-1">Sales by Item</h1>
            <p className="text-muted-foreground text-sm">Sales volume, cost, and profit per menu item</p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
            <span className="text-muted-foreground text-sm">to</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-border rounded-lg bg-background text-sm" />
            <button onClick={exportCSV} disabled={rows.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium disabled:opacity-50">
              <Download className="w-3 h-3" /> CSV
            </button>
          </div>
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-accent/10 border border-accent rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1 flex items-center gap-1.5"><Trophy className="w-4 h-4 text-accent" /> Top Product</p>
                <p className="text-lg font-semibold truncate">{topProduct?.name || '—'}</p>
                <p className="text-sm text-accent font-medium">{topProduct ? money(topProduct.sales) : ''}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Total Sales</p>
                <p className="text-2xl font-semibold">{money(totals.sales)}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-sm text-muted-foreground mb-1">Total Profit</p>
                <p className="text-2xl font-semibold text-accent">{money(totals.profit)}</p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Product</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Customer</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Qty</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Gross Sales</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Net Sales</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Cost</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Profit</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <GroupRows key={g.category} group={g} money={money} />
                  ))}
                  {rows.length > 0 && (
                    <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                      <td className="px-4 py-3 text-sm">Grand Total</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-sm text-right">{totals.items_sold}</td>
                      <td className="px-4 py-3 text-sm text-right">{money(totals.sales)}</td>
                      <td className="px-4 py-3 text-sm text-right text-accent">{money(totals.net)}</td>
                      <td className="px-4 py-3 text-sm text-right">{money(totals.cost)}</td>
                      <td className="px-4 py-3 text-sm text-right">{money(totals.profit)}</td>
                      <td className="px-4 py-3 text-right" />
                    </tr>
                  )}
                  {rows.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">No sales in this period</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground mt-4">Gross = line_total + addons. Net = Gross − discount (pro-rata). Cost from recipes. Profit = Net − Cost. Excludes voided/refunded.</p>
          </>
        )}
      </div>
    </AppLayout>
  )
}

function GroupRows({ group, money }: { group: { category: string; rows: Row[]; sub: Totals }; money: (v: number) => string }) {
  return (
    <>
      <tr className="bg-muted/40">
        <td colSpan={8} className="px-4 py-2 text-sm font-semibold text-accent">{group.category}</td>
      </tr>
      {group.rows.map(r => (
        <tr key={r.id} className="border-b border-border hover:bg-muted/30 transition-colors">
          <td className="px-4 py-2.5 text-sm font-medium">{r.name}</td>
          <td className="px-4 py-2.5 text-sm text-muted-foreground">{r.customer}</td>
          <td className="px-4 py-2.5 text-sm text-right">{r.qty}</td>
          <td className="px-4 py-2.5 text-sm text-right">{money(r.sales)}</td>
          <td className="px-4 py-2.5 text-sm text-right text-accent">{money(r.net)}</td>
          <td className="px-4 py-2.5 text-sm text-right">{money(r.cost)}</td>
          <td className="px-4 py-2.5 text-sm text-right font-medium">{money(r.profit)}</td>
          <td className="px-4 py-2.5 text-sm text-right text-muted-foreground">{r.margin}%</td>
        </tr>
      ))}
      <tr className="border-b border-border bg-muted/30">
        <td className="px-4 py-2.5 text-sm font-semibold">Total</td>
        <td className="px-4 py-2.5" />
        <td className="px-4 py-2.5 text-sm text-right font-semibold">{group.sub.items_sold}</td>
        <td className="px-4 py-2.5 text-sm text-right font-semibold">{money(group.sub.sales)}</td>
        <td className="px-4 py-2.5 text-sm text-right font-semibold text-accent">{money(group.sub.net)}</td>
        <td className="px-4 py-2.5 text-sm text-right font-semibold">{money(group.sub.cost)}</td>
        <td className="px-4 py-2.5 text-sm text-right font-semibold">{money(group.sub.profit)}</td>
        <td className="px-4 py-2.5 text-right" />
      </tr>
    </>
  )
}
