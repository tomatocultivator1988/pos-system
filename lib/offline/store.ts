// localStorage-backed offline store: catalog snapshot, cached session, sale queue.
// Everything is namespaced under beanpos:offline:v1:*.

const NS = 'beanpos:offline:v1'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch (e) {
    // Corrupted entry (especially queue) should not silently drop — log and keep fallback only for queue
    console.error(`[offline] corrupted ${key}`, e)
    if (key === 'queue') {
      // try to salvage: keep raw for debug, return fallback but don't wipe without trace
      try { localStorage.setItem(`${NS}:${key}:corrupted`, localStorage.getItem(`${NS}:${key}`) || '') } catch {}
    }
    return fallback
  }
}

function write(key: string, value: unknown) {
  const set = () => localStorage.setItem(`${NS}:${key}`, JSON.stringify(value))
  try {
    set()
  } catch {
    // Quota exceeded. Drop the biggest, most-expendable entry (catalog) and
    // retry once so the sale queue always survives; catalog re-fetches online.
    try { localStorage.removeItem(`${NS}:catalog`) } catch { /* give up */ }
    try { set() } catch { /* still full — entry lost, caller must handle */ }
  }
}

export interface QueuedSale {
  idempotencyKey: string
  body: Record<string, unknown>
  createdAt: string
  ref: string
}

export interface SyncError {
  clientRef: string | null
  message: string
  at: string
}

export const offlineStore = {
  getCatalog: () => read<unknown | null>('catalog', null),
  setCatalog: (v: unknown) => write('catalog', v),
  getTaxRate: () => read<number>('taxRate', 0),
  setTaxRate: (v: number) => write('taxRate', v),
  getBusinessName: () => read<string | null>('businessName', null),
  setBusinessName: (v: string | null) => write('businessName', v),
  getCustomers: () => read<unknown[]>('customers', []),
  setCustomers: (v: unknown[]) => write('customers', v),
  getSession: () => read<unknown | null>('session', null),
  setSession: (v: unknown | null) => write('session', v),
  getQueue: () => read<QueuedSale[]>('queue', []),
  setQueue: (v: QueuedSale[]) => write('queue', v),
  getLastOfflineNum: () => read<number>('num', 0),
  setLastOfflineNum: (v: number) => write('num', v),
  getLastError: () => read<SyncError | null>('err', null),
  setLastError: (v: SyncError | null) => write('err', v),
}
