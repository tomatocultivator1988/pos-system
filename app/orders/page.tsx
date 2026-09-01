'use client'

import AppLayout from '@/components/app-layout'
import { useOrders } from '@/lib/contexts/orders-context'

export default function OrdersPage() {
  const { orders, loading, updateOrderStatus, getActiveOrders } = useOrders()
  const activeOrders = getActiveOrders()

  const elapsed = (created: string) => {
    if (!created || isNaN(new Date(created).getTime())) return '--'
    const diff = Date.now() - new Date(created).getTime()
    const m = Math.floor(diff / 60000)
    const s = Math.floor((diff % 60000) / 1000)
    return `${m}m ${s}s`
  }

  const minutes = (created: string) => {
    if (!created || isNaN(new Date(created).getTime())) return 0
    return Math.floor((Date.now() - new Date(created).getTime()) / 60000)
  }

  const cardClass = (created: string) => {
    const m = minutes(created)
    if (m >= 5) return 'bg-red-50 border-red-400'
    if (m >= 3) return 'bg-yellow-50 border-yellow-400'
    return 'bg-card border-border'
  }

  const timeClass = (created: string) => {
    const m = minutes(created)
    if (m >= 5) return 'text-red-600'
    if (m >= 3) return 'text-yellow-700'
    return 'text-muted-foreground'
  }

  if (loading) return <AppLayout><div className="p-8 text-center"><p>Loading orders...</p></div></AppLayout>

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Kitchen Display System</h1>
          <p className="text-muted-foreground">Real-time order management for kitchen staff</p>
        </div>

        <div className="mb-8 flex items-center gap-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-sm text-muted-foreground mb-1">Active Orders</p>
            <p className="text-2xl font-semibold">{activeOrders.length}</p>
          </div>
          <div className="text-xs text-muted-foreground">
            <p className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm bg-yellow-200 border border-yellow-400" /> 3+ min</p>
            <p className="flex items-center gap-1 mt-1"><span className="inline-block w-3 h-3 rounded-sm bg-red-200 border border-red-400" /> 5+ min</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeOrders.map(order => (
            <div key={order.id} className={`border rounded-xl p-4 animate-slideInUp ${cardClass(order.created_at)}`}>
              <div className="flex justify-between items-start mb-2">
                <span className="text-lg font-semibold">{order.order_number}</span>
                <span className={`text-xs font-medium ${timeClass(order.created_at)}`}>{elapsed(order.created_at)}</span>
              </div>
              <div className="space-y-1 mb-3">
                {order.order_items?.map((item: any) => (
                  <div key={item.id} className="text-sm">
                    <span>{item.quantity}x {item.item_name}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                    {item.order_item_addons?.map((ad: any) => (
                      <span key={ad.id} className="text-xs text-muted-foreground ml-2">+ {ad.addon_name}</span>
                    ))}
                  </div>
                ))}
              </div>
              <button
                onClick={() => updateOrderStatus(order.id, 'completed')}
                className="w-full bg-accent text-white py-1.5 rounded-lg text-sm font-medium hover:opacity-90"
              >
                Done
              </button>
            </div>
          ))}
          {activeOrders.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-12 col-span-full">No active orders</p>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
