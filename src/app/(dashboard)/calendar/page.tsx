import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import { resolveRole } from '@/lib/role'
import type { Brand, Profile } from '@/lib/supabase/types'

export default async function CalendarLandingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profileData }, { data: brandsData }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('brands').select('id, name').order('name'),
  ])

  const profile = profileData as Profile | null
  const allBrands = (brandsData as Pick<Brand, 'id' | 'name'>[] | null) ?? []
  const { effectiveIsAdmin } = await resolveRole(profile)

  // Filter brand list by host eligibility for non-admins
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

  if (brands.length > 0) {
    redirect(`/calendar/${brands[0].id}`)
  }

  // Empty state — no brands exist yet
  return (
    <div className="h-full flex items-center justify-center p-6">
      <div className="max-w-sm text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center mx-auto">
          <CalendarDays className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-foreground">No calendars yet</h1>
          <p className="text-sm text-muted-foreground">
            {effectiveIsAdmin
              ? 'Add your first brand to create a calendar.'
              : 'Ask an admin to add a brand to get started.'}
          </p>
        </div>
        {effectiveIsAdmin && (
          <Button asChild size="sm" className="gap-2">
            <Link href="/admin/brands">
              <Plus className="w-4 h-4" />
              Add Brand
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
