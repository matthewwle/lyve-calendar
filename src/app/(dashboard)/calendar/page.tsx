import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CalendarView } from '@/components/calendar/CalendarView'
import type { Host, Brand, Producer, Profile, StreamWithRelations } from '@/lib/supabase/types'

export default async function CalendarPage() {
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

  const [
    { data: streamsData },
    { data: hostsData },
    { data: brandsData },
    { data: producersData },
  ] = await Promise.all([
    supabase
      .from('streams')
      .select('*, host:hosts(id,name), brand:brands(id,name), producer:producers(id,name)')
      .order('start_time'),
    supabase.from('hosts').select('*').order('name'),
    supabase.from('brands').select('*').order('name'),
    supabase.from('producers').select('*').order('name'),
  ])

  return (
    <div className="h-full">
      <CalendarView
        initialStreams={(streamsData as StreamWithRelations[] | null) ?? []}
        initialHosts={(hostsData as Host[] | null) ?? []}
        initialBrands={(brandsData as Brand[] | null) ?? []}
        initialProducers={(producersData as Producer[] | null) ?? []}
        isAdmin={isAdmin}
        currentUserId={user.id}
      />
    </div>
  )
}
