'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/app-layout'
import { useModal } from '@/lib/contexts/modal-context'
import { getBusinessSettings, updateBusinessSettings } from '@/lib/actions/settings'
import { Save, Printer, Bluetooth, Wrench, CheckCircle2, XCircle } from 'lucide-react'
import { pairPrinter, reconnectPrinter, isPrinterConnected, getPrinterName, printReceipt, openDrawerViaPrinter, getDrawerMethod, setDrawerMethod, getAutoPrint, setAutoPrint, type ReceiptData } from '@/lib/utils/printer'
import type { BusinessSetting } from '@/lib/types'

export default function SettingsPage() {
  const [settings, setSettings] = useState<BusinessSetting | null>(null)
  const [businessName, setBusinessName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [taxRate, setTaxRate] = useState('')
  const [serviceChargeRate, setServiceChargeRate] = useState('')
  const [currencyCode, setCurrencyCode] = useState('PHP')
  const [timezone, setTimezone] = useState('Asia/Manila')
  const [cutoffTime, setCutoffTime] = useState('00:00')
  const [lowStockBehavior, setLowStockBehavior] = useState<'warn' | 'block'>('warn')
  const { showConfirmation, hideConfirmation } = useModal()

  const [printerName, setPrinterName] = useState('')
  const [printerStatus, setPrinterStatus] = useState<'idle' | 'busy'>('idle')
  const [printerMsg, setPrinterMsg] = useState('')
  const [drawerMethod, setDrawerMethodState] = useState<'printer' | 'usb' | 'none'>('printer')
  const [autoPrint, setAutoPrintState] = useState(false)

  useEffect(() => {
    setPrinterName(getPrinterName())
    setDrawerMethodState(getDrawerMethod())
    setAutoPrintState(getAutoPrint())
  }, [])

  const handlePairPrinter = async () => {
    setPrinterStatus('busy'); setPrinterMsg('')
    const ok = await pairPrinter()
    setPrinterStatus('idle')
    if (ok) { setPrinterName(getPrinterName()); setPrinterMsg('Paired: ' + getPrinterName()) }
    else setPrinterMsg('Pairing failed. Use Chrome/Edge and make sure the printer is on.')
  }

  const handleTestPrint = async () => {
    setPrinterStatus('busy'); setPrinterMsg('')
    let connected = isPrinterConnected()
    if (!connected) connected = await reconnectPrinter()
    if (!connected) { setPrinterStatus('idle'); setPrinterMsg('Printer not connected.'); return }
    const test: ReceiptData = {
      header: businessName || 'Bean Brewyage',
      subtitle: 'Test Print',
      items: [{ name: 'Test Receipt', qty: 1, price: 0 }],
      subtotal: 0, discount: 0, tax: 0, total: 0,
      paymentMethod: '—', amountTendered: 0, change: 0,
      orderNumber: 'TEST', date: new Date().toLocaleString('en-PH'),
      cashier: 'TEST', footer: 'Printer is working!',
    }
    const ok = await printReceipt(test)
    setPrinterStatus('idle')
    setPrinterMsg(ok ? 'Test print sent.' : 'Print failed.')
  }

  const handleTestDrawer = async () => {
    setPrinterStatus('busy'); setPrinterMsg('')
    const ok = await openDrawerViaPrinter()
    setPrinterStatus('idle')
    setPrinterMsg(ok ? 'Drawer kick sent.' : 'Drawer failed (check drawer method).')
  }

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    getBusinessSettings().then(s => {
      if (s) {
        setSettings(s)
        setBusinessName(s.business_name)
        setAddress(s.address)
        setPhone(s.phone)
        setTaxRate(String(s.tax_rate))
        setServiceChargeRate(String(s.service_charge_rate))
        setCurrencyCode(s.currency_code)
        setTimezone(s.timezone)
        setCutoffTime(s.business_day_cutoff_time)
        setLowStockBehavior(s.default_low_stock_behavior as 'warn' | 'block')
      }
    }).catch((err: any) => {
      setLoadError(err.message || 'Failed to load settings')
    }).finally(() => setLoading(false))
  }, [])

  const handleSaveSettings = () => {
    showConfirmation({
      title: 'Save Settings',
      description: 'Are you sure you want to save these changes?',
      confirmText: 'Yes, Save',
      cancelText: 'Cancel',
      onConfirm: async () => {
        try {
          await updateBusinessSettings({
            business_name: businessName,
            address,
            phone,
            tax_rate: Math.min(100, Math.max(0, parseFloat(taxRate) || 0)),
            service_charge_rate: Math.min(100, Math.max(0, parseFloat(serviceChargeRate) || 0)),
            currency_code: currencyCode,
            timezone,
            business_day_cutoff_time: cutoffTime,
            default_low_stock_behavior: lowStockBehavior,
          })
          hideConfirmation()
        } catch (err: any) {
          showConfirmation({
            title: 'Error',
            description: err.message || 'Failed to save settings',
            confirmText: 'OK',
            cancelText: '',
            onConfirm: () => hideConfirmation(),
            isDestructive: false,
          })
        }
      },
      isDestructive: false,
    })
  }

  return (
    <AppLayout>
      <div className="p-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Settings</h1>
          <p className="text-muted-foreground">Manage store configuration</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-48" />)}
          </div>
        ) : loadError ? (
          <div className="text-center py-12">
            <p className="text-destructive mb-4">{loadError}</p>
            <button onClick={() => window.location.reload()} className="bg-accent text-white px-4 py-2 rounded-lg">Retry</button>
          </div>
        ) : (
          <>
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Store Information</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Business Name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Address</label>
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
                rows={3}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Business Settings</h2>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium block mb-2">Currency</label>
              <select
                value={currencyCode}
                onChange={(e) => setCurrencyCode(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              >
                <option value="PHP">PHP (₱)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Timezone</label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              >
                <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Service Charge Rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={serviceChargeRate}
                onChange={(e) => setServiceChargeRate(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Business Day Cutoff Time</label>
              <input
                type="time"
                value={cutoffTime}
                onChange={(e) => setCutoffTime(e.target.value)}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-2">Low Stock Behavior</label>
              <select
                value={lowStockBehavior}
                onChange={(e) => setLowStockBehavior(e.target.value as 'warn' | 'block')}
                className="w-full px-4 py-2 border border-border rounded-lg bg-background"
              >
                <option value="warn">Warn Only</option>
                <option value="block">Block Sales</option>
              </select>
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <h2 className="text-lg font-semibold mb-1">Bluetooth Printer & Cash Drawer</h2>
          <p className="text-sm text-muted-foreground mb-4">Thermal receipt printing over Web Bluetooth (Chrome/Edge). The cash drawer opens through the printer's RJ12 port or a USB drawer.</p>

          <div className="flex items-center gap-2 mb-4">
            <Printer className="w-5 h-5 text-accent" />
            <div className="flex-1">
              <p className="text-sm font-medium">{printerName}</p>
              <p className={`text-xs ${isPrinterConnected() ? 'text-accent' : 'text-muted-foreground'}`}>
                {isPrinterConnected() ? 'Connected' : 'Not connected'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={handlePairPrinter} disabled={printerStatus === 'busy'} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
              <Bluetooth className="w-4 h-4" /> Pair Printer
            </button>
            <button onClick={handleTestPrint} disabled={printerStatus === 'busy'} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 disabled:opacity-50">
              <Printer className="w-4 h-4" /> Test Print
            </button>
            <button onClick={handleTestDrawer} disabled={printerStatus === 'busy'} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 disabled:opacity-50">
              <Wrench className="w-4 h-4" /> Test Drawer
            </button>
          </div>

          {printerMsg && (
            <p className="text-sm mb-4 flex items-center gap-1.5">
              {printerMsg.includes('failed') || printerMsg.includes('not connected')
                ? <XCircle className="w-4 h-4 text-destructive" />
                : <CheckCircle2 className="w-4 h-4 text-accent" />}
              {printerMsg}
            </p>
          )}

          <label className="flex items-center gap-2 text-sm mb-4">
            <input type="checkbox" checked={autoPrint} onChange={e => { setAutoPrintState(e.target.checked); setAutoPrint(e.target.checked) }} />
            Auto-print receipt after every sale
          </label>

          <div>
            <p className="text-sm font-medium block mb-2">How is the cash drawer connected?</p>
            <div className="space-y-2">
              {([{ key: 'printer', label: 'Connected to printer (RJ12 cable)', desc: 'Drawer opens via printer port' },
                { key: 'usb', label: 'USB cash drawer', desc: 'Direct USB drawer (rare)' },
                { key: 'none', label: 'No cash drawer', desc: 'Skip drawer — manual only' }] as const).map(opt => (
                <label key={opt.key} className={`flex items-start gap-2 p-3 rounded-lg border text-sm cursor-pointer ${drawerMethod === opt.key ? 'border-accent bg-accent/5' : 'border-border'}`}>
                  <input type="radio" name="drawer" className="mt-0.5" checked={drawerMethod === opt.key} onChange={() => { setDrawerMethodState(opt.key); setDrawerMethod(opt.key) }} />
                  <span>
                    <span className="block font-medium">{opt.label}</span>
                    <span className="text-xs text-muted-foreground">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={handleSaveSettings}
          className="w-full bg-accent text-white py-2 rounded-lg font-medium hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          Save Settings
        </button>
        </>
        )}
      </div>
    </AppLayout>
  )
}
