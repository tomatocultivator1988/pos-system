'use client'

import { useEffect, useMemo, useState } from 'react'
import AppLayout from '@/components/app-layout'
import { formatPHP } from '@/lib/currency'
import { useAuth } from '@/lib/contexts/auth-context'
import {
  closeCashShift,
  getActiveCashShift,
  getCashShiftHistory,
  openCashShift,
  recordCashMovement,
} from '@/lib/actions/cash-shifts'
import { getStaffList, updateStaffName, type StaffUser } from '@/lib/actions/users'
import {
  Printer,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Users,
  Lock,
  Pencil,
  Save,
} from 'lucide-react'

export default function CashShiftsPage() {
  const { currentStaff } = useAuth()
  const [active, setActive] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Form states
  const [openingCash, setOpeningCash] = useState('1000')
  const [openingNote, setOpeningNote] = useState('')
  const [movementType, setMovementType] = useState<'in' | 'out'>('out')
  const [movementAmount, setMovementAmount] = useState('')
  const [movementReason, setMovementReason] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [varianceReason, setVarianceReason] = useState('')
  const [busy, setBusy] = useState(false)

  // Shift detail modal & print
  const [selectedShift, setSelectedShift] = useState<any | null>(null)

  // Staff accounts sub-tab states
  const [subTab, setSubTab] = useState<'shifts' | 'staff'>('shifts')
  const [staffList, setStaffList] = useState<StaffUser[]>([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [staffBusy, setStaffBusy] = useState(false)

  const load = async () => {
    try {
      setLoading(true)
      const [current, previous] = await Promise.all([getActiveCashShift(), getCashShiftHistory()])
      setActive(current)
      setHistory(previous as any[])
    } catch (error: any) {
      setMessage(error.message || 'Could not load cash shifts')
    } finally {
      setLoading(false)
    }
  }

  const loadStaff = async () => {
    try {
      setStaffLoading(true)
      const list = await getStaffList()
      setStaffList(list)
    } catch (e: any) {
      setMessage(e.message || 'Failed to load staff list')
    } finally {
      setStaffLoading(false)
    }
  }

  const startEditStaff = (staff: StaffUser) => {
    setEditingStaffId(staff.id)
    setEditName(staff.name)
    setEditPassword('')
    setMessage('')
    setSuccessMsg('')
  }

  const cancelEditStaff = () => {
    setEditingStaffId(null)
    setEditName('')
    setEditPassword('')
  }

  const saveStaffEdit = async (staffId: string) => {
    if (!editName.trim()) {
      setMessage('Staff name cannot be empty')
      return
    }
    setStaffBusy(true)
    setMessage('')
    setSuccessMsg('')
    try {
      await updateStaffName(staffId, editName, editPassword || undefined)
      setSuccessMsg('Staff account updated successfully!')
      setEditingStaffId(null)
      await loadStaff()
    } catch (err: any) {
      setMessage(err.message || 'Failed to update staff account')
    } finally {
      setStaffBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const estimatedVariance = useMemo(() => {
    if (!active || countedCash === '') return 0
    const counted = parseFloat(countedCash) || 0
    const expected = Number(active.expected_cash) || 0
    return Math.round((counted - expected) * 100) / 100
  }, [active, countedCash])

  const run = async (work: () => Promise<void>, successNotification = '') => {
    setBusy(true)
    setMessage('')
    setSuccessMsg('')
    try {
      await work()
      if (successNotification) setSuccessMsg(successNotification)
      await load()
    } catch (error: any) {
      setMessage(error.message || 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const printShiftSummary = (shift: any) => {
    const isClosed = shift.status === 'closed'
    const printWindow = window.open('', '_blank', 'width=380,height=600')
    if (!printWindow) return

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Shift Report - ${shift.business_date || ''}</title>
        <style>
          body { font-family: monospace; font-size: 12px; margin: 0; padding: 12px; color: #000; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .row { display: flex; justify-content: space-between; margin: 3px 0; }
          .title { font-size: 14px; font-weight: bold; margin-bottom: 2px; }
          .subtitle { font-size: 11px; margin-bottom: 8px; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="center">
          <div class="title">BEAN BREWYAGE</div>
          <div class="subtitle">CASH DRAWER SHIFT REPORT (${isClosed ? 'Z-READING' : 'X-READING'})</div>
          <div>Date: ${shift.business_date || new Date().toISOString().split('T')[0]}</div>
          <div>Opened: ${new Date(shift.opened_at).toLocaleString()}</div>
          ${isClosed && shift.closed_at ? `<div>Closed: ${new Date(shift.closed_at).toLocaleString()}</div>` : ''}
          <div>Cashier: ${shift.opened_by?.name || 'Staff'}</div>
        </div>

        <div class="divider"></div>

        <div class="row"><span>Opening Float:</span><span>${formatPHP(Number(shift.opening_cash || 0))}</span></div>
        <div class="row"><span>(+) Cash Sales:</span><span>${formatPHP(Number(shift.cash_sales ?? shift.stats?.cash_sales ?? 0))}</span></div>
        <div class="row"><span>(+) Cash In:</span><span>${formatPHP(Number(shift.cash_in ?? shift.stats?.cash_in ?? 0))}</span></div>
        <div class="row"><span>(-) Cash Out:</span><span>${formatPHP(Number(shift.cash_out ?? shift.stats?.cash_out ?? 0))}</span></div>
        <div class="row"><span>(-) Drawer Expenses:</span><span>${formatPHP(Number(shift.cash_expenses ?? shift.stats?.cash_expenses ?? 0))}</span></div>
        <div class="row"><span>(-) Refunds / Voids:</span><span>${formatPHP(Number((shift.cash_refunds || 0) + (shift.cash_voids || 0) || shift.stats?.cash_refunds || 0))}</span></div>

        <div class="divider"></div>

        <div class="row bold"><span>Expected Drawer Cash:</span><span>${formatPHP(Number(shift.expected_cash || 0))}</span></div>
        ${isClosed ? `
        <div class="row bold"><span>Actual Counted Cash:</span><span>${formatPHP(Number(shift.counted_cash || 0))}</span></div>
        <div class="row bold"><span>Variance:</span><span>${shift.variance >= 0 ? '+' : ''}${formatPHP(Number(shift.variance || 0))}</span></div>
        ${shift.variance_reason ? `<div style="margin-top:4px; font-size:10px;">Variance Note: ${shift.variance_reason}</div>` : ''}
        ` : '<div class="center" style="margin-top:6px; font-style:italic;">* Shift is currently open *</div>'}

        ${shift.non_cash_sales ? `
        <div class="divider"></div>
        <div class="row"><span>Non-Cash Sales (GCash/Card):</span><span>${formatPHP(Number(shift.non_cash_sales || 0))}</span></div>
        ` : ''}

        ${shift.closing_note ? `<div style="margin-top:6px; font-size:10px;">Note: ${shift.closing_note}</div>` : ''}

        <div class="divider"></div>
        <div style="margin-top: 30px;" class="center">
          <div>_________________________________</div>
          <div style="font-size:10px; margin-top:2px;">Cashier Signature / Cash Drop Verified</div>
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `
    printWindow.document.write(html)
    printWindow.document.close()
  }

  return (
    <AppLayout>
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl lg:text-3xl font-semibold mb-1">Cash Shifts</h1>
            <p className="text-sm text-muted-foreground">Manage starting float, drawer cash movements, and shift closing.</p>
          </div>
          <button
            onClick={() => {
              if (subTab === 'shifts') load()
              else loadStaff()
            }}
            className="px-3.5 py-1.5 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Sub-tabs for Admin */}
        {currentStaff?.role === 'admin' && (
          <div className="flex gap-2 border-b border-border pb-3 mb-6">
            <button
              onClick={() => setSubTab('shifts')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                subTab === 'shifts'
                  ? 'bg-accent text-white shadow-xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Drawer & Shifts
            </button>
            <button
              onClick={() => {
                setSubTab('staff')
                loadStaff()
              }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                subTab === 'staff'
                  ? 'bg-accent text-white shadow-xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Staff Accounts
            </button>
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}
        {successMsg && (
          <div className="mb-4 rounded-xl bg-green-50 border border-green-200 text-green-800 px-4 py-3 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {subTab === 'shifts' ? (
          <>

        {loading ? (
          <div className="animate-pulse bg-muted h-64 rounded-2xl" />
        ) : !active ? (
          <div className="bg-card border border-border rounded-2xl p-6 max-w-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500" />
              <h2 className="text-lg font-semibold">Main Drawer is Closed</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the starting physical cash float placed in the drawer before taking cash orders.
            </p>

            <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">Starting Cash Float (₱)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={openingCash}
              onChange={e => setOpeningCash(e.target.value)}
              placeholder="1000.00"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-lg font-mono font-semibold mb-3 focus:outline-accent"
            />

            <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">
              Opening Note <span className="text-muted-foreground font-normal lowercase">(optional)</span>
            </label>
            <input
              value={openingNote}
              onChange={e => setOpeningNote(e.target.value)}
              placeholder="e.g. ₱1,000 float (denominations: 5x100, 10x50)"
              className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm mb-4 focus:outline-accent"
            />

            <button
              disabled={busy || openingCash === '' || parseFloat(openingCash) < 0}
              onClick={() =>
                run(async () => {
                  const amt = parseFloat(openingCash) || 0
                  await openCashShift(amt, openingNote)
                  setOpeningCash('1000')
                  setOpeningNote('')
                }, 'Cash drawer opened successfully!')
              }
              className="w-full bg-accent text-white py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {busy ? 'Opening...' : 'Open Cash Shift'}
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Shift Header Card */}
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                    <h2 className="text-xl font-bold">Main Register Drawer</h2>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 font-semibold">OPEN</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Opened by <strong>{(active.opened_by as any)?.name || currentStaff?.name || 'Staff'}</strong> · {new Date(active.opened_at).toLocaleString()}
                    {active.opening_note && <span> · Note: {active.opening_note}</span>}
                  </p>
                </div>
                <button
                  onClick={() => printShiftSummary(active)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Printer className="w-4 h-4" />
                  Print X-Reading
                </button>
              </div>

              {/* Statistics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <Stat label="Starting Float" value={formatPHP(Number(active.opening_cash))} />
                <Stat label="Expected Cash" value={formatPHP(Number(active.expected_cash))} emphasis />
                <Stat label="Cash Sales (+)" value={formatPHP(active.stats?.cash_sales ?? sum(active.movements, 'cash_sale'))} />
                <Stat
                  label="Deductions (-)"
                  value={formatPHP(
                    (active.stats?.cash_out ?? 0) +
                    (active.stats?.cash_expenses ?? 0) +
                    (active.stats?.cash_refunds ?? 0) ||
                    sum(active.movements, 'cash_out') +
                    sum(active.movements, 'cash_expense') +
                    sum(active.movements, 'cash_refund') +
                    sum(active.movements, 'cash_void')
                  )}
                />
              </div>
            </div>

            {/* Cash Movements & Close Shift Columns */}
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Cash In / Out Form */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="font-semibold text-base mb-1">Cash In / Cash Out</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Add cash float mid-shift, take petty cash, or make a bank drop.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Action</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setMovementType('out')}
                        className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          movementType === 'out' ? 'bg-destructive text-white' : 'bg-muted text-foreground'
                        }`}
                      >
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        Cash Out / Drop
                      </button>
                      <button
                        type="button"
                        onClick={() => setMovementType('in')}
                        className={`py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                          movementType === 'in' ? 'bg-green-700 text-white' : 'bg-muted text-foreground'
                        }`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        Cash In / Add Float
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Amount (₱)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="0.00"
                      value={movementAmount}
                      onChange={e => setMovementAmount(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm font-mono font-medium focus:outline-accent"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Reason (required)</label>
                    <input
                      placeholder="e.g. Bank deposit, change for ₱1000 bill, petty cash"
                      value={movementReason}
                      onChange={e => setMovementReason(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-accent"
                    />
                  </div>

                  {movementType === 'out' && parseFloat(movementAmount) > Number(active.expected_cash) && (
                    <p className="text-xs text-destructive">
                      Cannot remove more than the current drawer cash (₱{Number(active.expected_cash).toFixed(2)}).
                    </p>
                  )}

                  <button
                    disabled={
                      busy ||
                      !movementReason.trim() ||
                      !(parseFloat(movementAmount) > 0) ||
                      (movementType === 'out' && parseFloat(movementAmount) > Number(active.expected_cash))
                    }
                    onClick={() =>
                      run(async () => {
                        await recordCashMovement(movementType, parseFloat(movementAmount), movementReason)
                        setMovementAmount('')
                        setMovementReason('')
                      }, `${movementType === 'in' ? 'Cash In' : 'Cash Out'} recorded.`)
                    }
                    className="w-full bg-accent text-white py-2 rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    Record {movementType === 'in' ? 'Cash In' : 'Cash Out'}
                  </button>
                </div>
              </div>

              {/* Close Shift Form */}
              <div className="bg-card border border-border rounded-2xl p-6">
                <h3 className="font-semibold text-base mb-1">Close Cash Shift</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Physically count all cash and coins in the drawer before closing.
                </p>

                <div className="space-y-3">
                  <div className="bg-muted/50 p-3 rounded-xl flex justify-between items-center text-sm">
                    <span className="text-muted-foreground font-medium">Expected in Drawer:</span>
                    <strong className="text-base font-bold text-accent">{formatPHP(Number(active.expected_cash))}</strong>
                  </div>

                  <div>
                    <label className="text-xs font-semibold uppercase text-muted-foreground block mb-1">Actual Cash Counted (₱)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={countedCash}
                      onChange={e => setCountedCash(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-lg font-mono font-bold focus:outline-accent"
                    />
                  </div>

                  {countedCash !== '' && (
                    <div
                      className={`p-3 rounded-xl border text-sm flex justify-between items-center ${
                        estimatedVariance === 0
                          ? 'bg-green-50 border-green-200 text-green-800'
                          : estimatedVariance > 0
                          ? 'bg-blue-50 border-blue-200 text-blue-800'
                          : 'bg-red-50 border-red-200 text-red-800'
                      }`}
                    >
                      <span className="font-medium">
                        {estimatedVariance === 0 ? '✓ Balanced' : estimatedVariance > 0 ? 'Over' : 'Short'}
                      </span>
                      <strong className="font-bold">
                        {estimatedVariance === 0 ? '₱0.00' : `${estimatedVariance > 0 ? '+' : ''}${formatPHP(estimatedVariance)}`}
                      </strong>
                    </div>
                  )}

                  {Math.abs(estimatedVariance) > 0.009 && (
                    <div>
                      <label className="text-xs font-medium text-destructive block mb-1">Reason for Over / Short *</label>
                      <input
                        placeholder="Required: explain the discrepancy"
                        value={varianceReason}
                        onChange={e => setVarianceReason(e.target.value)}
                        className="w-full px-3 py-2 border border-red-300 rounded-lg bg-background text-sm focus:outline-destructive"
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Closing Note (optional)</label>
                    <input
                      placeholder="Optional notes for shift handover"
                      value={closeNote}
                      onChange={e => setCloseNote(e.target.value)}
                      className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-accent"
                    />
                  </div>

                  <button
                    disabled={
                      busy ||
                      countedCash === '' ||
                      parseFloat(countedCash) < 0 ||
                      (Math.abs(estimatedVariance) > 0.009 && !varianceReason.trim())
                    }
                    onClick={() =>
                      run(async () => {
                        const shiftData = await closeCashShift(parseFloat(countedCash), closeNote, varianceReason)
                        setCountedCash('')
                        setCloseNote('')
                        setVarianceReason('')
                        if (shiftData) {
                          printShiftSummary({ ...active, ...shiftData, status: 'closed', counted_cash: parseFloat(countedCash) })
                        }
                      }, 'Shift closed successfully.')
                    }
                    className="w-full bg-destructive text-white py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {busy ? 'Closing Shift...' : 'Close & Print Z-Reading'}
                  </button>
                </div>
              </div>
            </div>

            {/* Live Drawer Activity Feed */}
            <div className="bg-card border border-border rounded-2xl p-6">
              <h3 className="font-semibold text-base mb-3">Live Drawer Movements</h3>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {active.movements.map((m: any) => (
                  <div key={m.id} className="flex justify-between items-center gap-3 text-sm border-b border-border/70 pb-2">
                    <div>
                      <span className="font-medium capitalize">{m.movement_type.replace(/_/g, ' ')}</span>
                      {m.reason && <span className="text-muted-foreground text-xs ml-1.5">· {m.reason}</span>}
                      <span className="text-[11px] text-muted-foreground block">{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                    <span className={`font-mono font-semibold text-sm ${m.direction === 'in' ? 'text-green-700' : 'text-destructive'}`}>
                      {m.direction === 'in' ? '+' : '−'}{formatPHP(Number(m.amount))}
                    </span>
                  </div>
                ))}
                {active.movements.length === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">No drawer movements yet.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Shift History Table */}
        <div className="mt-8 bg-card border border-border rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Shift History</h2>
            <span className="text-xs text-muted-foreground">Showing last 30 shifts</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="text-left text-muted-foreground border-b border-border bg-muted/40">
                <tr>
                  <th className="py-2.5 px-3">Date / Opened</th>
                  <th className="py-2.5 px-3">Opened By</th>
                  <th className="py-2.5 px-3 text-right">Expected</th>
                  <th className="py-2.5 px-3 text-right">Counted</th>
                  <th className="py-2.5 px-3 text-right">Difference</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {history.map(s => {
                  const variance = Number(s.variance || 0)
                  return (
                    <tr key={s.id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-3 px-3">
                        <div className="font-medium">{new Date(s.opened_at).toLocaleDateString()}</div>
                        <div className="text-xs text-muted-foreground">{new Date(s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="py-3 px-3">{(s.opened_by as any)?.name || 'Staff'}</td>
                      <td className="py-3 px-3 text-right font-mono">{s.expected_cash == null ? '—' : formatPHP(Number(s.expected_cash))}</td>
                      <td className="py-3 px-3 text-right font-mono">{s.counted_cash == null ? '—' : formatPHP(Number(s.counted_cash))}</td>
                      <td className="py-3 px-3 text-right font-mono">
                        {s.variance == null ? (
                          '—'
                        ) : (
                          <span className={variance === 0 ? 'text-green-700' : variance > 0 ? 'text-blue-700' : 'text-red-700 font-semibold'}>
                            {variance > 0 ? '+' : ''}{formatPHP(variance)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${s.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-muted text-muted-foreground'}`}>
                          {s.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedShift(s)}
                            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                            title="View shift details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => printShiftSummary(s)}
                            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                            title="Print shift summary"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-muted-foreground">
                      No shift history recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xs">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <Users className="w-5 h-5 text-accent" />
                  Staff Account Profiles
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  These accounts are predefined for the register terminal, kitchen display, and store administrator. You can update staff display names or reset their login PINs below.
                </p>
              </div>
            </div>

            {staffLoading ? (
              <div className="animate-pulse bg-muted h-48 rounded-xl" />
            ) : (
              <div className="space-y-4">
                {staffList.map(staff => {
                  const isEditing = editingStaffId === staff.id
                  const roleBadge =
                    staff.role === 'admin'
                      ? { label: 'Administrator', bg: 'bg-purple-100 text-purple-800 border-purple-200', desc: 'Full access to POS, settings, inventory, shifts, and reports' }
                      : staff.role === 'cashier'
                      ? { label: 'Cashier', bg: 'bg-green-100 text-green-800 border-green-200', desc: 'Counter POS terminal, accepts payments, opens/closes cash drawer' }
                      : { label: 'Kitchen Display (KDS)', bg: 'bg-amber-100 text-amber-800 border-amber-200', desc: 'Kitchen tablet screen for live food and drink preparation' }

                  return (
                    <div
                      key={staff.id}
                      className="p-5 border border-border rounded-xl bg-background hover:border-border/80 transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${roleBadge.bg}`}>
                              {roleBadge.label}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                              <Lock className="w-3 h-3 text-muted-foreground" />
                              Username: <strong>{staff.username}</strong>
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">{roleBadge.desc}</p>
                        </div>

                        {!isEditing && (
                          <button
                            onClick={() => startEditStaff(staff)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit Name & PIN
                          </button>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-border/60">
                        {isEditing ? (
                          <div className="space-y-3">
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">
                                  Display Name *
                                </label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={e => setEditName(e.target.value)}
                                  placeholder="Staff member name"
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm font-medium focus:outline-accent"
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground block mb-1">
                                  New Password / PIN <span className="font-normal">(optional)</span>
                                </label>
                                <input
                                  type="password"
                                  value={editPassword}
                                  onChange={e => setEditPassword(e.target.value)}
                                  placeholder="Leave blank to keep unchanged"
                                  className="w-full px-3 py-2 border border-border rounded-lg bg-background text-sm focus:outline-accent"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={cancelEditStaff}
                                disabled={staffBusy}
                                className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium hover:bg-muted"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                disabled={staffBusy || !editName.trim()}
                                onClick={() => saveStaffEdit(staff.id)}
                                className="px-3.5 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                              >
                                <Save className="w-3.5 h-3.5" />
                                {staffBusy ? 'Saving...' : 'Save Changes'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground text-xs">Current Display Name:</span>
                            <strong className="text-sm font-semibold">{staff.name}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

        {/* Shift Details Modal */}
        {selectedShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold">Shift Details</h3>
                  <p className="text-xs text-muted-foreground">
                    {new Date(selectedShift.opened_at).toLocaleDateString()} · Status: <span className="uppercase font-semibold">{selectedShift.status}</span>
                  </p>
                </div>
                <button onClick={() => setSelectedShift(null)} className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm divide-y divide-border">
                <div className="pt-2">
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">Opened:</span><span>{new Date(selectedShift.opened_at).toLocaleString()}</span></div>
                  <div className="flex justify-between py-1"><span className="text-muted-foreground">Opened By:</span><span>{(selectedShift.opened_by as any)?.name || 'Staff'}</span></div>
                  {selectedShift.opening_note && <div className="flex justify-between py-1"><span className="text-muted-foreground">Opening Note:</span><span>{selectedShift.opening_note}</span></div>}
                </div>

                {selectedShift.closed_at && (
                  <div className="pt-2">
                    <div className="flex justify-between py-1"><span className="text-muted-foreground">Closed:</span><span>{new Date(selectedShift.closed_at).toLocaleString()}</span></div>
                    <div className="flex justify-between py-1"><span className="text-muted-foreground">Closed By:</span><span>{(selectedShift.closed_by as any)?.name || 'Staff'}</span></div>
                    {selectedShift.closing_note && <div className="flex justify-between py-1"><span className="text-muted-foreground">Closing Note:</span><span>{selectedShift.closing_note}</span></div>}
                  </div>
                )}

                <div className="pt-2">
                  <div className="flex justify-between py-1 font-medium"><span className="text-muted-foreground">Starting Float:</span><span>{formatPHP(Number(selectedShift.opening_cash || 0))}</span></div>
                  <div className="flex justify-between py-1 text-green-700 font-medium"><span>(+) Cash Sales:</span><span>{formatPHP(Number(selectedShift.cash_sales || 0))}</span></div>
                  <div className="flex justify-between py-1 text-green-700"><span>(+) Cash In:</span><span>{formatPHP(Number(selectedShift.cash_in || 0))}</span></div>
                  <div className="flex justify-between py-1 text-red-700"><span>(-) Cash Out:</span><span>{formatPHP(Number(selectedShift.cash_out || 0))}</span></div>
                  <div className="flex justify-between py-1 text-red-700"><span>(-) Drawer Expenses:</span><span>{formatPHP(Number(selectedShift.cash_expenses || 0))}</span></div>
                  <div className="flex justify-between py-1 text-red-700"><span>(-) Voids & Refunds:</span><span>{formatPHP(Number((selectedShift.cash_refunds || 0) + (selectedShift.cash_voids || 0)))}</span></div>
                </div>

                <div className="pt-2 font-semibold">
                  <div className="flex justify-between py-1"><span>Expected Drawer Cash:</span><span className="font-mono">{formatPHP(Number(selectedShift.expected_cash || 0))}</span></div>
                  <div className="flex justify-between py-1"><span>Counted Cash:</span><span className="font-mono">{formatPHP(Number(selectedShift.counted_cash || 0))}</span></div>
                  <div className="flex justify-between py-1 text-base">
                    <span>Variance:</span>
                    <span className={`font-mono ${Number(selectedShift.variance || 0) === 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {Number(selectedShift.variance || 0) > 0 ? '+' : ''}{formatPHP(Number(selectedShift.variance || 0))}
                    </span>
                  </div>
                  {selectedShift.variance_reason && (
                    <div className="mt-2 p-2 rounded bg-muted/60 text-xs font-normal">
                      <strong>Variance Reason:</strong> {selectedShift.variance_reason}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button onClick={() => setSelectedShift(null)} className="px-4 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80">
                  Close
                </button>
                <button
                  onClick={() => printShiftSummary(selectedShift)}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 flex items-center gap-1.5"
                >
                  <Printer className="w-4 h-4" />
                  Print Report
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  )
}

function sum(movements: any[], type: string) {
  if (!movements) return 0
  return movements.filter(m => m.movement_type === type).reduce((total, m) => total + Number(m.amount), 0)
}

function Stat({ label, value, emphasis = false }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className={emphasis ? 'rounded-xl bg-accent/10 border border-accent/20 p-3.5' : 'rounded-xl bg-muted p-3.5'}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-bold font-mono mt-1 ${emphasis ? 'text-accent text-lg' : 'text-foreground'}`}>{value}</p>
    </div>
  )
}
