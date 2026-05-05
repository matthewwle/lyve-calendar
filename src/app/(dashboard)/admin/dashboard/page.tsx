import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveRole } from '@/lib/role'
import { nowPtAsUtc } from '@/lib/utils'
import { DashboardView, type BrandRow } from '@/components/admin/DashboardView'
import type { Brand, Profile } from '@/lib/supabase/types'

interface DashboardPageProps {
  searchParams: Promise<{ month?: string }>
}

/** Parse YYYY-MM into a PT-naive month start; fall back to current PT month. */
function parseMonth(input: string | undefined): { year: number; month: number; key: string } {
  if (input && /^\d{4}-\d{2}$/.test(input)) {
    const [y, m] = input.split('-').map(Number)
    if (m >= 1 && m <= 12) return { year: y, month: m - 1, key: input }
  }
  const now = nowPtAsUtc()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  return { year: y, month: m, key: `${y}-${String(m + 1).padStart(2, '0')}` }
}

export default async function AdminDashboardPage({ searchParams }: DashboardPageProps) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  const { effectiveIsAdmin } = await resolveRole(profile)
  if (!effectiveIsAdmin) redirect('/calendar')

  const { month: monthParam } = await searchParams
  const { year, month, key: monthKey } = parseMonth(monthParam)

  // PT-naive month bounds: stored UTC fields ARE the PT wall-clock
  const monthStart = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 1))

  const [{ data: brandsData }, { data: streamsData }] = await Promise.all([
    supabase.from('brands').select('*').order('name'),
    supabase
      .from('streams')
      .select('id, brand_id, host_id, start_time, end_time')
      .not('host_id', 'is', null)
      .gte('start_time', monthStart.toISOString())
      .lt('start_time', monthEnd.toISOString()),
  ])

  const brands = (brandsData as Brand[] | null) ?? []

  type StreamAggRow = {
    id: string
    brand_id: string
    host_id: string | null
    start_time: string
    end_time: string
  }
  const streams = ((streamsData ?? []) as unknown as StreamAggRow[])

  const nowMs = nowPtAsUtc().getTime()

  // Aggregate per brand
  const rows: BrandRow[] = brands.map(b => {
    let bookedMinutes = 0
    let completedMinutes = 0
    let shiftCount = 0
    const hostSet = new Set<string>()

    for (const s of streams) {
      if (s.brand_id !== b.id) continue
      if (!s.host_id) continue
      const start = new Date(s.start_time).getTime()
      const end = new Date(s.end_time).getTime()
      const durationMinutes = (end - start) / 60_000

      bookedMinutes += durationMinutes
      shiftCount += 1
      hostSet.add(s.host_id)
      if (end <= nowMs) completedMinutes += durationMinutes
    }

    // Available block-hours for the month (for fill-rate). Number of days in
    // this month × hours per day for this brand.
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
    const availableHoursPerDay = Math.max(0, (b.day_end_minutes - b.day_start_minutes) / 60)
    const availableMonthHours = daysInMonth * availableHoursPerDay

    const bookedHours = bookedMinutes / 60
    const completedHours = completedMinutes / 60
    const fillRate = availableMonthHours > 0 ? bookedHours / availableMonthHours : 0

    return {
      brandId: b.id,
      brandName: b.name,
      brandLogoPath: b.logo_path,
      bookedHours,
      completedHours,
      shiftCount,
      uniqueHosts: hostSet.size,
      avgShiftMinutes: shiftCount > 0 ? bookedMinutes / shiftCount : 0,
      fillRate,
    }
  })

  return (
    <div className="p-6">
      <DashboardView monthKey={monthKey} rows={rows} />
    </div>
  )
}
