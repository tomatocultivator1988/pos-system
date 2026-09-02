// Bluetooth Thermal Printer Manager + ESC/POS Commands (ported from Kabayan POS)

declare global {
  interface Navigator {
    bluetooth: {
      requestDevice(options: any): Promise<any>
      getDevices(): Promise<any[]>
    }
  }
}

interface BTDevice {
  name?: string
  gatt?: { connect(): Promise<any> }
}

interface BTGattServer {
  connected: boolean
  getPrimaryService(uuid: string): Promise<any>
}

let pairedDevice: BTDevice | null = null
let gattServer: BTGattServer | null = null
let writeCharacteristic: any = null

function bytes(...codes: number[]): Uint8Array {
  return new Uint8Array(codes)
}

const ASCII_REPLACE: Record<string, string> = {
  "\u2500": "-",
  "\u20B1": "P",
  "\u00A0": " ",
  "\u2018": "'", "\u2019": "'",
  "\u201C": '"', "\u201D": '"',
  "\u2013": "-", "\u2014": "--",
  "\u2026": "...",
  "\u00D7": "x",
}

function toAscii(str: string): string {
  return str.replace(/[^\x00-\x7F]/g, (c) => ASCII_REPLACE[c] || "?")
}

function text(str: string): Uint8Array {
  return new TextEncoder().encode(toAscii(str))
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) {
    result.set(a, offset)
    offset += a.length
  }
  return result
}

export interface ReceiptData {
  header: string
  subtitle: string
  items: { name: string; qty: number; price: number }[]
  subtotal: number
  discount: number
  tax: number
  total: number
  paymentMethod: string
  amountTendered: number
  change: number
  orderNumber: string
  date: string
  cashier: string
  footer: string
  points?: number
  pointsBalance?: number
  discountLabel?: string
}

export async function pairPrinter(): Promise<boolean> {
  try {
    if (!('bluetooth' in navigator)) return false
    const bt = (navigator as any).bluetooth

    pairedDevice = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
    })
    if (!pairedDevice) return false

    gattServer = await pairedDevice.gatt?.connect() ?? null
    if (!gattServer) return false

    const service = await gattServer.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
    writeCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')

    localStorage.setItem('printer_paired', 'true')
    localStorage.setItem('printer_name', pairedDevice.name || 'Unknown')
    return true
  } catch (err) {
    console.warn('Printer pairing failed:', err)
    return false
  }
}

export async function reconnectPrinter(): Promise<boolean> {
  try {
    if (!localStorage.getItem('printer_paired')) return false
    if (!('bluetooth' in navigator)) return false

    const devices = await (navigator as any).bluetooth.getDevices()
    for (const dev of devices) {
      try {
        pairedDevice = dev
        gattServer = await dev.gatt?.connect() ?? null
        if (!gattServer) continue
        const service = await gattServer.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb')
        writeCharacteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb')
        return true
      } catch {
        continue
      }
    }
    return false
  } catch {
    return false
  }
}

export function isPrinterConnected(): boolean {
  return writeCharacteristic !== null && gattServer?.connected === true
}

export function getPrinterName(): string {
  return localStorage.getItem('printer_name') || 'Not paired'
}

