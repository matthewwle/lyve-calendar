import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HostsManager } from '@/components/admin/HostsManager'
import type { Host, Profile } from '@/lib/supabase/types'

export default async function HostsPage() {
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

  const [{ data: hostsData }, { data: profilesData }] = await Promise.all([
    supabase.from('hosts').select('*').order('name'),
    supabase.from('profiles').select('*').order('email'),
  ])

  return (
    <div className="p-6">
      <HostsManager
        initialHosts={(hostsData as Host[] | null) ?? []}
        profiles={(profilesData as Profile[] | null) ?? []}
      />
    </div>
  )
}
