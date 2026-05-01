import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { HostsManager } from '@/components/admin/HostsManager'
import { resolveRole } from '@/lib/role'
import type { Brand, BrandHost, Host, Profile } from '@/lib/supabase/types'

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
  const { effectiveIsAdmin } = await resolveRole(profile)
  if (!effectiveIsAdmin) redirect('/calendar')

  const [
    { data: hostsData },
    { data: profilesData },
    { data: brandsData },
    { data: brandHostsData },
  ] = await Promise.all([
    supabase.from('hosts').select('*').order('name'),
    supabase.from('profiles').select('*').order('email'),
    supabase.from('brands').select('*').order('name'),
    supabase.from('brand_hosts').select('*'),
  ])

  return (
    <div className="p-6">
      <HostsManager
        initialHosts={(hostsData as Host[] | null) ?? []}
        profiles={(profilesData as Profile[] | null) ?? []}
        brands={(brandsData as Brand[] | null) ?? []}
        initialBrandHosts={(brandHostsData as BrandHost[] | null) ?? []}
      />
    </div>
  )
}
