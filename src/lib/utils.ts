import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const BRAND_COLORS = [
  { bg: '#3B82F6', border: '#2563EB', text: '#ffffff' }, // blue
  { bg: '#8B5CF6', border: '#7C3AED', text: '#ffffff' }, // violet
  { bg: '#10B981', border: '#059669', text: '#ffffff' }, // emerald
  { bg: '#F59E0B', border: '#D97706', text: '#ffffff' }, // amber
  { bg: '#EC4899', border: '#DB2777', text: '#ffffff' }, // pink
  { bg: '#06B6D4', border: '#0891B2', text: '#ffffff' }, // cyan
  { bg: '#84CC16', border: '#65A30D', text: '#ffffff' }, // lime
  { bg: '#F97316', border: '#EA580C', text: '#ffffff' }, // orange
]

export function getBrandColor(brandId: string) {
  // Simple hash so the same brand always gets the same color
  let hash = 0
  for (let i = 0; i < brandId.length; i++) {
    hash = (hash * 31 + brandId.charCodeAt(i)) >>> 0
  }
  return BRAND_COLORS[hash % BRAND_COLORS.length]
}

// Convert minutes-since-midnight (0..1440) into "HH:MM:SS" used by FullCalendar
export function minutesToTimeString(mins: number): string {
  const safe = Math.max(0, Math.min(1440, mins))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

// Inverse: "HH:MM" -> minutes since midnight
export function timeStringToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// "HH:MM" string for <input type="time"> (no seconds, capped at 23:59)
export function minutesToInputTime(mins: number): string {
  const safe = Math.max(0, Math.min(1439, mins === 1440 ? 1439 : mins))
  const h = Math.floor(safe / 60)
  const m = safe % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const DEFAULT_RATE_CENTS = 2000 // $20.00/hr fallback

// Lookup key for the per-(weekday, block) rates Map
export function rateKey(dayOfWeek: number, blockIndex: number): string {
  return `${dayOfWeek}-${blockIndex}`
}

export interface ShiftRateLookup {
  get: (dayOfWeek: number, blockIndex: number) => number
  isBlocked: (dayOfWeek: number, blockIndex: number) => boolean
  all: () => number[]
}

export function buildRateLookup(
  rows: { day_of_week: number; block_index: number; rate_cents: number; is_blocked?: boolean }[],
  defaultRateCents = DEFAULT_RATE_CENTS,
): ShiftRateLookup {
  const rates = new Map<string, number>()
  const blocked = new Set<string>()
  for (const r of rows) {
    rates.set(rateKey(r.day_of_week, r.block_index), r.rate_cents)
    if (r.is_blocked) blocked.add(rateKey(r.day_of_week, r.block_index))
  }
  return {
    get: (dow, idx) => rates.get(rateKey(dow, idx)) ?? defaultRateCents,
    isBlocked: (dow, idx) => blocked.has(rateKey(dow, idx)),
    all: () => Array.from(rates.values()),
  }
}

// Format integer cents as USD, e.g. 2000 -> "$20.00", 4500 -> "$45.00"
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Format minutes as a friendly label, e.g. 720 -> "12:00 PM"
export function minutesToLabel(mins: number): string {
  if (mins >= 1440) return '12:00 AM'
  const h24 = Math.floor(mins / 60)
  const m = mins % 60
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}
