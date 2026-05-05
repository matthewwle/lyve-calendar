import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { MyShiftsList, type ShiftRow } from '@/components/my-shifts/MyShiftsList'
import { nowPtAsUtc } from '@/lib/utils'
import { buildPayoutContextByBrand, computeShiftPayoutCents } from '@/lib/payout'
import type { Brand, BrandShiftRate, BrandShiftOverride } from '@/lib/supabase/types'

export default async function MyShiftsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Find the host record for the current user
  const { data: myHost } = await supabase
    .from('hosts')
    .select('id, name')
    .eq('user_id', user.id)
    .maybeSingle()

  // Not linked to a host → empty state
  if (!myHost) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-sm text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto">
            <ClipboardList className="w-6 h-6 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-foreground">No host profile linked</h1>
            <p className="text-sm text-muted-foreground">
              Ask an admin to link your account to a host profile so you can book and view shifts.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Pull every stream this host is on, joined with brand + producer
  const { data: streamsData } = await supabase
    .from('streams')
    .select('id, start_time, end_time, brand_id, notes, brand:brands(id, name, block_size_minutes, day_start_minutes), producer:producers(id, name)')
    .eq('host_id', myHost.id)
    .order('start_time')

  type StreamRow = {
    id: string
    start_time: string
    end_time: string
    brand_id: string
    notes: string | null
    brand: { id: string; name: string; block_size_minutes: number; day_start_minutes: number } | { id: string; name: string; block_size_minutes: number; day_start_minutes: number }[] | null
    producer: { id: string; name: string } | { id: string; name: string }[] | null
  }
  const rawStreams = (streamsData as unknown as StreamRow[] | null) ?? []

  // Normalize join shape (Supabase returns arrays for joined relations)
  const streams = rawStreams.map(s => ({
    id: s.id,
    start_time: s.start_time,
    end_time: s.end_time,
    brand_id: s.brand_id,
    notes: s.notes,
    brand: Array.isArray(s.brand) ? s.brand[0] ?? null : s.brand,
    producer: Array.isArray(s.producer) ? s.producer[0] ?? null : s.producer,
  })).filter(s => s.brand)

  // Batch-fetch the rate rows + per-date overrides for every brand the host is on
  const brandIds = Array.from(new Set(streams.map(s => s.brand_id)))
  const [{ data: ratesData }, { data: overridesData }] = brandIds.length > 0
    ? await Promise.all([
        supabase.from('brand_shift_rates').select('*').in('brand_id', brandIds),
        supabase.from('brand_shift_overrides').select('*').in('brand_id', brandIds),
      ])
    : [
        { data: [] as BrandShiftRate[] },
        { data: [] as BrandShiftOverride[] },
      ]

  // Build per-brand payout context (rates + overrides) once
  const ctxByBrand = buildPayoutContextByBrand(
    brandIds,
    (ratesData as BrandShiftRate[] | null) ?? [],
    (overridesData as BrandShiftOverride[] | null) ?? [],
  )

  // Compute per-shift payout via the shared helper so totals match what hosts
  // see in the calendar and admins see in the monthly Dashboard.
  const now = nowPtAsUtc().getTime()
  const shifts: ShiftRow[] = streams.map(s => {
    const brand = s.brand as Pick<Brand, 'id' | 'name' | 'block_size_minutes' | 'day_start_minutes'>
    const ctx = ctxByBrand.get(brand.id)!
    const { rateCents, totalCents } = computeShiftPayoutCents(s.start_time, s.end_time, brand, ctx)
    return {
      id: s.id,
      brandId: brand.id,
      brandName: brand.name,
      producerName: s.producer?.name ?? null,
      startISO: s.start_time,
      endISO: s.end_time,
      rateCents,
      totalCents,
      isPast: new Date(s.end_time).getTime() <= now,
      notes: s.notes,
    }
  })

  return (
    <div className="h-full overflow-auto">
      <MyShiftsList hostName={myHost.name} shifts={shifts} />
    </div>
  )
}
