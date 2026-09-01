'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { Order } from '@/lib/types'
import { useAuth } from '@/lib/contexts/auth-context'

interface OrdersContextType {
  orders: Order[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  updateOrderStatus: (orderId: string, newStatus: string) => Promise<void>
  getActiveOrders: () => Order[]
  getCompletedOrders: () => Order[]
}

const OrdersContext = createContext<OrdersContextType | undefined>(undefined)

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { isAuthenticated } = useAuth()

  const refetch = useCallback(async () => {
    // Don't poll before login — avoids 401 console noise on /login.
    if (!isAuthenticated) { setLoading(false); return }
    try {
      const res = await fetch('/api/kds/orders')
      if (res.status === 401) { setOrders([]); setLoading(false); return }
      const data = await res.json()
      setOrders(data.orders || [])
      setError(null)
    } catch {
      setError('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    refetch()
    if (!isAuthenticated) return
    const interval = setInterval(refetch, 10000)
    return () => clearInterval(interval)
  }, [refetch, isAuthenticated])

  const updateOrderStatus = useCallback(async (orderId: string, newStatus: string) => {
    const res = await fetch(`/api/kds/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) await refetch()
  }, [refetch])

  const getActiveOrders = useCallback(() =>
    orders.filter(o => ['new', 'preparing', 'ready'].includes(o.status)),
  [orders])

  const getCompletedOrders = useCallback(() =>
    orders.filter(o => o.status === 'completed'),
  [orders])

  return (
    <OrdersContext.Provider value={{ orders, loading, error, refetch, updateOrderStatus, getActiveOrders, getCompletedOrders }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const context = useContext(OrdersContext)
  if (!context) throw new Error('useOrders must be used within OrdersProvider')
  return context
}
