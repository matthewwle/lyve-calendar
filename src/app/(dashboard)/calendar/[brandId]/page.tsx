import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/CalendarView'
import { CalendarHeader } from '@/components/calendar/CalendarHeader'
import { resolveRole } from '@/lib/role'
import type {
  Brand,
  BrandShiftRate,
  BrandShiftOverride,
  Host,
  Producer,
  Profile,
  StreamWithRelations,
} from '@/lib/supabase/types'

interface BrandCalendarPageProps {
  params: Promise<{ brandId: string }>
}

export default async function BrandCalendarPage({ params }: BrandCalendarPageProps) {
  const { brandId } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  const { effectiveIsAdmin: isAdmin } = await resolveRole(profile)

  const { data: brandData } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  const brand = brandData as Brand | null
  if (!brand) notFound()

  // Eligibility: non-admins must be linked to a host that's assigned to this brand
  if (!isAdmin) {
    const { data: myHost } = await supabase
      .from('hosts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!myHost) {
      redirect('/calendar')
    } else {
      const { data: link } = await supabase
        .from('brand_hosts')
        .select('brand_id')
        .eq('brand_id', brandId)
        .eq('host_id', myHost.id)
        .maybeSingle()
      if (!link) redirect('/calendar')
    }
  }

  const [
    { data: streamsData },
    { data: hostsData },
    { data: producersData },
    { data: ratesData },
    { data: currentHostData },
  ] = await Promise.all([
    supabase
      .from('streams')
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .eq('brand_id', brandId)
      .order('start_time'),
    supabase.from('hosts').select('*').order('name'),
    supabase.from('producers').select('*').order('name'),
    supabase.from('brand_shift_rates').select('*').eq('brand_id', brandId),
    supabase.from('hosts').select('id,name').eq('user_id', user.id).maybeSingle(),
  ])

  const shiftRates = (ratesData as BrandShiftRate[] | null) ?? []

  // Per-date rate overrides (any week admin has customized away from the default)
  const { data: overridesData } = await supabase
    .from('brand_shift_overrides')
    .select('*')
    .eq('brand_id', brandId)
  const shiftOverrides = (overridesData as BrandShiftOverride[] | null) ?? []
  const currentHost = (currentHostData as { id: string; name: string } | null) ?? null

  // Cross-brand conflict overlay: this host's existing bookings on OTHER brands
  // so we can grey them out on this calendar with "Already booked for X".
  type Conflict = { start_time: string; end_time: string; brandName: string }
  let conflicts: Conflict[] = []
  if (currentHost) {
    const { data: conflictRows } = await supabase
      .from('streams')
      .select('start_time, end_time, brand:brands(name)')
      .eq('host_id', currentHost.id)
      .neq('brand_id', brandId)
      .gte('end_time', new Date().toISOString())

    type ConflictRow = {
      start_time: string
      end_time:   string
      brand: { name: string } | { name: string }[] | null
    }
    conflicts = ((conflictRows ?? []) as unknown as ConflictRow[])
      .map(r => {
        const brandName = Array.isArray(r.brand) ? r.brand[0]?.name : r.brand?.name
        return brandName ? { start_time: r.start_time, end_time: r.end_time, brandName } : null
      })
      .filter((c): c is Conflict => c !== null)
  }

  return (
    <div className="h-full flex flex-col">
      <CalendarHeader brand={brand} shiftRates={shiftRates} canEdit={isAdmin} />
      <div className="flex-1 min-h-0">
        <CalendarView
          brandId={brandId}
          initialStreams={(streamsData as StreamWithRelations[] | null) ?? []}
          initialHosts={(hostsData as Host[] | null) ?? []}
          initialProducers={(producersData as Producer[] | null) ?? []}
          initialShiftRates={shiftRates}
          initialShiftOverrides={shiftOverrides}
          shift={{
            blockSizeMinutes: brand.block_size_minutes,
            dayStartMinutes:  brand.day_start_minutes,
            dayEndMinutes:    brand.day_end_minutes,
          }}
          isAdmin={isAdmin}
          currentUserId={user.id}
          currentHost={currentHost}
          conflicts={conflicts}
        />
      </div>
    </div>
  )
}
