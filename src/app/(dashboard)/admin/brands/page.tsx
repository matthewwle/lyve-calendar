import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BrandsManager } from '@/components/admin/BrandsManager'
import type { Brand, Profile } from '@/lib/supabase/types'

export default async function BrandsPage() {
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

  const [{ data: brandsData }, { data: profilesData }] = await Promise.all([
    supabase.from('brands').select('*').order('name'),
    supabase.from('profiles').select('*').order('email'),
  ])

  return (
    <div className="p-6">
      <BrandsManager
        initialBrands={(brandsData as Brand[] | null) ?? []}
        profiles={(profilesData as Profile[] | null) ?? []}
      />
    </div>
  )
}
