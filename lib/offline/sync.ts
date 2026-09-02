// Offline sync: replays queued sales to the server in order.
// Each queued sale carries its original idempotency_key, so a replay is
// idempotent (complete_sale_v1 returns 'already_completed' for a duplicate).
// The server recomputes all totals; the queue only supplies items, payment
// method, customer, discount type, and the original sold_at timestamp.

import { offlineStore, QueuedSale } from './store'

export function pendingCount(): number {
  return offlineStore.getQueue().length
}

export function hasPending(): boolean {
  return pendingCount() > 0
}

// A sale that failed with a permanent (4xx) error this many times is skipped
// by auto-sync; it stays queued until the cashier discards it or forces a
// retry via "Sync Now". Never dropped automatically — it's money already taken.
export const MAX_AUTO_ATTEMPTS = 5

function recordFail(clientRef: string | null, message: string) {
  offlineStore.setLastError({ clientRef, message, at: new Date().toISOString() })
}

// Dedupe concurrent sync attempts (auto-sync 'online' event + manual button).
let inFlight: Promise<{ synced: number; failed: number; stalled: number }> | null = null

export function syncNow(force = false): Promise<{ synced: number; failed: number; stalled: number }> {
  if (inFlight) return inFlight
  inFlight = doSync(force).finally(() => { inFlight = null })
  return inFlight
}

async function doSync(force = false): Promise<{ synced: number; failed: number; stalled: number }> {
  let synced = 0
  let failed = 0
  let stalled = 0

  const queue = offlineStore.getQueue()
  for (const item of queue) {
    if (!force && (item.attempts ?? 0) >= MAX_AUTO_ATTEMPTS) {
      stalled++
      continue
    }
    let res: Response
    try {
      res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      })
    } catch {
      recordFail(item.idempotencyKey, 'Network error')
      return { synced, failed: failed + 1, stalled }
    }
    if (res.ok) {
      offlineStore.setQueue(offlineStore.getQueue().filter(q => q.idempotencyKey !== item.idempotencyKey))
      synced++
    } else if (res.status >= 500 || res.status === 429) {
      const msg = await res.json().catch(() => null)
      recordFail(item.idempotencyKey, msg?.error ?? `HTTP ${res.status}`)
      return { synced, failed: failed + 1, stalled }
    } else {
      // Permanent error — keep the sale queued (it was paid), bump attempts,
      // and move on so one bad sale doesn't stall the rest of the queue.
      const attempts = (item.attempts ?? 0) + 1
      const updated = offlineStore.getQueue().map(q =>
        q.idempotencyKey === item.idempotencyKey ? { ...q, attempts } : q
      )
      offlineStore.setQueue(updated)
      const msg = await res.json().catch(() => null)
      recordFail(item.idempotencyKey, msg?.error ?? `HTTP ${res.status}`)
      if (attempts >= MAX_AUTO_ATTEMPTS) stalled++
      failed++
      continue
    }
  }

  if (failed === 0 && stalled === 0) offlineStore.setLastError(null)
  return { synced, failed, stalled }
}

export function discardQueued(idempotencyKey: string) {
  offlineStore.setQueue(offlineStore.getQueue().filter(q => q.idempotencyKey !== idempotencyKey))
}

export type { QueuedSale }
