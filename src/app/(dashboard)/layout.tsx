import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/sidebar/Sidebar'
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
  const brands = (brandsData as Brand[] | null) ?? []

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar profile={profile} brands={brands} />
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
