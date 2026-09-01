export function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function parsePHP(value: string): number {
  const cleaned = value.replace(/[^0-9.\-]/g, '')
  return parseFloat(cleaned) || 0
}
