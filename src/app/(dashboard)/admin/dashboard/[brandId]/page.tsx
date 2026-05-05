import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { resolveRole } from '@/lib/role'
import { nowPtAsUtc } from '@/lib/utils'
import {
  BrandDashboardView,
  type BrandDetailData,
  type BrandShiftDetail,
  type HostBreakdown,
} from '@/components/admin/BrandDashboardView'
import type { Brand, Profile } from '@/lib/supabase/types'

interface BrandDashboardPageProps {
  params: Promise<{ brandId: string }>
  searchParams: Promise<{ month?: string }>
}

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

export default async function BrandDashboardDetailPage({ params, searchParams }: BrandDashboardPageProps) {
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

  const { brandId } = await params
  const { month: monthParam } = await searchParams
  const { year, month, key: monthKey } = parseMonth(monthParam)

  const monthStart = new Date(Date.UTC(year, month, 1))
  const monthEnd = new Date(Date.UTC(year, month + 1, 1))

  const { data: brandData } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  const brand = brandData as Brand | null
  if (!brand) notFound()

  const { data: streamsData } = await supabase
    .from('streams')
    .select('id, brand_id, host_id, start_time, end_time, host:hosts(id, name)')
    .eq('brand_id', brandId)
    .not('host_id', 'is', null)
    .gte('start_time', monthStart.toISOString())
    .lt('start_time', monthEnd.toISOString())
    .order('start_time')

  type StreamRow = {
    id: string
    brand_id: string
    host_id: string | null
    start_time: string
    end_time: string
    host: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const streams = ((streamsData ?? []) as unknown as StreamRow[])
    .map(s => ({ ...s, host: Array.isArray(s.host) ? s.host[0] ?? null : s.host }))
    .filter(s => s.host_id)

  const nowMs = nowPtAsUtc().getTime()
  let bookedMinutes = 0
  let completedMinutes = 0
  const hostMap = new Map<string, { name: string; minutes: number; shifts: number }>()

  const shiftDetails: BrandShiftDetail[] = streams.map(s => {
    const start = new Date(s.start_time).getTime()
    const end = new Date(s.end_time).getTime()
    const durationMinutes = (end - start) / 60_000

    bookedMinutes += durationMinutes
    const isPast = end <= nowMs
    if (isPast) completedMinutes += durationMinutes

    const hostName = s.host?.name ?? 'Unknown'
    const hostId = s.host_id!
    const prev = hostMap.get(hostId) ?? { name: hostName, minutes: 0, shifts: 0 }
    prev.minutes += durationMinutes
    prev.shifts += 1
    hostMap.set(hostId, prev)

    return {
      id: s.id,
      hostId,
      hostName,
      startISO: s.start_time,
      endISO: s.end_time,
      durationMinutes,
      isPast,
    }
  })

  const hostBreakdown: HostBreakdown[] = Array.from(hostMap.entries())
    .map(([hostId, h]) => ({
      hostId,
      hostName: h.name,
      hours: h.minutes / 60,
      shifts: h.shifts,
    }))
    .sort((a, b) => b.hours - a.hours)

  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const availableHoursPerDay = Math.max(0, (brand.day_end_minutes - brand.day_start_minutes) / 60)
  const availableMonthHours = daysInMonth * availableHoursPerDay
  const bookedHours = bookedMinutes / 60

  const data: BrandDetailData = {
    brandId: brand.id,
    brandName: brand.name,
    brandLogoPath: brand.logo_path,
    bookedHours,
    completedHours: completedMinutes / 60,
    shiftCount: shiftDetails.length,
    uniqueHosts: hostMap.size,
    avgShiftMinutes: shiftDetails.length > 0 ? bookedMinutes / shiftDetails.length : 0,
    fillRate: availableMonthHours > 0 ? bookedHours / availableMonthHours : 0,
    hosts: hostBreakdown,
    shifts: shiftDetails,
  }

  return (
    <div className="p-6">
      <BrandDashboardView monthKey={monthKey} data={data} />
    </div>
  )
}
