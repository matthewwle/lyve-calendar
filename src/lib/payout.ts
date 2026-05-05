import {
  buildRateLookup,
  DEFAULT_RATE_CENTS,
  formatPT,
  utcToPt,
  type ShiftRateLookup,
} from '@/lib/utils'
import type { BrandShiftOverride, BrandShiftRate } from '@/lib/supabase/types'

// ============================================================
// Per-shift payout math, shared between My Shifts and the admin
// monthly Dashboard. Mirrors the calendar's effective-rate logic
// so totals match what hosts see on each cell.
// ============================================================

export interface BrandShiftConfig {
  id: string
  block_size_minutes: number
  day_start_minutes: number
}

export interface PayoutRateContext {
  /** Per-(weekday, block) defaults for this brand */
  lookup: ShiftRateLookup
  /** Per-date overrides keyed by `${yyyy-MM-dd}-${blockIndex}` */
  overrides: Map<string, number>
}

/** Resolve the effective per-hour rate (in cents) for a single shift slot. */
export function resolveShiftRateCents(
  startTime: Date | string,
  brand: BrandShiftConfig,
  ctx: PayoutRateContext,
): { rateCents: number; blockIndex: number; dow: number; dateKey: string } {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime
  const ptStart = utcToPt(start)
  const slotMins = ptStart.getHours() * 60 + ptStart.getMinutes()
  const blockIndex = Math.round((slotMins - brand.day_start_minutes) / brand.block_size_minutes)
  const dow = ptStart.getDay()
  const dateKey = formatPT(start, 'yyyy-MM-dd')

  const overrideRate = ctx.overrides.get(`${dateKey}-${blockIndex}`)
  const rateCents = overrideRate ?? ctx.lookup.get(dow, blockIndex)
  return { rateCents, blockIndex, dow, dateKey }
}

/** Total shift payout in cents = rate × duration (hours). */
export function computeShiftPayoutCents(
  startTime: Date | string,
  endTime: Date | string,
  brand: BrandShiftConfig,
  ctx: PayoutRateContext,
): { rateCents: number; totalCents: number; durationMinutes: number } {
  const start = typeof startTime === 'string' ? new Date(startTime) : startTime
  const end = typeof endTime === 'string' ? new Date(endTime) : endTime
  const { rateCents } = resolveShiftRateCents(start, brand, ctx)
  const durationMinutes = (end.getTime() - start.getTime()) / 60_000
  const totalCents = Math.round((rateCents * durationMinutes) / 60)
  return { rateCents, totalCents, durationMinutes }
}

/**
 * Build a per-brand rate context map from raw rate + override rows. Useful
 * for pages that aggregate across many brands (Dashboard, My Shifts).
 */
export function buildPayoutContextByBrand(
  brandIds: string[],
  rateRows: BrandShiftRate[],
  overrideRows: BrandShiftOverride[],
): Map<string, PayoutRateContext> {
  const byBrand = new Map<string, PayoutRateContext>()
  for (const id of brandIds) {
    const rates = rateRows.filter(r => r.brand_id === id)
    byBrand.set(id, { lookup: buildRateLookup(rates), overrides: new Map() })
  }
  for (const o of overrideRows) {
    const ctx = byBrand.get(o.brand_id)
    if (!ctx) {
      byBrand.set(o.brand_id, {
        lookup: buildRateLookup([], DEFAULT_RATE_CENTS),
        overrides: new Map([[`${o.shift_date}-${o.block_index}`, o.rate_cents]]),
      })
    } else {
      ctx.overrides.set(`${o.shift_date}-${o.block_index}`, o.rate_cents)
    }
  }
  return byBrand
}
