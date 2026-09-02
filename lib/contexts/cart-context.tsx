'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { CartItem } from '@/lib/types'

interface CartContextType {
  items: CartItem[]
  addItem: (item: CartItem) => void
  removeItem: (key: string) => void
  updateQuantity: (key: string, quantity: number) => void
  clearCart: () => void
  getSubtotal: () => number
  itemCount: number
  getItemKey: (item: CartItem) => string
}

const CartContext = createContext<CartContextType | undefined>(undefined)

function itemKey(item: CartItem): string {
  const addons = [...item.addons].map(a => a.addon_id).sort().join('|')
  // notes are part of identity so two lines with different notes don't merge
  return `${item.menu_item_id}-${item.menu_item_variant_id || ''}-${addons}-${item.notes ?? ''}`
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])

  const addItem = useCallback((item: CartItem) => {
    setItems(prev => {
      const idx = prev.findIndex(i => itemKey(i) === itemKey(item))
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], quantity: next[idx].quantity + item.quantity }
        return next
      }
      return [...prev, item]
    })
  }, [])

  const removeItem = useCallback((key: string) => {
    setItems(prev => prev.filter(i => itemKey(i) !== key))
  }, [])

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setItems(prev => prev.map(i =>
      itemKey(i) === key
        ? { ...i, quantity: Math.max(1, quantity) }
        : i
    ))
  }, [])

  const clearCart = useCallback(() => setItems([]), [])

  const getSubtotal = useCallback(() => {
    return items.reduce((sum, item) => {
      const itemTotal = item.unit_price * item.quantity
      const addonTotal = item.addons.reduce((a, ad) => a + ad.unit_price * ad.quantity * item.quantity, 0)
      return sum + itemTotal + addonTotal
    }, 0)
  }, [items])

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, getSubtotal, itemCount, getItemKey: itemKey }}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart must be used within CartProvider')
  return context
}
