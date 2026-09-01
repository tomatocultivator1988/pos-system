'use client'

import { useState, useEffect, useRef } from 'react'
import AppLayout from '@/components/app-layout'
import { useCart } from '@/lib/contexts/cart-context'
import { useModal } from '@/lib/contexts/modal-context'
import { useAuth } from '@/lib/contexts/auth-context'
import { X, Trash2, Search, Plus, Printer } from 'lucide-react'
import type { CartItem } from '@/lib/types'
import { getCustomers } from '@/lib/actions/customers'
import { getBusinessSettings } from '@/lib/actions/settings'
import { printReceipt, printKitchenTicket, getAutoPrint, type ReceiptData } from '@/lib/utils/printer'
import { openCashDrawer } from '@/lib/utils/cash-drawer'
import { offlineStore } from '@/lib/offline/store'
import { syncNow, hasPending, pendingCount } from '@/lib/offline/sync'
import { PAYMENT_METHODS, PAYMENT_LABELS, isCash, paymentLabel, type PaymentMethod } from '@/lib/utils/payment-methods'

type MenuItem = { id: string; category_id: string; name: string; description: string; base_price: number; loyalty_points_earned: number; image_url?: string; send_to_kds?: boolean }
type MenuVariant = { id: string; menu_item_id: string; name: string; price_mode: string; price_override?: number; price_adjustment?: number; is_default: boolean }
type AddonGroup = { id: string; menu_item_id: string; name: string; min_selections: number; max_selections: number; is_required: boolean; addons: { id: string; addon_group_id: string; name: string; price_adjustment: number }[] }
type ItemAvailability = { servings: number | null; status: 'out' | 'low' | 'ok' }

