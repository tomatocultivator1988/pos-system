// Offline sync: replays queued sales to the server in strict order.
// Each queued sale carries its original idempotency_key, so a replay is
// idempotent (complete_sale_v1 returns 'already_completed' for a duplicate).

import { offlineStore } from './store'

export function pendingCount(): number {
  return offlineStore.getQueue().length
}

export function hasPending(): boolean {
  return pendingCount() > 0
}

function recordFail(clientRef: string | null, message: string) {
  offlineStore.setLastError({ clientRef, message, at: new Date().toISOString() })
}

// Dedupe concurrent sync attempts (auto-sync 'online' event + manual button).
let inFlight: Promise<{ synced: number; failed: number }> | null = null

export function syncNow(): Promise<{ synced: number; failed: number }> {
  if (inFlight) return inFlight
  inFlight = doSync().finally(() => { inFlight = null })
  return inFlight
}

async function doSync(): Promise<{ synced: number; failed: number }> {
  let synced = 0
  let failed = 0

  const queue = offlineStore.getQueue()
  for (const item of queue) {
    let res: Response
    try {
      res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      })
    } catch {
      recordFail(item.idempotencyKey, 'Network error')
      return { synced, failed: failed + 1 }
    }
    if (res.ok) {
      offlineStore.setQueue(offlineStore.getQueue().filter(q => q.idempotencyKey !== item.idempotencyKey))
      synced++
    } else if (res.status >= 500 || res.status === 429) {
      const msg = await res.json().catch(() => null)
      recordFail(item.idempotencyKey, msg?.error ?? `HTTP ${res.status}`)
      return { synced, failed: failed + 1 }
    } else {
      const msg = await res.json().catch(() => null)
      recordFail(item.idempotencyKey, msg?.error ?? `HTTP ${res.status}`)
      offlineStore.setQueue(offlineStore.getQueue().filter(q => q.idempotencyKey !== item.idempotencyKey))
      failed++
      continue
    }
  }

  if (failed === 0) offlineStore.setLastError(null)
  return { synced, failed }
}
