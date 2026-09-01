const TIMEZONE = 'Asia/Manila'
const DEFAULT_CUTOFF = '00:00'

export function getBusinessDate(date?: Date): string {
  const now = date || new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(now)
}

export function getBusinessDateTime(date?: Date): string {
  const now = date || new Date()
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now)
}
