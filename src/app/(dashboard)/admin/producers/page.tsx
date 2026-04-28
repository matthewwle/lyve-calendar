import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ProducersManager } from '@/components/admin/ProducersManager'
import type { Producer, Profile } from '@/lib/supabase/types'

export default async function ProducersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  if (profile?.role !== 'admin') redirect('/calendar')

  const [{ data: producersData }, { data: profilesData }] = await Promise.all([
    supabase.from('producers').select('*').order('name'),
    supabase.from('profiles').select('*').order('email'),
  ])

  return (
    <div className="p-6">
      <ProducersManager
        initialProducers={(producersData as Producer[] | null) ?? []}
        profiles={(profilesData as Profile[] | null) ?? []}
      />
    </div>
  )
}
