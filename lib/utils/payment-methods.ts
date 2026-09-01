export const PAYMENT_METHODS = ['cash', 'gcash', 'bpi_bank_transfer', 'unionbank_bank_transfer'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  gcash: 'GCash',
  bpi_bank_transfer: 'BPI Bank Transfer',
  unionbank_bank_transfer: 'UnionBank Bank Transfer',
}

export function isCash(method: string): boolean {
  return method === 'cash'
}

export function needsReference(method: string): boolean {
  return method !== 'cash'
}

export function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method as PaymentMethod] ?? method
}
