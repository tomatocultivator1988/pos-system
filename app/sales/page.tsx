'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { X, Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import { paymentLabel } from '@/lib/utils/payment-methods'
import { getBusinessSettings } from '@/lib/actions/settings'

export default function SalesPage() {
  const [sales, setSales] = useState<any[]>([])
  const [selectedSale, setSelectedSale] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 50
  const [businessName, setBusinessName] = useState('Bean Brewyage')

  useEffect(() => {
    getBusinessSettings().then(s => { if (s?.business_name) setBusinessName(s.business_name) }).catch(() => {})
  }, [])

  const [actionOpen, setActionOpen] = useState<{ sale: any; type: 'void' | 'refund' } | null>(null)
  const [actionReason, setActionReason] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const loadSales = async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/sales?page=${p}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Failed to load sales')
      setSales(data.sales || [])
      setTotal(data.total || 0)
      setPage(p)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSales(1) }, [])

  const runAction = async () => {
    if (!actionOpen || actionBusy) return
    if (!actionReason.trim()) { setActionError('Please provide a reason'); return }
    setActionBusy(true)
    setActionError(null)
    try {
      const r = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionOpen.type, order_id: actionOpen.sale.id, reason: actionReason.trim() }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || `${actionOpen.type} failed`)
      setActionOpen(null)
      setActionReason('')
      loadSales(page)
    } catch (err: any) {
      setActionError(err.message)
    } finally {
      setActionBusy(false)
    }
  }

  const totalPages = Math.ceil(total / pageSize)

  const formatDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'

  return (
    <AppLayout>
      <div className="p-8 max-w-5xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Sales History</h1>
          <p className="text-muted-foreground">View all transactions and receipts</p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-700 mb-2">{error}</p>
            <button onClick={() => loadSales(page)} className="px-4 py-2 bg-accent text-white rounded-lg text-sm">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-xl h-12" />
            ))}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-6 py-4 text-left text-sm font-semibold">Order #</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Date & Time</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Items</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">Discount</th>
                  <th className="px-6 py-4 text-right text-sm font-semibold">Total</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold">Payment</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale: any) => {
                  const isVoided = sale.status === 'voided' || sale.payment_status === 'voided'
                  const isRefunded = sale.payment_status === 'refunded'
                  const canVoid = (sale.status === 'new' || sale.status === 'preparing') && !isVoided && !isRefunded
                  const canRefund = (sale.status === 'ready' || sale.status === 'completed') && !isVoided && !isRefunded
                  const voidTip = !canVoid ? (isVoided ? 'Already voided' : isRefunded ? 'Already refunded' : 'Only new/preparing can be voided (before kitchen finishes)') : 'Cancel before preparation — refunds money, restores stock if new'
                  const refundTip = !canRefund ? (isVoided ? 'Voided order cannot be refunded' : isRefunded ? 'Already refunded' : 'Only ready/completed can be refunded (after kitchen)') : 'Return money after completion — always restores stock'
                  return (
                  <tr key={sale.id} className={`border-b border-border hover:bg-muted/50 transition-colors ${isVoided ? 'bg-red-50/50' : isRefunded ? 'bg-yellow-50/50' : ''}`}>
                    <td className="px-6 py-4 text-sm font-medium">{sale.order_number} {isVoided && <span className="ml-2 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">VOIDED</span>}{isRefunded && <span className="ml-2 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs font-semibold">REFUNDED</span>}</td>
                    <td className="px-6 py-4 text-sm">{formatDate(sale.created_at)}</td>
                    <td className="px-6 py-4 text-sm">{sale.order_items?.length || 0}</td>
                    <td className="px-6 py-4 text-sm text-right">{parseFloat(sale.discount_total) > 0 ? <span className="text-red-500">-₱{parseFloat(sale.discount_total).toFixed(2)}{sale.discount_type === 'employee' ? ' (Emp)' : ' (SC/PWD)'}</span> : '—'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-right">₱{parseFloat(sale.grand_total).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm">{paymentLabel(sale.payment_method)} {isVoided ? <span className="text-red-500 text-xs">· voided</span> : isRefunded ? <span className="text-yellow-700 text-xs">· refunded</span> : null}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button onClick={() => setSelectedSale(sale)} className="px-3 py-1 text-sm bg-accent text-white rounded-lg hover:opacity-90">View</button>
                        <button title={voidTip} onClick={() => { setActionOpen({ sale, type: 'void' }); setActionReason(''); setActionError(null) }} disabled={!canVoid} className="px-3 py-1 text-sm bg-muted rounded-lg hover:bg-muted/80 disabled:opacity-40">Void</button>
                        <button title={refundTip} onClick={() => { setActionOpen({ sale, type: 'refund' }); setActionReason(''); setActionError(null) }} disabled={!canRefund} className="px-3 py-1 text-sm bg-muted rounded-lg hover:bg-muted/80 disabled:opacity-40">Refund</button>
                      </div>
                    </td>
                  </tr>
                  )})}
                {sales.length === 0 && <tr><td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">No sales found</td></tr>}
              </tbody>
            </table>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages} ({total} total)</span>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => loadSales(page - 1)} className="px-3 py-1.5 rounded-lg bg-muted disabled:opacity-40 text-sm flex items-center gap-1"><ChevronLeft className="w-4 h-4" /> Prev</button>
                  <button disabled={page >= totalPages} onClick={() => loadSales(page + 1)} className="px-3 py-1.5 rounded-lg bg-muted disabled:opacity-40 text-sm flex items-center gap-1">Next <ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        )}

        {actionOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-card rounded-2xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">{actionOpen.type === 'void' ? 'Void Sale' : 'Refund Sale'}</h2>
                <button onClick={() => setActionOpen(null)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {actionOpen.type === 'void'
                  ? (actionOpen.sale.status === 'new'
                      ? `Void ${actionOpen.sale.order_number} (₱${parseFloat(actionOpen.sale.grand_total).toFixed(2)})? The payment will be voided and deducted ingredients will be restored (kitchen hasn't started).`
                      : `Void ${actionOpen.sale.order_number} (₱${parseFloat(actionOpen.sale.grand_total).toFixed(2)})? The payment will be voided. The kitchen has started (status: ${actionOpen.sale.status}), so deducted ingredients will NOT be restored.`)
                  : `Refund ${actionOpen.sale.order_number} (₱${parseFloat(actionOpen.sale.grand_total).toFixed(2)})? Payment will be marked refunded and deducted ingredients will be restored.`}
              </p>
              <textarea
                placeholder="Reason (required)"
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm h-20"
              />
              {actionError && <p className="text-sm text-destructive mt-2">{actionError}</p>}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setActionOpen(null)} className="px-4 py-2 rounded-lg bg-muted text-sm">Cancel</button>
                <button onClick={runAction} disabled={actionBusy} className={`px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50 ${actionOpen.type === 'void' ? 'bg-destructive' : 'bg-accent'}`}>
                  {actionBusy ? 'Processing...' : actionOpen.type === 'void' ? 'Void Sale' : 'Confirm Refund'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedSale && (
          <>
            <style>{`@media print { body * { visibility: hidden; } #sales-receipt, #sales-receipt * { visibility: visible; } #sales-receipt { position: fixed; left: 0; top: 0; width: 100%; } }`}</style>
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 print:bg-white print:static">
            <div id="sales-receipt" className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl print:shadow-none print:max-w-full print:w-full max-h-[90vh] overflow-y-auto">
              <div className="text-center mb-4 pb-4 border-b border-dashed border-gray-300">
                <h2 className="text-xl font-bold text-gray-900">{businessName}</h2>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mt-1">This is not an official receipt</p>
                <p className="text-xs text-gray-500 mt-1">{formatDate(selectedSale.created_at)}</p>
                <p className="text-lg font-semibold mt-2 text-gray-800">{selectedSale.order_number}</p>
                {selectedSale.payment_status && <p className="text-xs text-gray-500 capitalize">{selectedSale.payment_status}</p>}
              </div>

              <div className="space-y-2 mb-4 pb-4 border-b border-dashed border-gray-300">
                {selectedSale.order_items?.map((item: any) => (
                  <div key={item.id} className="flex justify-between text-sm">
                    <div className="flex-1">
                      <span className="font-medium">{item.quantity}x {item.item_name}</span>
                      {item.variant_name && <span className="text-gray-500"> ({item.variant_name})</span>}
                      {item.order_item_addons?.length > 0 && (
                        <div className="text-xs text-gray-500 ml-3">
                          {item.order_item_addons.map((a: any) => `+ ${a.quantity}x ${a.addon_name} ₱${parseFloat(a.line_total).toFixed(2)}`).join(', ')}
                        </div>
                      )}
                    </div>
                    <span className="font-medium">₱{(parseFloat(item.line_total) + (item.order_item_addons?.reduce((s: number, a: any) => s + parseFloat(a.line_total), 0) || 0)).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1 text-sm mb-4 pb-4 border-b border-dashed border-gray-300">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>₱{parseFloat(selectedSale.subtotal).toFixed(2)}</span></div>
                {parseFloat(selectedSale.discount_total) > 0 && (
                  <div className="flex justify-between"><span className="text-gray-500">{selectedSale.discount_type === 'employee' ? 'Employee Discount' : 'SC/PWD Discount'}</span><span className="text-red-500">-₱{parseFloat(selectedSale.discount_total).toFixed(2)}</span></div>
                )}
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>₱{parseFloat(selectedSale.tax_total).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Payment</span><span className="capitalize">{paymentLabel(selectedSale.payment_method)}</span></div>
              </div>

              <div className="text-center mb-4">
                <p className="text-sm text-gray-500">TOTAL</p>
                <p className="text-3xl font-bold text-gray-900">₱{parseFloat(selectedSale.grand_total).toFixed(2)}</p>
              </div>

              <p className="text-xs text-center text-gray-400 mb-6">Thank you for your purchase!</p>

              <div className="flex gap-2 print:hidden">
                <button onClick={() => setSelectedSale(null)} className="flex-1 px-4 py-2 rounded-lg bg-muted text-foreground hover:bg-muted/80 text-sm font-medium">Close</button>
                <button onClick={() => window.print()} className="flex-1 px-4 py-2 rounded-lg bg-accent text-white hover:opacity-90 text-sm font-medium flex items-center justify-center gap-2">
                  <Printer className="w-4 h-4" /> Print Receipt
                </button>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
