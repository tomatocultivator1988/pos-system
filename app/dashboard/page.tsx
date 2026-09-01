'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/contexts/auth-context'
import AppLayout from '@/components/app-layout'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ShoppingCart, TrendingUp, Package, Users, RefreshCw, AlertTriangle, DollarSign, CreditCard, Receipt, PieChart, ShieldOff } from 'lucide-react'
import Link from 'next/link'
import { formatPHP } from '@/lib/currency'

type DashboardData = {
  summary: {
    total_sales: number
    cash_sales: number
    gcash_sales: number
    bpi_sales: number
    unionbank_sales: number
    order_count: number
    average_order_value: number
    ingredient_cost_used: number
    estimated_gross_margin: number
  }
  trend: { date: string; total: number }[]
  lowStock: { count: number; outCount: number; lowCount: number; items: any[] }
  inventoryValue: number
  topItems: { id: string; name: string; quantity: number; revenue: number }[]
  leastItems: { id: string; name: string; quantity_sold: number }[]
}

export default function DashboardPage() {
  const { currentStaff } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)

  const fetchData = async () => {
    if (!currentStaff) return // still loading auth
    if (currentStaff.role !== 'admin') {
      setForbidden(true)
      setLoading(false)
      return
    }
    setForbidden(false)
    setLoading(true)
    setError(null)
    try {
      const [
        { getDashboardSummary, getSalesTrend, getLowStockSummary, getInventoryValue, getTopSellingItems, getLeastSellingItems }
      ] = await Promise.all([
        import('@/lib/actions/dashboard')
      ])
      const [summary, trend, lowStock, inventoryValue, topItems, leastItems] = await Promise.all([
        getDashboardSummary(),
        getSalesTrend(7),
        getLowStockSummary(),
        getInventoryValue(),
        getTopSellingItems(undefined, undefined, 5),
        getLeastSellingItems(undefined, undefined, 5),
      ])
      setData({ summary, trend, lowStock, inventoryValue, topItems, leastItems })
    } catch (e: any) {
      setError(e.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [currentStaff])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'short' })
  }

  const trendData = data?.trend.map(d => ({ ...d, name: formatDate(d.date) })) ?? []

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl">
        {loading ? (
          <div className="space-y-6">
            <div className="animate-shimmer h-16 w-64 rounded-lg" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-shimmer h-32 rounded-2xl" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
              <div className="animate-shimmer h-80 rounded-2xl" />
              <div className="animate-shimmer h-80 rounded-2xl" />
            </div>
          </div>
        ) : forbidden ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="p-4 bg-destructive/10 rounded-full mb-4">
              <ShieldOff className="w-12 h-12 text-destructive" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Admin Access Required</h2>
            <p className="text-muted-foreground mb-6 max-w-md">This dashboard is restricted to administrators only. Cashier accounts can use the POS Terminal and KDS views.</p>
            <Link href="/pos" className="px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors">Go to POS Terminal</Link>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            <button
              onClick={fetchData}
              className="flex items-center gap-2 px-6 py-3 bg-accent text-white rounded-xl hover:bg-accent/90 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Retry
            </button>
          </div>
        ) : (
          <>
            {/* Welcome Section */}
            <div className="mb-6 lg:mb-10">
              <h1 className="text-2xl lg:text-3xl font-light tracking-tight mb-2">
                Welcome back, {currentStaff?.name?.split(' ')[0] || 'User'}
              </h1>
              <p className="text-muted-foreground">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-10">
              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground mb-1 truncate">Today's Sales</p>
                    <p className="text-2xl lg:text-3xl font-semibold">{formatPHP(data!.summary.total_sales)}</p>
                  </div>
                  <TrendingUp className="w-5 h-5 lg:w-6 lg:h-6 text-accent opacity-60 shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">Gross margin: {formatPHP(data!.summary.estimated_gross_margin)}</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground mb-1 truncate">Transactions</p>
                    <p className="text-2xl lg:text-3xl font-semibold">{data!.summary.order_count}</p>
                  </div>
                  <ShoppingCart className="w-5 h-5 lg:w-6 lg:h-6 text-accent opacity-60 shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">Avg: {formatPHP(data!.summary.average_order_value)}</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground mb-1 truncate">Inventory Value</p>
                    <p className="text-2xl lg:text-3xl font-semibold">{formatPHP(data!.inventoryValue)}</p>
                  </div>
                  <Package className="w-5 h-5 lg:w-6 lg:h-6 text-accent opacity-60 shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {data!.lowStock.count > 0
                    ? `${data!.lowStock.count} item${data!.lowStock.count > 1 ? 's' : ''} low stock`
                    : 'All stocked'}
                </p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-muted-foreground mb-1 truncate">Payment Split</p>
                    <p className="text-2xl lg:text-3xl font-semibold text-sm leading-relaxed">
                      <span className="text-base">Cash: {formatPHP(data!.summary.cash_sales)}</span>
                    </p>
                  </div>
                  <DollarSign className="w-5 h-5 lg:w-6 lg:h-6 text-accent opacity-60 shrink-0" />
                </div>
                <p className="text-xs text-muted-foreground">GCash: {formatPHP(data!.summary.gcash_sales)} · BPI: {formatPHP(data!.summary.bpi_sales)} · UnionBank: {formatPHP(data!.summary.unionbank_sales)}</p>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-10">
              {/* Sales Trend */}
              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <h2 className="text-base lg:text-lg font-semibold mb-4 lg:mb-6">7-Day Sales Trend</h2>
                {trendData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
                    <Receipt className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No sales data yet</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                      <XAxis dataKey="name" stroke="#999" fontSize={12} />
                      <YAxis stroke="#999" fontSize={12} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px' }}
                        formatter={(value: any) => formatPHP(Number(value))}
                      />
                      <Line type="monotone" dataKey="total" stroke="#16a34a" strokeWidth={2} dot={false} name="Sales" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Sales by Payment Method */}
              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <h2 className="text-base lg:text-lg font-semibold mb-4 lg:mb-6">Sales by Payment Method</h2>
                {data!.summary.total_sales === 0 ? (
                  <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
                    <PieChart className="w-8 h-8 mb-2 opacity-50" />
                    <p className="text-sm">No payments yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-accent" />
                        <span className="text-sm">Cash</span>
                      </div>
                      <span className="text-sm font-semibold">{formatPHP(data!.summary.cash_sales)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-sm">GCash</span>
                      </div>
                      <span className="text-sm font-semibold">{formatPHP(data!.summary.gcash_sales)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-sm">BPI Bank Transfer</span>
                      </div>
                      <span className="text-sm font-semibold">{formatPHP(data!.summary.bpi_sales)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-orange-500" />
                        <span className="text-sm">UnionBank Transfer</span>
                      </div>
                      <span className="text-sm font-semibold">{formatPHP(data!.summary.unionbank_sales)}</span>
                    </div>
                    {data!.summary.total_sales > 0 && (
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div
                          className="bg-accent h-2 rounded-full"
                          style={{
                            width: `${(data!.summary.cash_sales / data!.summary.total_sales) * 100}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Stock Alerts */}
            {data!.lowStock.count > 0 && (
              <div className={`bg-card border rounded-2xl p-4 lg:p-6 mb-6 lg:mb-10 ${data!.lowStock.outCount > 0 ? 'border-destructive/40' : 'border-yellow-500/40'}`}>
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <AlertTriangle className={`w-5 h-5 ${data!.lowStock.outCount > 0 ? 'text-destructive' : 'text-yellow-600'}`} />
                  <h2 className="text-base lg:text-lg font-semibold">Stock Alerts</h2>
                  {data!.lowStock.outCount > 0 && <span className="px-2 py-0.5 rounded-full bg-destructive text-white text-xs font-medium">Out of stock: {data!.lowStock.outCount}</span>}
                  {data!.lowStock.lowCount > 0 && <span className="px-2 py-0.5 rounded-full bg-yellow-500 text-white text-xs font-medium">Low: {data!.lowStock.lowCount}</span>}
                  <Link href="/inventory" className="ml-auto text-sm text-accent hover:underline">Manage inventory →</Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {data!.lowStock.items.slice(0, 6).map((item: any) => (
                    <div key={item.id} className={`flex items-center justify-between p-3 rounded-xl ${item.is_out ? 'bg-red-50' : 'bg-yellow-50'}`}>
                      <div className="min-w-0">
                        <p className={`font-medium text-sm truncate ${item.is_out ? 'text-red-800' : 'text-yellow-800'}`}>{item.name}</p>
                        <p className={`text-xs ${item.is_out ? 'text-red-600' : 'text-yellow-700'}`}>{item.base_unit}</p>
                      </div>
                      <p className={`text-sm font-semibold shrink-0 ml-2 ${item.is_out ? 'text-red-700' : 'text-yellow-700'}`}>
                        {item.is_out ? 'OUT' : `${Number(item.quantity_on_hand)} / ${Number(item.reorder_level)}`}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Best / Least Selling */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-6 lg:mb-10">
              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <h2 className="text-base lg:text-lg font-semibold mb-4">Best Selling</h2>
                <div className="space-y-2">
                  {data!.topItems.map((it, i) => (
                    <div key={it.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                      <span className="text-sm font-medium">{i + 1}. {it.name}</span>
                      <span className="text-sm text-muted-foreground">{it.quantity} · {formatPHP(it.revenue)}</span>
                    </div>
                  ))}
                  {data!.topItems.length === 0 && <p className="text-sm text-muted-foreground">No sales yet.</p>}
                </div>
              </div>
              <div className="bg-card border border-border rounded-2xl p-4 lg:p-6">
                <h2 className="text-base lg:text-lg font-semibold mb-4">Least Selling</h2>
                <div className="space-y-2">
                  {data!.leastItems.map((it, i) => (
                    <div key={it.id} className="flex items-center justify-between bg-muted rounded-lg px-3 py-2">
                      <span className="text-sm font-medium">{i + 1}. {it.name}</span>
                      <span className="text-sm text-muted-foreground">{it.quantity_sold} sold</span>
                    </div>
                  ))}
                  {data!.leastItems.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
              <Link href="/pos" className="bg-card border border-border rounded-2xl p-4 lg:p-6 hover:border-accent transition-colors">
                <ShoppingCart className="w-6 h-6 lg:w-8 lg:h-8 text-accent mb-3" />
                <h3 className="font-semibold mb-1">Start New Sale</h3>
                <p className="text-sm text-muted-foreground">Ring up a new transaction</p>
              </Link>

              <Link href="/inventory" className="bg-card border border-border rounded-2xl p-4 lg:p-6 hover:border-accent transition-colors">
                <Package className="w-6 h-6 lg:w-8 lg:h-8 text-accent mb-3" />
                <h3 className="font-semibold mb-1">Check Inventory</h3>
                <p className="text-sm text-muted-foreground">View stock levels</p>
              </Link>

              <Link href="/reports" className="bg-card border border-border rounded-2xl p-4 lg:p-6 hover:border-accent transition-colors">
                <TrendingUp className="w-6 h-6 lg:w-8 lg:h-8 text-accent mb-3" />
                <h3 className="font-semibold mb-1">View Reports</h3>
                <p className="text-sm text-muted-foreground">Detailed analytics</p>
              </Link>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
