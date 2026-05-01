import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { resolveRole } from '@/lib/role'
import type { Brand, Profile } from '@/lib/supabase/types'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profileData }, { data: brandsData }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('brands').select('*').order('name'),
  ])

  const profile = profileData as Profile | null
  const allBrands = (brandsData as Brand[] | null) ?? []
  const { actualIsAdmin, viewingAsHost } = await resolveRole(profile)
  const effectiveIsAdmin = actualIsAdmin && !viewingAsHost

  // Non-admins (and admins viewing as host) only see brands their linked host
  // has access to. If they aren't linked to a host, they see nothing.
  let brands = allBrands
  if (!effectiveIsAdmin) {
    const { data: myHost } = await supabase
      .from('hosts')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!myHost) {
      brands = []
    } else {
      const { data: myBrandLinks } = await supabase
        .from('brand_hosts')
        .select('brand_id')
        .eq('host_id', myHost.id)
      const allowed = new Set((myBrandLinks ?? []).map(r => r.brand_id))
      brands = allBrands.filter(b => allowed.has(b.id))
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        profile={profile}
        brands={brands}
        actualIsAdmin={actualIsAdmin}
        viewingAsHost={viewingAsHost}
      />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
