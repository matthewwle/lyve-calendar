import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { Topbar } from '@/components/topbar/Topbar'
import { resolveRole, resolveUserRoles } from '@/lib/role'
import { isProfileComplete } from '@/lib/profile'
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

  // Forced onboarding gate: incomplete profiles can't reach the app
  if (!isProfileComplete(profile)) {
    redirect('/onboarding/profile')
  }

  const allBrands = (brandsData as Brand[] | null) ?? []
  const { actualIsAdmin, viewingAsHost } = await resolveRole(profile)
  const effectiveIsAdmin = actualIsAdmin && !viewingAsHost

  // Resolve all role memberships (host / producer / moderator) in one shot.
  const userRoles = await resolveUserRoles(supabase, user.id, effectiveIsAdmin)
  const hasHostProfile = userRoles.isHost
  const hasBackstageRole = userRoles.isProducer || userRoles.isModerator

  // Brand visibility:
  //   admin                → every brand
  //   producer/moderator   → every brand (read-only across the app)
  //   host only            → brands their hosts row is linked to via brand_hosts
  //   none                 → empty
  let brands = allBrands
  if (!effectiveIsAdmin && !hasBackstageRole) {
    if (!userRoles.hostId) {
      brands = []
    } else {
      const { data: myBrandLinks } = await supabase
        .from('brand_hosts')
        .select('brand_id')
        .eq('host_id', userRoles.hostId)
      const allowed = new Set((myBrandLinks ?? []).map(r => r.brand_id))
      brands = allBrands.filter(b => allowed.has(b.id))
    }
  }

  // Avatar served via our own API proxy — bypasses the Cloudflare/Supabase
  // CDN edge case where a Range probe can poison the cache with 1 byte.
  const headshotUrl = profile?.headshot_path
    ? `/api/headshot/${user.id}`
    : null

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        profile={profile}
        brands={brands}
        actualIsAdmin={actualIsAdmin}
        viewingAsHost={viewingAsHost}
        hasHostProfile={hasHostProfile}
        isProducer={userRoles.isProducer}
        isModerator={userRoles.isModerator}
        headshotUrl={headshotUrl}
        userId={user.id}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Topbar userId={user.id} />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