async function sendRaw(data: Uint8Array): Promise<boolean> {
  try {
    if (!writeCharacteristic) return false
    const CHUNK = 64
    for (let i = 0; i < data.length; i += CHUNK) {
      await writeCharacteristic.writeValueWithoutResponse(data.slice(i, Math.min(i + CHUNK, data.length)))
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    return true
  } catch {
    return false
  }
}

function buildReceipt(data: ReceiptData): Uint8Array {
  const center = bytes(0x1B, 0x61, 1)
  const left = bytes(0x1B, 0x61, 0)
  const bold = bytes(0x1B, 0x45, 1)
  const normal = bytes(0x1B, 0x45, 0)
  const feed = bytes(0x0A)
  const cut = bytes(0x1D, 0x56, 0x42, 0x00)
  const dash = '-'.repeat(32)

  const parts: Uint8Array[] = []

  parts.push(center, bold, text(data.header), feed, normal)
  if (data.subtitle) { parts.push(text(data.subtitle), feed) }
  parts.push(text(dash), feed, left)

  parts.push(text(`Order: ${data.orderNumber}`), feed)
  parts.push(text(`Date: ${data.date}`), feed)
  parts.push(text(`Cashier: ${data.cashier}`), feed)
  parts.push(text(dash), feed)

  for (const item of data.items) {
    const priceStr = `P${item.price.toFixed(2)}`
    parts.push(text(item.name.slice(0, 18).padEnd(18)))
    parts.push(text(`x${item.qty}  ${priceStr}`.padStart(14)))
    parts.push(feed)
  }

  parts.push(text(dash), feed)
  parts.push(text(`Subtotal:`.padEnd(20) + `P${data.subtotal.toFixed(2)}`.padStart(12)), feed)
  if (data.discount > 0) {
    parts.push(text(`${data.discountLabel || 'Discount'}:`.slice(0, 20).padEnd(20) + `-P${data.discount.toFixed(2)}`.padStart(11)), feed)
  }
  if (data.tax > 0) {
    parts.push(text(`Tax:`.padEnd(20) + `P${data.tax.toFixed(2)}`.padStart(12)), feed)
  }
  parts.push(bold, text(`TOTAL:`.padEnd(20) + `P${data.total.toFixed(2)}`.padStart(12)), feed, normal)

  parts.push(text(`Payment: ${data.paymentMethod}`), feed)
  if (data.amountTendered > 0) {
    parts.push(text(`Tendered: P${data.amountTendered.toFixed(2)}`), feed)
    parts.push(text(`Change: P${data.change.toFixed(2)}`), feed)
  }
  if (data.points && data.points > 0) {
    parts.push(text(`Points Earned: +${data.points}`), feed)
  }
  if (typeof data.pointsBalance === 'number') {
    parts.push(text(`Points Balance: ${data.pointsBalance}`), feed)
  }

  parts.push(feed, center, bold, text('THIS IS NOT AN OFFICIAL RECEIPT'), feed, normal)
  parts.push(feed, center, text(data.footer), feed, feed, cut)
  return concat(...parts)
}

export async function printReceipt(data: ReceiptData): Promise<boolean> {
  try {
    if (!isPrinterConnected()) {
      const reconnected = await reconnectPrinter()
      if (!reconnected) return false
    }
    return await sendRaw(buildReceipt(data))
  } catch {
    return false
  }
}

export interface KitchenTicketItem {
  name: string
  qty: number
  variantName?: string
  addons?: string[]
}

function buildKitchenTicket(orderRef: string, items: KitchenTicketItem[]): Uint8Array {
  const center = bytes(0x1B, 0x61, 1)
  const left = bytes(0x1B, 0x61, 0)
  const bold = bytes(0x1B, 0x45, 1)
  const normal = bytes(0x1B, 0x45, 0)
  const feed = bytes(0x0A)
  const cut = bytes(0x1D, 0x56, 0x42, 0x00)
  const dash = '-'.repeat(32)

  const parts: Uint8Array[] = []
  parts.push(center, bold, text('KITCHEN TICKET'), feed, normal)
  parts.push(text(orderRef), feed)
  parts.push(text(new Date().toLocaleString('en-PH')), feed)
  parts.push(text(dash), feed, left)
  for (const it of items) {
    const label = `${it.qty}x ${it.name}${it.variantName ? ` (${it.variantName})` : ''}`
    parts.push(bold, text(label), feed, normal)
    if (it.addons && it.addons.length > 0) {
      parts.push(text('  + ' + it.addons.join(', + ')), feed)
    }
  }
  parts.push(feed, cut)
  return concat(...parts)
}

export async function printKitchenTicket(orderRef: string, items: KitchenTicketItem[]): Promise<boolean> {
  try {
    if (!isPrinterConnected()) {
      const reconnected = await reconnectPrinter()
      if (!reconnected) return false
    }
    return await sendRaw(buildKitchenTicket(orderRef, items))
  } catch {
    return false
  }
}

export async function openDrawerViaPrinter(): Promise<boolean> {
  try {
    if (!isPrinterConnected()) {
      const reconnected = await reconnectPrinter()
      if (!reconnected) return false
    }
    const drawerCmd = bytes(0x1B, 0x70, 0x00, 25, 250)
    return await sendRaw(drawerCmd)
  } catch {
    return false
  }
}

export function getDrawerMethod(): 'printer' | 'usb' | 'none' {
  const saved = localStorage.getItem('drawer_method')
  if (saved === 'printer' || saved === 'usb' || saved === 'none') return saved
  return 'printer'
}

export function setDrawerMethod(method: 'printer' | 'usb' | 'none') {
  localStorage.setItem('drawer_method', method)
}

export function getAutoPrint(): boolean {
  return localStorage.getItem('auto_print') === 'true'
}

export function setAutoPrint(value: boolean) {
  localStorage.setItem('auto_print', value ? 'true' : 'false')
}