export default function POSPage() {
  const [menuData, setMenuData] = useState<{ categories: any[]; items: MenuItem[]; variants: MenuVariant[]; addonGroups: AddonGroup[]; availability: Record<string, ItemAvailability> }>({ categories: [], items: [], variants: [], addonGroups: [], availability: {} })
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [showCheckout, setShowCheckout] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentRef, setPaymentRef] = useState('')
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null)
  const [selectedVariant, setSelectedVariant] = useState<MenuVariant | null>(null)
  const [selectedAddons, setSelectedAddons] = useState<{ addon_id: string; name: string; unit_price: number }[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<{ id: string; name: string; member_number: string } | null>(null)
  const [allCustomers, setAllCustomers] = useState<{ id: string; name: string; member_number: string; mobile_number?: string; loyalty_points_balance?: number }[]>([])
  const [showCustomerSelect, setShowCustomerSelect] = useState(false)
  const [receiptData, setReceiptData] = useState<{
    orderNumber: string; total: number; paymentMethod: string; loyaltyPoints: number
    items: CartItem[]; customerName?: string; subtotal: number; tax: number; date: string
    amountTendered?: number; change?: number; loyaltyBalance?: number | null
    discount?: number; discountLabel?: string
  } | null>(null)
  const [amountTendered, setAmountTendered] = useState('')

  const { items, addItem, removeItem, updateQuantity, clearCart, getSubtotal, getItemKey } = useCart()
  const { showConfirmation, showLoading, hideLoading, hideConfirmation } = useModal()
  const { currentStaff } = useAuth()
  const idempotencyKeyRef = useRef(crypto.randomUUID())
  const isProcessingRef = useRef(false)
  const [taxRate, setTaxRate] = useState(0)
  const [businessName, setBusinessName] = useState('Bean Brewyage')

  const [menuError, setMenuError] = useState<string | null>(null)
  const [offline, setOffline] = useState(false)
  const [syncIssues, setSyncIssues] = useState(0)
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [discountType, setDiscountType] = useState<'senior_pwd' | 'employee' | null>(null)

  const loadMenu = async () => {
    try {
      const r = await fetch('/api/menu')
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load menu')
      setMenuData(data)
      offlineStore.setCatalog(data)
      getBusinessSettings().then(s => { if (s) { const t = Number(s.tax_rate) || 0; setTaxRate(t); offlineStore.setTaxRate(t); if (s.business_name) { setBusinessName(s.business_name); offlineStore.setBusinessName(s.business_name) } } }).catch(() => {})
    } catch (err: any) {
      const cached = offlineStore.getCatalog()
      if (cached) {
        setMenuData(cached as any)
        setTaxRate(offlineStore.getTaxRate())
        setBusinessName(offlineStore.getBusinessName() || 'Bean Brewyage')
        setMenuError(null)
      } else {
        setMenuError(err.message || 'Failed to load menu')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMenu() }, [])

  // Don't let a discount linger onto the next sale after the cart empties.
  useEffect(() => { if (items.length === 0) setDiscountType(null) }, [items.length])

  useEffect(() => {
    const t = setInterval(loadMenu, 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    setSyncIssues(pendingCount())
    const onOnline = () => {
      setOffline(false)
      syncNow().then(() => { setSyncIssues(pendingCount()) }).catch(() => {})
    }
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  const retrySync = async () => {
    const { failed } = await syncNow()
    setSyncIssues(pendingCount())
    if (failed > 0) {
      const err = offlineStore.getLastError()
      showConfirmation({ title: 'Sync Failed', description: err?.message || 'Some offline sales could not sync', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
    } else if (hasPending()) {
      // still pending (e.g. network) — keep modal open
    } else {
      setShowSyncModal(false)
    }
  }

  const discardQueued = (idempotencyKey: string) => {
    offlineStore.setQueue(offlineStore.getQueue().filter(q => q.idempotencyKey !== idempotencyKey))
    setSyncIssues(pendingCount())
  }

  const categories = menuData.categories
  const filteredItems = menuData.items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || item.category_id === selectedCategory
    return matchesSearch && matchesCategory
  })

  const getItemPrice = (item: MenuItem, variant?: MenuVariant | null) => {
    if (!variant) return item.base_price
    return variant.price_mode === 'override' ? (variant.price_override ?? item.base_price) : item.base_price + (variant.price_adjustment ?? 0)
  }

  const handleItemClick = (item: MenuItem) => {
    const availability = menuData.availability?.[item.id]
    if (availability?.status === 'out') {
      showConfirmation({
        title: 'Out of Stock',
        description: `"${item.name}" is out of stock and cannot be added.`,
        confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false,
      })
      return
    }

    const itemVariants = menuData.variants.filter(v => v.menu_item_id === item.id)
    const itemAddonGroups = menuData.addonGroups.filter(g => g.menu_item_id === item.id)

    if (itemVariants.length === 0 && itemAddonGroups.length === 0) {
      addItem({ menu_item_id: item.id, name: item.name, unit_price: item.base_price, quantity: 1, addons: [] })
      return
    }

    setSelectedItem(item)
    setSelectedVariant(itemVariants.find(v => v.is_default) || itemVariants[0] || null)
    setSelectedAddons([])
  }

  const handleAddToCart = () => {
    if (!selectedItem) return

    const itemGroups = menuData.addonGroups.filter(g => g.menu_item_id === selectedItem.id)
    for (const group of itemGroups) {
      const groupAddonIds = group.addons.map(a => a.id)
      const selectedCount = selectedAddons.filter(a => groupAddonIds.includes(a.addon_id)).length
      if (group.is_required && selectedCount === 0) {
        showConfirmation({
          title: 'Required', description: `"${group.name}" requires at least 1 selection.`,
          confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false,
        })
        return
      }
      if (selectedCount < group.min_selections) {
        showConfirmation({
          title: 'Minimum Not Met', description: `"${group.name}" requires at least ${group.min_selections} selection(s).`,
          confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false,
        })
        return
      }
      if (group.max_selections > 0 && selectedCount > group.max_selections) {
        showConfirmation({
          title: 'Maximum Exceeded', description: `"${group.name}" allows at most ${group.max_selections} selection(s).`,
          confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false,
        })
        return
      }
    }

    const price = getItemPrice(selectedItem, selectedVariant)
    addItem({
      menu_item_id: selectedItem.id,
      menu_item_variant_id: selectedVariant?.id,
      name: selectedItem.name,
      variant_name: selectedVariant?.name,
      unit_price: price,
      quantity: 1,
      addons: selectedAddons.map(a => ({ addon_id: a.addon_id, name: a.name, unit_price: a.unit_price, quantity: 1 })),
    })
    setSelectedItem(null)
    setSelectedVariant(null)
    setSelectedAddons([])
  }

  const discountLabel = discountType === 'senior_pwd' ? 'SC/PWD Discount' : discountType === 'employee' ? 'Employee Discount' : ''
  // Mirrors complete_sale_v1: round subtotal, round tax, then discount on (subtotal + tax).
  const round2 = (n: number) => Math.round(n * 100) / 100
  const getSub = () => round2(getSubtotal())
  const getTax = () => round2(getSub() * taxRate / 100)
  const getDiscount = () => {
    if (!discountType) return 0
    const rate = discountType === 'senior_pwd' ? 0.20 : 0.10
    return round2((getSub() + getTax()) * rate)
  }
  const getFinalTotal = () => round2(getSub() + getTax() - getDiscount())

  const toPrinterReceipt = (rc: any): ReceiptData => ({
    header: businessName,
    subtitle: '',
    items: (rc?.items ?? []).map((i: any) => ({
      name: `${i.name}${i.variant_name ? ` (${i.variant_name})` : ''}${i.addons.length > 0 ? ' + ' + i.addons.map((a: any) => a.name).join(', + ') : ''}`,
      qty: i.quantity,
      price: Math.round((i.unit_price * i.quantity + i.addons.reduce((s: number, a: any) => s + a.unit_price * a.quantity, 0)) * 100) / 100,
    })),
    subtotal: rc?.subtotal ?? 0,
    discount: rc?.discount ?? 0,
    discountLabel: rc?.discountLabel,
    tax: rc?.tax ?? 0,
    total: rc?.total ?? 0,
    paymentMethod: rc?.paymentMethod ?? '',
    amountTendered: rc?.amountTendered ?? 0,
    change: rc?.change ?? 0,
    orderNumber: rc?.orderNumber ?? '',
    date: new Date(rc?.date ?? Date.now()).toLocaleString('en-PH'),
    cashier: currentStaff?.name ?? 'Cashier',
    footer: 'Thank you for your purchase!',
    points: rc?.loyaltyPoints ?? 0,
    pointsBalance: rc?.loyaltyBalance ?? undefined,
  })

  const printCurrentReceipt = async () => {
    if (!receiptData) return
    const ok = await printReceipt(toPrinterReceipt(receiptData))
    if (!ok) window.print()
  }

  const handleCheckout = () => {
    if (items.length === 0 || isProcessingRef.current) return
    const finalTotal = getFinalTotal()
    const tendered = parseFloat(amountTendered) || 0

    if (paymentMethod === 'cash' && tendered < finalTotal) {
      showConfirmation({
        title: 'Insufficient Amount',
        description: `Amount tendered (₱${tendered.toFixed(2)}) is less than total (₱${finalTotal.toFixed(2)}).`,
        confirmText: 'OK', cancelText: '',
        onConfirm: () => hideConfirmation(), isDestructive: false,
      })
      return
    }

    const changeDesc = paymentMethod === 'cash' ? `\nTendered: ₱${tendered.toFixed(2)}\nChange: ₱${Math.max(0, tendered - finalTotal).toFixed(2)}` : ''

    showConfirmation({
      title: 'Complete Sale',
      description: `Total: ₱${finalTotal.toFixed(2)}${getDiscount() > 0 ? ` (less ${discountLabel} -₱${getDiscount().toFixed(2)})` : ''}${taxRate > 0 ? ` (incl. ${taxRate}% tax)` : ''} | Payment: ${paymentMethod.toUpperCase()}${selectedCustomer ? `\nCustomer: ${selectedCustomer.name}` : ''}${changeDesc}`,
      confirmText: 'Yes, Complete',
      cancelText: 'Cancel',
      onConfirm: async () => {
        if (isProcessingRef.current) return
        isProcessingRef.current = true
        showLoading('Processing transaction...')
        const capturedTendered = amountTendered
        const capturedGcashRef = paymentRef
        const cartItems = items
        const payload = {
          idempotency_key: idempotencyKeyRef.current,
          items: cartItems.map(i => ({
            menu_item_id: i.menu_item_id,
            menu_item_variant_id: i.menu_item_variant_id,
            quantity: i.quantity,
            addons: i.addons.map(a => ({ addon_id: a.addon_id, quantity: a.quantity })),
            notes: i.notes,
          })),
          payment_method: paymentMethod,
          gcash_reference: !isCash(paymentMethod) ? capturedGcashRef : undefined,
          customer_id: selectedCustomer?.id,
          amount_tendered: paymentMethod === 'cash' ? parseFloat(capturedTendered) || null : null,
          discount_type: discountType,
        }
        // Server-matching totals (subtotal incl. addons, tax, discount, grand)
        const sub = getSub()
        const tax = getTax()
        const disc = getDiscount()
        const grand = getFinalTotal()

        const finalizeOffline = async () => {
          const n = offlineStore.getLastOfflineNum() + 1
          offlineStore.setLastOfflineNum(n)
          const ref = `OF-${String(n).padStart(3, '0')}`
          offlineStore.setQueue([...offlineStore.getQueue(), {
            idempotencyKey: idempotencyKeyRef.current,
            body: {
              ...payload,
              offline_sync: true,
              sold_at: new Date().toISOString(),
              sold_subtotal: sub,
              sold_tax_total: tax,
              sold_grand_total: grand,
              sold_discount_total: disc,
            },
            createdAt: new Date().toISOString(),
            ref,
          }])
          setSyncIssues(pendingCount())

          hideLoading()
          hideConfirmation()
          clearCart()
          idempotencyKeyRef.current = crypto.randomUUID()
          setSelectedCustomer(null)
          setShowCustomerSelect(false)
          setPaymentRef('')
          setAmountTendered('')
          setDiscountType(null)
          setShowCheckout(false)

          const finalTendered = paymentMethod === 'cash' ? parseFloat(capturedTendered) || grand : grand
          const rc = {
            orderNumber: ref,
            total: grand,
            paymentMethod,
            loyaltyPoints: Math.floor(grand / 50),
            loyaltyBalance: selectedCustomer ? (allCustomers.find(c => c.id === selectedCustomer.id)?.loyalty_points_balance ?? null) : null,
            items: [...cartItems],
            customerName: selectedCustomer?.name,
            subtotal: sub,
            discount: disc,
            discountLabel,
            tax,
            date: new Date().toISOString(),
            amountTendered: finalTendered,
            change: Math.max(0, finalTendered - grand),
          }
          setReceiptData(rc)
          try {
            if (getAutoPrint()) await printReceipt(toPrinterReceipt(rc))
          } catch { /* auto-print best-effort */ }

          const foodItems = cartItems.filter(i => menuData.items.find(m => m.id === i.menu_item_id)?.send_to_kds)
            .map(i => ({ name: i.name, qty: i.quantity, variantName: i.variant_name, addons: i.addons.map(a => a.name) }))
          if (foodItems.length > 0) {
            try { await printKitchenTicket(ref, foodItems) } catch { /* best-effort */ }
          }

          if (paymentMethod === 'cash') {
            try { await openCashDrawer() } catch { /* drawer best-effort */ }
          }
        }

        let r: Response
        try {
          r = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        } catch {
          // Network drop — sale may or may not have committed; queue idempotently.
          await finalizeOffline()
          isProcessingRef.current = false
          return
        }

        const result = await r.json()
        if (!r.ok) {
          hideLoading()
          hideConfirmation()
          if (r.status >= 500) {
            // Server error: the RPC never ran — queue idempotently.
            await finalizeOffline()
          } else {
            showConfirmation({ title: 'Error', description: result.error || 'Transaction failed', confirmText: 'OK', cancelText: '', onConfirm: () => hideConfirmation(), isDestructive: false })
          }
          isProcessingRef.current = false
          return
        }

        hideLoading()
        hideConfirmation()
        clearCart()
        idempotencyKeyRef.current = crypto.randomUUID()
        setSelectedCustomer(null)
        setShowCustomerSelect(false)
        setPaymentRef('')
        setAmountTendered('')
        setDiscountType(null)
        setShowCheckout(false)
        const finalTendered = paymentMethod === 'cash' ? parseFloat(capturedTendered) || result.grand_total : result.grand_total
        const rc = {
          orderNumber: result.order_number,
          total: result.grand_total,
          paymentMethod,
          loyaltyPoints: result.loyalty_points_earned || 0,
          loyaltyBalance: result.loyalty_points_balance ?? null,
          items: [...cartItems],
          customerName: selectedCustomer?.name,
          subtotal: result.subtotal,
          discount: result.discount_total ?? 0,
          discountLabel,
          tax: result.tax_total,
          date: new Date().toISOString(),
          amountTendered: finalTendered,
          change: Math.max(0, finalTendered - result.grand_total),
        }
        setReceiptData(rc)
        try {
          if (getAutoPrint()) await printReceipt(toPrinterReceipt(rc))
        } catch { /* auto-print best-effort */ }
        if (paymentMethod === 'cash') {
          try { await openCashDrawer() } catch { /* drawer best-effort */ }
        }
        isProcessingRef.current = false
      },
      isDestructive: false,
    })
  }

  if (loading) return <AppLayout><div className="p-8 text-center"><p className="text-muted-foreground">Loading menu...</p></div></AppLayout>
  if (menuError) return (
    <AppLayout>
      <div className="p-8 text-center py-12">
        <p className="text-destructive mb-4">{menuError}</p>
        <button onClick={() => { setLoading(true); setMenuError(null); window.location.reload() }} className="bg-accent text-white px-4 py-2 rounded-lg">Retry</button>
      </div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <div className="p-8 grid grid-cols-1 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        <div className="lg:col-span-3">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-3xl font-semibold">POS Terminal</h1>
              <div className="flex items-center gap-2">
                {offline && <span className="px-3 py-1 rounded-full bg-destructive text-white text-xs font-semibold">Offline — saving locally</span>}
                {syncIssues > 0 && (
                  <button onClick={() => setShowSyncModal(true)} className="px-3 py-1 rounded-full bg-yellow-500 text-white text-xs font-semibold hover:bg-yellow-600">⚠ {syncIssues} pending sync</button>
                )}
              </div>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input type="text" placeholder="Search items..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-border rounded-lg bg-card" />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => setSelectedCategory('')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${!selectedCategory ? 'bg-accent text-white' : 'bg-card border border-border hover:bg-muted'}`}>All</button>
              {categories.map((cat: any) => (
                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${selectedCategory === cat.id ? 'bg-accent text-white' : 'bg-card border border-border hover:bg-muted'}`}>{cat.name}</button>
              ))}
            </div>
            {filteredItems.length === 0 && <p className="text-center text-muted-foreground py-8">No items found</p>}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredItems.map(item => {
              const avail = menuData.availability?.[item.id]
              return (
              <button key={item.id} onClick={() => handleItemClick(item)} className={`bg-card border rounded-xl p-4 transition-colors text-left group relative ${avail?.status === 'out' ? 'border-destructive/40 opacity-60' : 'border-border hover:border-accent'}`}>
                <div className="mb-3 h-24 bg-muted rounded-lg flex items-center justify-center group-hover:bg-muted/80 transition-colors overflow-hidden">{item.image_url ? <><img src={item.image_url} className="w-full h-24 object-cover" alt={item.name} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; const sib = (e.target as HTMLImageElement).nextElementSibling; if (sib) (sib as HTMLElement).style.display = 'block' }} /><span className="text-3xl" style={{ display: 'none' }}>☕</span></> : <span className="text-3xl">☕</span>}
                  {avail?.status === 'out' && <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-destructive text-white text-[10px] font-semibold">OUT</span>}
                  {avail?.status === 'low' && <span className="absolute top-2 right-2 px-2 py-0.5 rounded bg-yellow-500 text-white text-[10px] font-semibold">LOW</span>}
                </div>
                <h3 className="font-semibold text-sm mb-1 truncate">{item.name}</h3>
                <p className="text-lg font-semibold text-accent">₱{(menuData.variants.find(v => v.menu_item_id === item.id && v.is_default) ?? menuData.variants.find(v => v.menu_item_id === item.id) ?? null) ? getItemPrice(item, menuData.variants.find(v => v.menu_item_id === item.id && v.is_default) ?? menuData.variants.find(v => v.menu_item_id === item.id) ?? null).toFixed(2) : item.base_price.toFixed(2)}</p>
              </button>
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-6 sticky top-20">
            <h2 className="text-xl font-semibold mb-4">Order Summary</h2>
            <div className="space-y-3 mb-6 max-h-64 overflow-y-auto">
              {items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">No items added</p> : items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start gap-2 pb-3 border-b border-border">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}{item.variant_name ? ` (${item.variant_name})` : ''}</p>
                    {item.addons.length > 0 && <p className="text-xs text-muted-foreground">{item.addons.map(a => a.name).join(', ')}</p>}
                    <div className="flex items-center gap-2 mt-1">
                      <button onClick={() => updateQuantity(getItemKey(item), item.quantity - 1)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">-</button>
                      <span className="text-xs font-medium">{item.quantity}</span>
                      <button onClick={() => updateQuantity(getItemKey(item), item.quantity + 1)} className="px-2 py-1 text-xs border border-border rounded hover:bg-muted">+</button>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">₱{(item.unit_price * item.quantity + item.addons.reduce((s, a) => s + a.unit_price * a.quantity, 0)).toFixed(2)}</p>
                    <button onClick={() => removeItem(getItemKey(item))} className="mt-1 text-destructive hover:text-destructive/80"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div className="space-y-2 border-t border-border pt-4 mb-4">
                {getDiscount() > 0 && (
                  <div className="flex justify-between text-sm text-destructive">
                    <span>{discountType === 'senior_pwd' ? 'Senior/PWD 20%' : 'Employee 10%'}:</span>
                    <span>-₱{getDiscount().toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-lg pt-2 border-t border-border">
                  <span>Total{taxRate > 0 ? ` (incl. ${taxRate}% tax)` : ''}:</span>
                  <span className="text-accent">₱{getFinalTotal().toFixed(2)}</span>
                </div>
              </div>
            )}

            {items.length > 0 && (
              <div className="space-y-2">
                <button onClick={() => { setShowCheckout(!showCheckout); if (!showCheckout) { getCustomers().then(cs => { setAllCustomers(cs); offlineStore.setCustomers(cs) }).catch(() => { setAllCustomers(offlineStore.getCustomers() as any) }) } }} className="w-full bg-accent text-white py-2 rounded-lg font-medium hover:opacity-90 active:scale-95 transition-all duration-100">
                  {showCheckout ? 'Back' : 'Checkout'}
                </button>
                <button onClick={() => { clearCart(); idempotencyKeyRef.current = crypto.randomUUID(); setShowCheckout(false); setSelectedCustomer(null); setShowCustomerSelect(false); setAmountTendered(''); setPaymentRef(''); setDiscountType(null) }} className="w-full bg-muted text-foreground py-2 rounded-lg font-medium hover:bg-muted/80 active:scale-95 transition-all duration-100 flex items-center justify-center gap-2">
                  <Trash2 className="w-4 h-4" /> Clear Cart
                </button>
              </div>
            )}

            {showCheckout && items.length > 0 && (
              <div className="border-t border-border pt-4 space-y-4">
                {/* Customer Select */}
                <div>
                  <label className="text-xs font-medium block mb-2">Customer</label>
                  {selectedCustomer ? (
                    <div className="flex items-center justify-between bg-accent/10 border border-accent rounded-lg px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{selectedCustomer.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedCustomer.member_number}</p>
                      </div>
                      <button onClick={() => { setSelectedCustomer(null); setShowCustomerSelect(false) }} className="text-destructive hover:text-destructive/80"><X className="w-4 h-4" /></button>
                    </div>
                  ) : showCustomerSelect ? (
                    <div className="relative">
                      <div className="flex gap-1">
                        <select
                          className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm"
                          onChange={e => {
                            const c = allCustomers.find(x => x.id === e.target.value)
                            if (c) { setSelectedCustomer(c); setShowCustomerSelect(false) }
                          }}
                          value=""
                        >
                          <option value="">Select a customer...</option>
                          {allCustomers.map(c => (
                            <option key={c.id} value={c.id}>{c.name} ({c.member_number})</option>
                          ))}
                        </select>
                        <button onClick={() => setShowCustomerSelect(false)} className="px-2 py-2 border border-border rounded-lg bg-muted text-muted-foreground hover:text-foreground text-sm"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowCustomerSelect(true)} className="w-full px-3 py-2 border border-dashed border-border rounded-lg text-sm text-muted-foreground hover:border-accent hover:text-accent transition-colors">
                      + Select Customer
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium block mb-2">Discount</label>
                  <div className="flex gap-2">
                    {([null, 'senior_pwd', 'employee'] as const).map(dt => (
                      <button key={dt ?? 'none'} type="button" onClick={() => setDiscountType(dt)} className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${discountType === dt ? 'bg-accent text-white' : 'bg-muted text-foreground'}`}>
                        {dt === null ? 'None' : dt === 'senior_pwd' ? 'Senior/PWD 20%' : 'Employee 10%'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium block mb-2">Payment Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    {PAYMENT_METHODS.map(m => (
                      <button key={m} onClick={() => setPaymentMethod(m)} className={`px-2 py-2 rounded-lg text-sm font-medium transition-colors ${paymentMethod === m ? 'bg-accent text-white' : 'bg-muted text-foreground'}`}>{PAYMENT_LABELS[m]}</button>
                    ))}
                  </div>
                </div>
                {!isCash(paymentMethod) && (
                  <div>
                    <label htmlFor="payment-ref" className="text-xs font-medium block mb-2">{PAYMENT_LABELS[paymentMethod]} Reference #</label>
                    <input id="payment-ref" type="text" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} className="w-full px-3 py-2 border border-border rounded-lg text-sm" placeholder="Required" />
                  </div>
                )}
                {isCash(paymentMethod) && (
                  <div>
                    <label className="text-xs font-medium block mb-2">Amount Tendered (₱)</label>
                    <div className="flex gap-1 mb-2 flex-wrap">
                      {[50, 100, 200, 500, 1000].map(amt => (
                        <button key={amt} onClick={() => setAmountTendered(prev => String((parseFloat(prev) || 0) + amt))} className="px-2 py-1 text-xs border border-border rounded-lg bg-background hover:bg-muted font-mono">+₱{amt}</button>
                      ))}
                      <button onClick={() => setAmountTendered(String(Math.ceil(getFinalTotal() / 50) * 50))} className="px-2 py-1 text-xs border border-border rounded-lg bg-background hover:bg-muted">Round Up</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="number" step="0.01" min="0" value={amountTendered} onChange={e => setAmountTendered(e.target.value)} className="flex-1 px-3 py-2 border border-border rounded-lg text-sm" placeholder="0.00" />
                      <span className="text-xs text-muted-foreground">=</span>
                    </div>
                    {amountTendered && parseFloat(amountTendered) > 0 && parseFloat(amountTendered) >= getFinalTotal() && (
                      <div className="mt-2 flex justify-between items-center bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <span className="text-sm font-medium text-green-800">Change</span>
                        <span className="text-lg font-bold text-green-800">₱{(parseFloat(amountTendered) - getFinalTotal()).toFixed(2)}</span>
                      </div>
                    )}
                    {amountTendered && parseFloat(amountTendered) > 0 && parseFloat(amountTendered) < getFinalTotal() && (
                      <p className="text-xs text-destructive mt-1">Insufficient amount</p>
                    )}
                  </div>
                )}
                <button onClick={handleCheckout} disabled={items.length === 0 || (isCash(paymentMethod) && (parseFloat(amountTendered) || 0) < getFinalTotal()) || (!isCash(paymentMethod) && !paymentRef.trim())} className="w-full bg-green-600 text-white py-2 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">Complete Sale</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Item Variant/Addon Modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-card rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">{selectedItem.name}</h2>
              <button onClick={() => setSelectedItem(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
            </div>

            {menuData.variants.filter(v => v.menu_item_id === selectedItem.id).length > 0 && (
              <div className="mb-4">
                <label className="text-xs font-medium block mb-2">Variant</label>
                <div className="flex gap-2 flex-wrap">
                  {menuData.variants.filter(v => v.menu_item_id === selectedItem.id).map(v => (
                    <button key={v.id} onClick={() => setSelectedVariant(v)} className={`px-3 py-1.5 rounded-lg text-sm ${selectedVariant?.id === v.id ? 'bg-accent text-white' : 'bg-muted'}`}>
                      {v.name} ₱{getItemPrice(selectedItem, v).toFixed(2)}
                      {v.price_mode === 'adjustment' && v.price_adjustment && v.price_adjustment > 0 ? <span className="text-xs opacity-70 ml-1">(+₱{v.price_adjustment.toFixed(0)})</span> : null}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {menuData.addonGroups.filter(g => g.menu_item_id === selectedItem.id).map(group => (
              <div key={group.id} className="mb-4">
                <label className="text-xs font-medium block mb-2">{group.name}{group.is_required ? ' *' : ''}</label>
                <div className="space-y-2">
                  {group.addons.filter(a => a.addon_group_id === group.id).map(addon => (
                    <label key={addon.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={selectedAddons.some(a => a.addon_id === addon.id)} onChange={e => {
                        setSelectedAddons(prev => e.target.checked ? [...prev, { addon_id: addon.id, name: addon.name, unit_price: addon.price_adjustment }] : prev.filter(a => a.addon_id !== addon.id))
                      }} />
                      {addon.name} {addon.price_adjustment > 0 ? `(+₱${addon.price_adjustment.toFixed(2)})` : ''}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={handleAddToCart} className="w-full bg-accent text-white py-2 rounded-lg font-medium">Add to Cart — ₱{getItemPrice(selectedItem, selectedVariant).toFixed(2)}</button>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {receiptData && (
        <>
          <style>{`@media print { body * { visibility: hidden; } #receipt, #receipt * { visibility: visible; } #receipt { position: fixed; left: 0; top: 0; width: 100%; } }`}</style>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:bg-white print:static">
          <div id="receipt" className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl print:shadow-none print:max-w-full print:w-full">
            {/* Header */}
            <div className="text-center mb-4 pb-4 border-b border-dashed border-gray-300">
              <h2 className="text-xl font-bold">Bean Brewyage</h2>
              <p className="text-xs text-gray-500 mt-1">{new Date(receiptData.date).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              <p className="text-lg font-semibold mt-2 text-gray-800">{receiptData.orderNumber}</p>
              {receiptData.customerName && <p className="text-sm text-gray-500">Customer: {receiptData.customerName}</p>}
            </div>

            {/* Items */}
            <div className="space-y-2 mb-4 pb-4 border-b border-dashed border-gray-300">
              {receiptData.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <div className="flex-1">
                    <span className="font-medium">{item.quantity}x {item.name}</span>
                    {item.variant_name && <span className="text-gray-500"> ({item.variant_name})</span>}
                    {item.addons.length > 0 && (
                      <div className="text-xs text-gray-400 ml-3">
                        {item.addons.map(a => `+ ${a.name} (₱${(a.unit_price * a.quantity).toFixed(2)})`).join(', ')}
                      </div>
                    )}
                  </div>
                  <span className="font-medium">₱{(item.unit_price * item.quantity + item.addons.reduce((s, a) => s + a.unit_price * a.quantity, 0)).toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Totals */}
              <div className="space-y-1 text-sm mb-4 pb-4 border-b border-dashed border-gray-300">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>₱{receiptData.subtotal.toFixed(2)}</span></div>
                {!!receiptData.discount && receiptData.discount > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">{receiptData.discountLabel || 'Discount'}</span><span className="text-red-500">-₱{receiptData.discount.toFixed(2)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>₱{receiptData.tax.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="capitalize">{paymentLabel(receiptData.paymentMethod)}</span></div>
                {receiptData.paymentMethod === 'cash' && receiptData.amountTendered != null && (
                  <>
                    <div className="flex justify-between"><span className="text-gray-500">Tendered</span><span>₱{receiptData.amountTendered.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Change</span><span className="font-medium">₱{receiptData.change?.toFixed(2)}</span></div>
                  </>
                )}
                {receiptData.loyaltyBalance != null && (
                  <div className="flex justify-between"><span className="text-gray-500">Points Balance</span><span className="text-accent font-medium">{receiptData.loyaltyBalance}</span></div>
                )}
                {receiptData.loyaltyPoints > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">Points Earned</span><span className="text-accent font-medium">+{receiptData.loyaltyPoints}</span></div>
                )}
              </div>

            {/* Grand Total */}
            <div className="text-center mb-4">
              <p className="text-sm text-gray-500">TOTAL</p>
              <p className="text-3xl font-bold">₱{receiptData.total.toFixed(2)}</p>
            </div>

            {/* Footer */}
            <p className="text-xs text-center text-gray-400 mb-6">Thank you for your purchase!</p>

            {/* Buttons */}
            <div className="flex gap-2 print:hidden">
              <button onClick={() => setReceiptData(null)} className="flex-1 px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium">
                Close
              </button>
              <button onClick={printCurrentReceipt} className="flex-1 px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 text-sm font-medium flex items-center justify-center gap-2">
                <Printer className="w-4 h-4" /> Print Receipt
              </button>
            </div>
          </div>
        </div>
        </>
      )}

      {/* Offline Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl">
            <h2 className="text-xl font-bold mb-2">Offline Sales</h2>
            <p className="text-sm text-muted-foreground mb-4">{syncIssues} sale(s) waiting to sync.</p>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {offlineStore.getQueue().length === 0 && <p className="text-sm text-muted-foreground">Nothing pending.</p>}
              {offlineStore.getQueue().map(item => (
                <div key={item.idempotencyKey} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-semibold">{item.ref}</div>
                    <div className="text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleTimeString('en-PH')}</div>
                  </div>
                  <button onClick={() => discardQueued(item.idempotencyKey)} className="rounded-full border border-red-400/40 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-500/20">Discard</button>
                </div>
              ))}
            </div>
            {offlineStore.getLastError() && (
              <p className="text-xs text-destructive mb-3"><strong>Last error:</strong> {offlineStore.getLastError()!.message}</p>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowSyncModal(false)} className="flex-1 px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium">Close</button>
              <button onClick={retrySync} className="flex-1 px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 text-sm font-medium">Sync Now</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
