import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { Brand, Host, Producer, Profile, StreamWithRelations } from '@/lib/supabase/types'

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
  const isAdmin = profile?.role === 'admin'

  // Confirm the brand exists; non-admins can still view, RLS hides streams they don't have access to
  const { data: brandData } = await supabase
    .from('brands')
    .select('*')
    .eq('id', brandId)
    .single()

  const brand = brandData as Brand | null
  if (!brand) notFound()

  const [
    { data: streamsData },
    { data: hostsData },
    { data: producersData },
  ] = await Promise.all([
    supabase
      .from('streams')
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .eq('brand_id', brandId)
      .order('start_time'),
    supabase.from('hosts').select('*').order('name'),
    supabase.from('producers').select('*').order('name'),
  ])

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-5 pb-1 flex items-baseline gap-3">
        <h1 className="text-lg font-bold text-foreground">{brand.name}</h1>
        <p className="text-xs text-muted-foreground">Brand calendar</p>
      </div>
      <div className="flex-1 min-h-0">
        <CalendarView
          brandId={brandId}
          initialStreams={(streamsData as StreamWithRelations[] | null) ?? []}
          initialHosts={(hostsData as Host[] | null) ?? []}
          initialProducers={(producersData as Producer[] | null) ?? []}
          isAdmin={isAdmin}
          currentUserId={user.id}
        />
      </div>
    </div>
  )
}
